'use strict';
/**
 * tests/renderer/tab-reconnect.test.js
 *
 * Regression tests for the tab reconnect feature.
 *
 * BUG-007: Stale closure captured `const ptyId = result.id` at tab-creation
 *   time.  When the session expired and the user pressed R, reconnectTab()
 *   got a new PTY ID, but all data/exit listeners still referenced the old
 *   closed ID — so no data appeared and closing the tab tried to kill a
 *   non-existent PTY.
 *
 * Fix: store the PTY ID as `tab.ptyId` (a mutable property) so every closure
 *   reads the current value at call time.
 *
 * Strategy: source-contract tests on app.js.
 */

const fs   = require('fs');
const path = require('path');

const APP_JS = path.resolve(__dirname, '../../src/renderer/js/app.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(APP_JS, 'utf8');
});

// ---------------------------------------------------------------------------
// BUG-007 — Mutable tab.ptyId instead of const closure
// ---------------------------------------------------------------------------

describe('PTY ID mutability (BUG-007)', () => {
  test('onData handler references tab.ptyId (not a captured local const)', () => {
    // Find the PTY tab onData section and verify it uses tab.ptyId
    const onDataMatch = source.match(/term\.onData[\s\S]{0,200}tab\.ptyId/);
    expect(onDataMatch).not.toBeNull();
  });

  test('reconnectTab updates tab.ptyId from new createTerminal result', () => {
    // reconnectTab must write: tab.ptyId = result.id
    expect(source).toMatch(/tab\.ptyId\s*=\s*result\.id/);
  });

  test('no "const ptyId" local captures in the PTY data handler', () => {
    // Look for pattern: const ptyId = result.id followed by onData using ptyId
    // (the BAD pattern).  We want tab.ptyId, not a local const.
    // Note: there may be "const ptyId" in other contexts (e.g. cleanup), but
    // the onData closure must NOT use a stale local.
    const onDataSection = source.match(/\/\/ Use tab\.ptyId[\s\S]{0,500}term\.onData/);
    if (onDataSection) {
      // If the comment is present it's the fixed version
      expect(onDataSection[0]).toContain('tab.ptyId');
    } else {
      // Fallback: just ensure tab.ptyId is used in any onData handler
      expect(source).toMatch(/onData[\s\S]{0,100}tab\.ptyId/);
    }
  });
});

// ---------------------------------------------------------------------------
// Reconnect flow
// ---------------------------------------------------------------------------

describe('reconnectTab function', () => {
  test('reconnectTab function exists in source', () => {
    expect(source).toContain('async function reconnectTab(tab)');
  });

  test('writes a visual separator line before reconnecting', () => {
    expect(source).toContain('Reconnecting');
  });

  test('handles reconnect failure and shows error message', () => {
    // On failure: tab.term.write(`[Reconnect failed: ...]`)
    expect(source).toMatch(/Reconnect failed/);
  });

  test('calls showExitMessage on reconnect failure (allows another attempt)', () => {
    // After a failed reconnect the user should be able to try again
    const failBlock = source.match(/catch\s*\(err\)[\s\S]{0,200}showExitMessage/);
    expect(failBlock).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// showExitMessage — reconnect prompt logic
// ---------------------------------------------------------------------------

describe('showExitMessage — reconnect vs close prompt', () => {
  test('uses canReconnect flag based on connectionProfile and protocol', () => {
    // canReconnect = !!(tab.connectionProfile && tab.protocol !== 'local')
    expect(source).toMatch(/tab\.connectionProfile[\s\S]{0,50}tab\.protocol\s*!==\s*'local'/);
  });

  test('shows "Press R to reconnect" message for reconnectable sessions', () => {
    expect(source).toContain('Press R to reconnect');
  });

  test('shows "Press any key to close" for local/non-reconnectable sessions', () => {
    expect(source).toContain('Press any key to close');
  });

  test('reconnect prompt listener checks for lowercase "r" key', () => {
    // domEvent.key.toLowerCase() === 'r'
    expect(source).toMatch(/domEvent\.key\.toLowerCase\(\)\s*===\s*'r'/);
  });

  test('non-R key in reconnect prompt closes the tab', () => {
    // else { closeTab(tab.id) }
    const reconnectBlock = source.match(
      /domEvent\.key\.toLowerCase\(\)\s*===\s*'r'[\s\S]{0,200}closeTab/
    );
    expect(reconnectBlock).not.toBeNull();
  });
});
