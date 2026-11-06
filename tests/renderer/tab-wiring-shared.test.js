'use strict';
/**
 * createTab() and adoptTab() both build a terminal tab, but only createTab ever
 * wired up the interaction handlers. A torn-off tab therefore silently lost its
 * right-click menu, middle-click paste, select-to-copy, drag-and-drop upload and
 * OSC-7 remote-cwd tracking — the last of which also decides where a dropped
 * file lands over SCP.
 *
 * The fix is one shared wiring function called by both, so the two cannot drift
 * apart again. These tests assert the sharing itself, not a list of handlers —
 * a list would pass again the moment someone adds a seventh handler to one side.
 */

const fs = require('fs');
const path = require('path');
const appSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/renderer/js/app.js'), 'utf8');

const fnBody = (name) => {
  const sig = appSource.indexOf(`function ${name}(`);
  if (sig === -1) throw new Error(`${name} not found`);
  // Skip the parameter list — `createTab(options = {})` has a brace in it, and
  // taking that as the body silently yields "{}" and passes every assertion.
  let i = appSource.indexOf('(', sig), paren = 0;
  for (; i < appSource.length; i++) {
    if (appSource[i] === '(') paren++;
    else if (appSource[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  const from = appSource.indexOf('{', i);
  let depth = 0;
  for (let j = from; j < appSource.length; j++) {
    if (appSource[j] === '{') depth++;
    else if (appSource[j] === '}') { depth--; if (depth === 0) return appSource.slice(from, j + 1); }
  }
  throw new Error(`unbalanced braces in ${name}`);
};

/** indexOf that fails loudly instead of returning -1 and passing an ordering test. */
const at = (hay, needle) => {
  const i = hay.indexOf(needle);
  expect(i).toBeGreaterThan(-1);
  return i;
};

describe('the interaction wiring lives in one place', () => {
  test('wireTabInteractions exists and both tab builders call it', () => {
    expect(appSource).toMatch(/function wireTabInteractions\(tab\)/);
    expect(fnBody('createTab')).toContain('wireTabInteractions(tab)');
    expect(fnBody('adoptTab')).toContain('wireTabInteractions(tab)');
  });

  test('every interaction handler is wired there and nowhere else', () => {
    const shared = fnBody('wireTabInteractions');
    for (const handler of [
      "addEventListener('contextmenu'",   // right-click menu
      "addEventListener('auxclick'",      // middle-click paste
      'onSelectionChange(',               // auto-copy on selection
      'setupPaneDragDrop(',               // drag-and-drop SCP upload
    ]) {
      expect(shared).toContain(handler);
      // Exactly one site across the three tab-building functions — the shared
      // one. (Counting the whole file would be wrong: 'contextmenu' is also
      // bound on the tab bar, sidebar chips and hosts, which is unrelated.)
      const inBuilders = [shared, fnBody('createTab'), fnBody('adoptTab')]
        .reduce((n, body) => n + body.split(handler).length - 1, 0);
      expect(inBuilders).toBe(1);
    }
  });

  test('local cwd polling is shared, so a torn-off local tab keeps its title', () => {
    const shared = fnBody('wireTabInteractions');
    expect(shared).toContain('_cwdEnterListener');
    expect(shared).toContain('_cwdProbeTimer');
    expect(shared).toContain('_checkCwd');
    // Guarded on the tab, not on a createTab-local variable.
    expect(shared).toMatch(/tab\.protocol === 'local'/);
  });

  test('neither builder keeps a private copy of the shared block', () => {
    for (const name of ['createTab', 'adoptTab']) {
      const body = fnBody(name);
      expect(body).not.toContain("addEventListener('contextmenu'");
      expect(body).not.toContain("addEventListener('auxclick'");
      expect(body).not.toContain('setupPaneDragDrop(');
    }
  });
});

describe('OSC-7 remote-cwd tracking', () => {
  test('is shared, and registered by both builders', () => {
    expect(appSource).toMatch(/function registerRemoteCwdParser\(tab\)/);
    expect(fnBody('registerRemoteCwdParser')).toContain('registerOscHandler(7');
    expect(appSource.split('registerOscHandler(7').length - 1).toBe(1);
    expect(fnBody('createTab')).toContain('registerRemoteCwdParser(tab)');
    expect(fnBody('adoptTab')).toContain('registerRemoteCwdParser(tab)');
  });

  test('createTab registers it BEFORE buffered output is flushed into the term', () => {
    // flushPendingTerminalEvents writes synchronously; a cwd report inside that
    // buffer would otherwise be missed AND echoed to the screen as raw text.
    const body = fnBody('createTab');
    expect(at(body, 'registerRemoteCwdParser(tab)'))
      .toBeLessThan(at(body, 'flushPendingTerminalEvents(tab)'));
  });

  test('adoptTab registers it before replaying the snapshot', () => {
    // The snapshot can itself carry the OSC-7 report, which recovers the cwd.
    const body = fnBody('adoptTab');
    expect(at(body, 'registerRemoteCwdParser(tab)'))
      .toBeLessThan(at(body, 'tearOffData.serializedBuffer'));
  });
});

describe('what must NOT be shared', () => {
  test('the serial key handler stays separate — xterm allows only one', () => {
    // Serial relies on xterm's native paste reaching term.onData -> serialWrite,
    // so it must NOT get the PTY handler's `return false` on Cmd/Ctrl+V.
    expect(fnBody('wireTabInteractions')).not.toContain('attachCustomKeyEventHandler');
    const serialHandler = appSource.match(
      /Clipboard shortcuts for serial[\s\S]{0,600}?attachCustomKeyEventHandler[\s\S]{0,500}?\n    \}\);/);
    expect(serialHandler).not.toBeNull();
    expect(serialHandler[0]).not.toMatch(/key === 'v'/);
  });
});
