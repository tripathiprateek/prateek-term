/**
 * tests/renderer/serial-filter.test.js
 *
 * Source-contract tests for the runtime serial output filter.
 * Covers: writeSerialFiltered, serialLineMatchesFilter, enableSerialFilter,
 * disableSerialFilter, updateSerialFilterStats, and context-menu integration.
 *
 * GitHub issue: #1 — feat: runtime serial output filter (text + regex)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/renderer/js/app.js');
const src  = fs.readFileSync(SRC, 'utf-8');

// ─── helper: extract and eval a named function from app.js ────────────────
function extractFn(name) {
  // Match: function <name>(...) { ... } (handles nested braces via brace counting)
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in app.js`);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return src.slice(start, i);
}

// Evaluate filter helpers in an isolated scope (no DOM, no Electron)
const helperCode = [
  extractFn('writeSerialFiltered'),
  extractFn('serialLineMatchesFilter'),
  extractFn('updateSerialFilterStats'),
  extractFn('enableSerialFilter'),
  extractFn('disableSerialFilter'),
].join('\n\n');

// eslint-disable-next-line no-new-func
const helpers = new Function(`
  ${helperCode}
  return { writeSerialFiltered, serialLineMatchesFilter, updateSerialFilterStats };
`)();

const { writeSerialFiltered, serialLineMatchesFilter, updateSerialFilterStats } = helpers;

// ─── makeTab: minimal serial tab stub ─────────────────────────────────────
function makeTab(overrides = {}) {
  const written = [];
  return {
    isSerial:         true,
    filterActive:     true,
    filterPattern:    '',
    filterIsRegex:    false,
    filterLineBuffer: '',
    filterMatchCount: 0,
    filterTotalCount: 0,
    _filterRegex:     null,
    filterBar:        null,
    term:             { write: (d) => written.push(d) },
    _written:         written,
    ...overrides,
  };
}

// ─── serialLineMatchesFilter ───────────────────────────────────────────────

describe('serialLineMatchesFilter — text mode', () => {
  test('matches substring (case-insensitive)', () => {
    const tab = makeTab({ filterPattern: 'hello', filterIsRegex: false });
    expect(serialLineMatchesFilter('Hello World', tab)).toBe(true);
    expect(serialLineMatchesFilter('HELLO', tab)).toBe(true);
    expect(serialLineMatchesFilter('noise line', tab)).toBe(false);
  });

  test('empty pattern matches every line', () => {
    const tab = makeTab({ filterPattern: '', filterIsRegex: false });
    expect(serialLineMatchesFilter('anything', tab)).toBe(true);
    expect(serialLineMatchesFilter('', tab)).toBe(true);
  });

  test('strips ANSI escape codes before matching', () => {
    const tab = makeTab({ filterPattern: 'error', filterIsRegex: false });
    // Line contains ANSI red colour code around the word
    const ansiLine = '\x1b[31mERROR\x1b[0m: disk full';
    expect(serialLineMatchesFilter(ansiLine, tab)).toBe(true);
  });

  test('strips carriage return before matching', () => {
    const tab = makeTab({ filterPattern: 'ok', filterIsRegex: false });
    expect(serialLineMatchesFilter('status ok\r', tab)).toBe(true);
  });
});

describe('serialLineMatchesFilter — regex mode', () => {
  test('matches regex pattern', () => {
    const tab = makeTab({
      filterIsRegex: true,
      _filterRegex: /^\d+ms$/i,
    });
    expect(serialLineMatchesFilter('123ms', tab)).toBe(true);
    expect(serialLineMatchesFilter('noise', tab)).toBe(false);
  });

  test('null _filterRegex (invalid regex) shows all lines', () => {
    const tab = makeTab({
      filterIsRegex: true,
      _filterRegex: null,
    });
    expect(serialLineMatchesFilter('anything', tab)).toBe(true);
    expect(serialLineMatchesFilter('', tab)).toBe(true);
  });

  test('anchored regex ^ERROR only matches start of line', () => {
    const tab = makeTab({
      filterIsRegex: true,
      _filterRegex: /^ERROR/i,
    });
    expect(serialLineMatchesFilter('ERROR: disk full', tab)).toBe(true);
    expect(serialLineMatchesFilter('no error here', tab)).toBe(false);
  });
});

// ─── writeSerialFiltered ──────────────────────────────────────────────────

describe('writeSerialFiltered', () => {
  test('forwards only matching lines to term.write', () => {
    const tab = makeTab({ filterPattern: 'hello' });
    writeSerialFiltered(tab, 'hello world\nnoise line\nhello again\n');
    expect(tab._written).toEqual(['hello world\n', 'hello again\n']);
  });

  test('counts total and matched lines correctly', () => {
    const tab = makeTab({ filterPattern: 'x' });
    writeSerialFiltered(tab, 'x1\ny1\nx2\ny2\n');
    expect(tab.filterTotalCount).toBe(4);
    expect(tab.filterMatchCount).toBe(2);
  });

  test('buffers incomplete lines across chunks', () => {
    const tab = makeTab({ filterPattern: 'hello' });
    // First chunk ends mid-line
    writeSerialFiltered(tab, 'hel');
    expect(tab._written).toHaveLength(0);
    expect(tab.filterLineBuffer).toBe('hel');

    // Second chunk completes the line
    writeSerialFiltered(tab, 'lo world\n');
    expect(tab._written).toEqual(['hello world\n']);
    expect(tab.filterLineBuffer).toBe('');
  });

  test('drops non-matching lines silently', () => {
    const tab = makeTab({ filterPattern: 'keep' });
    writeSerialFiltered(tab, 'noise\nkeep this\nmore noise\n');
    expect(tab._written).toEqual(['keep this\n']);
    expect(tab.filterTotalCount).toBe(3);
    expect(tab.filterMatchCount).toBe(1);
  });

  test('empty pattern passes all lines through', () => {
    const tab = makeTab({ filterPattern: '' });
    writeSerialFiltered(tab, 'line1\nline2\n');
    expect(tab._written).toEqual(['line1\n', 'line2\n']);
  });
});

// ─── updateSerialFilterStats ──────────────────────────────────────────────

describe('updateSerialFilterStats', () => {
  test('sets stats element text to matched/total', () => {
    let text = '';
    const statsEl = { textContent: '' };
    const tab = makeTab({
      filterMatchCount: 7,
      filterTotalCount: 20,
      filterBar: { querySelector: () => statsEl },
    });
    updateSerialFilterStats(tab);
    expect(statsEl.textContent).toBe('7/20');
  });

  test('gracefully handles null filterBar', () => {
    const tab = makeTab({ filterBar: null, filterMatchCount: 1, filterTotalCount: 5 });
    expect(() => updateSerialFilterStats(tab)).not.toThrow();
  });
});

// ─── Source-contract: function definitions exist in app.js ────────────────

describe('source-contract: filter functions defined in app.js', () => {
  test('writeSerialFiltered is defined', () => {
    expect(src).toMatch(/function writeSerialFiltered\s*\(/);
  });

  test('serialLineMatchesFilter is defined', () => {
    expect(src).toMatch(/function serialLineMatchesFilter\s*\(/);
  });

  test('enableSerialFilter is defined', () => {
    expect(src).toMatch(/function enableSerialFilter\s*\(/);
  });

  test('disableSerialFilter is defined', () => {
    expect(src).toMatch(/function disableSerialFilter\s*\(/);
  });

  test('updateSerialFilterStats is defined', () => {
    expect(src).toMatch(/function updateSerialFilterStats\s*\(/);
  });
});

// ─── Source-contract: serial data handler routes through filter ───────────

describe('source-contract: serial data handler uses writeSerialFiltered', () => {
  test('onSerialData calls writeSerialFiltered when filter is active', () => {
    expect(src).toMatch(/writeSerialFiltered\s*\(\s*tab\s*,\s*data\s*\)/);
  });

  test('logWrite is called before filter check (raw data always logged)', () => {
    // logWrite must appear before writeSerialFiltered in the onSerialData handler
    const logIdx    = src.indexOf('window.terminalAPI.logWrite(tab.logId, data)');
    const filterIdx = src.indexOf('writeSerialFiltered(tab, data)');
    expect(logIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeLessThan(filterIdx);
  });
});

// ─── Source-contract: context menu includes filter toggle for serial tabs ──

describe('source-contract: context menu filter toggle', () => {
  test('ctx-filter-toggle button rendered when tab.isSerial', () => {
    expect(src).toMatch(/ctx-filter-toggle/);
  });

  test('filter toggle calls enableSerialFilter or disableSerialFilter', () => {
    expect(src).toMatch(/enableSerialFilter\s*\(\s*tab\s*\)/);
    expect(src).toMatch(/disableSerialFilter\s*\(\s*tab\s*\)/);
  });

  test('filter toggle only rendered for serial tabs (guarded by tab.isSerial)', () => {
    // The ctx-filter-toggle must be inside a tab.isSerial conditional
    expect(src).toMatch(/tab\.isSerial[\s\S]{0,60}ctx-filter-toggle/);
  });
});

// ─── Source-contract: .terminal-viewport wrapper exists ───────────────────

describe('source-contract: .terminal-viewport DOM element created', () => {
  test('terminal-viewport class created in app.js', () => {
    expect(src).toMatch(/terminal-viewport/);
  });

  test('term.open targets viewport, not pane directly', () => {
    expect(src).toMatch(/term\.open\s*\(\s*viewport\s*\)/);
  });
});
