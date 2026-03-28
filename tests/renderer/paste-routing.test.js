'use strict';
/**
 * tests/renderer/paste-routing.test.js
 *
 * Regression tests for paste handling.
 *
 * BUG-003: Double-paste / paste corruption.
 *   - Electron's menu `role:paste` fires one paste event.
 *   - xterm's internal Cmd+V handler also fired → TWO pastes of the same
 *     content.  For a multi-line Python script this interleaved in the PTY
 *     buffer producing garbled output and SyntaxErrors.
 *
 * BUG-004: Context-menu and middle-click paste used sendInput() directly,
 *   bypassing xterm's term.paste() which is the only path that wraps content
 *   in bracketed-paste sequences (\x1b[200~…\x1b[201~).  Without bracketing
 *   the shell echoed each character while the next arrived, corrupting output.
 *
 * Strategy: source-contract tests — parse app.js and assert the correct
 * patterns are present / absent.  This catches regressions without requiring
 * a running Electron instance.
 */

const fs   = require('fs');
const path = require('path');

const APP_JS = path.resolve(__dirname, '../../src/renderer/js/app.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(APP_JS, 'utf8');
});

// ---------------------------------------------------------------------------
// BUG-003 — Cmd+V must return false from attachCustomKeyEventHandler
// ---------------------------------------------------------------------------

describe('Cmd+V double-paste prevention (BUG-003)', () => {
  test('attachCustomKeyEventHandler returns false for Cmd+V', () => {
    // The handler must short-circuit xterm's own Cmd+V processing.
    // Look for: if (e.metaKey && e.key === 'v') { return false; }
    expect(source).toMatch(/e\.metaKey\s*&&\s*e\.key\s*===\s*'v'/);
    // Verify the branch ends with return false (blocks xterm's internal handler)
    const cmdVBlock = source.match(/e\.metaKey\s*&&\s*e\.key\s*===\s*'v'[\s\S]{0,100}return false/);
    expect(cmdVBlock).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BUG-004 — Middle-click paste must use term.paste()
// ---------------------------------------------------------------------------

describe('Middle-click paste uses term.paste() (BUG-004)', () => {
  // Extract the auxclick handler section
  const getAuxclickSection = (src) => {
    const start = src.indexOf("e.button !== 1");
    if (start === -1) return '';
    // Grab ~30 lines from that point
    return src.slice(start, start + 800);
  };

  test('middle-click handler calls term.paste(text) for PTY connections', () => {
    const section = getAuxclickSection(source);
    expect(section).toContain('term.paste(');
  });

  test('middle-click handler does NOT call sendInput(tab.ptyId, text) directly', () => {
    const section = getAuxclickSection(source);
    // sendInput(tab.ptyId, text) must NOT appear — it bypasses bracketed paste
    expect(section).not.toMatch(/sendInput\(tab\.ptyId,\s*text\)/);
  });

  test('middle-click handler still uses serialWrite for serial connections', () => {
    const section = getAuxclickSection(source);
    expect(section).toContain('serialWrite');
  });
});

// ---------------------------------------------------------------------------
// BUG-004 — Context-menu paste must use term.paste()
// ---------------------------------------------------------------------------

describe('Context-menu paste uses term.paste() (BUG-004)', () => {
  // Extract the sendText function
  const getSendTextFn = (src) => {
    const start = src.indexOf('const sendText = (text)');
    if (start === -1) return '';
    return src.slice(start, start + 400);
  };

  test('sendText function calls term.paste(text) for PTY connections', () => {
    const section = getSendTextFn(source);
    expect(section).toContain('term.paste(');
  });

  test('sendText does NOT call sendInput(tab.ptyId, text) directly', () => {
    const section = getSendTextFn(source);
    expect(section).not.toMatch(/sendInput\(tab\.ptyId,\s*text\)/);
  });

  test('sendText still uses serialWrite for serial connections', () => {
    const section = getSendTextFn(source);
    expect(section).toContain('serialWrite');
  });
});

// ---------------------------------------------------------------------------
// Cmd+R block — must not reload the page and wipe terminal sessions
// ---------------------------------------------------------------------------

describe('Cmd+R page-reload block', () => {
  const MAIN_JS = path.resolve(__dirname, '../../src/main/main.js');
  let mainSource;

  beforeAll(() => {
    mainSource = fs.readFileSync(MAIN_JS, 'utf8');
  });

  test('before-input-event listener blocks Cmd+R in every window', () => {
    expect(mainSource).toContain("before-input-event");
    // The handler must preventDefault when metaKey+R is pressed
    expect(mainSource).toMatch(/input\.key\s*===\s*'r'/i);
    expect(mainSource).toContain('preventDefault');
  });
});
