'use strict';
/**
 * tests/unit/default-terminal.test.js
 *
 * Source-contract tests for the default-terminal IPC handlers and the
 * renderer error bridge added in the same feature branch.
 *
 * New features:
 *   - defaultTerminal:isDefault  IPC handler — queries whether Prateek-Term
 *     is currently the system default terminal via the native addon.
 *   - defaultTerminal:set  IPC handler — registers Prateek-Term as the
 *     default terminal using the native addon.
 *   - debug:rendererError  IPC handler — receives crash/error messages from
 *     the renderer process and appends them to the debug log.
 *   - defaultTerminalAddon variable — loaded with try-catch so a missing or
 *     unbuilt native addon does not crash the main process at startup.
 */

const fs   = require('fs');
const path = require('path');

const MAIN_SRC = path.resolve(__dirname, '../../src/main/main.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(MAIN_SRC, 'utf8');
});

// ---------------------------------------------------------------------------
// IPC handler registrations
// ---------------------------------------------------------------------------

describe('defaultTerminal IPC handlers', () => {
  test('defaultTerminal:isDefault handler is registered', () => {
    expect(source).toContain("ipcMain.handle('defaultTerminal:isDefault'");
  });

  test('defaultTerminal:set handler is registered', () => {
    expect(source).toContain("ipcMain.handle('defaultTerminal:set'");
  });
});

describe('renderer error bridge IPC handler', () => {
  test('debug:rendererError handler is registered', () => {
    expect(source).toContain("ipcMain.on('debug:rendererError'");
  });

  test('debug:rendererError handler logs the message via dbgLog', () => {
    const handlerBlock = source.match(/ipcMain\.on\('debug:rendererError'[\s\S]{0,200}/);
    expect(handlerBlock).not.toBeNull();
    expect(handlerBlock[0]).toContain('dbgLog');
  });
});

// ---------------------------------------------------------------------------
// Native addon — graceful load
// ---------------------------------------------------------------------------

describe('defaultTerminalAddon — graceful load with try-catch', () => {
  test('defaultTerminalAddon variable is declared', () => {
    expect(source).toContain('let defaultTerminalAddon');
  });

  test('defaultTerminalAddon starts as null before require attempt', () => {
    // Must be: let defaultTerminalAddon = null;
    expect(source).toMatch(/let defaultTerminalAddon\s*=\s*null/);
  });

  test('native addon is loaded inside a try block', () => {
    // require('../native/index.js') must be inside try {
    const tryBlock = source.match(/try\s*\{[\s\S]{0,100}require\(['"]\.\.\/native\/index\.js['"]\)/);
    expect(tryBlock).not.toBeNull();
  });

  test('catch block exists for native addon load failure', () => {
    // The try-catch around the require must have a catch block
    const addonTryCatch = source.match(
      /let defaultTerminalAddon[\s\S]{0,300}catch\s*\(e\)/
    );
    expect(addonTryCatch).not.toBeNull();
  });

  test('catch block for addon load does not rethrow (startup survives missing addon)', () => {
    // The catch block should log but NOT rethrow — no `throw` immediately after
    const catchBlock = source.match(
      /catch\s*\(e\)\s*\{\s*dbgLog\(`\[default-terminal\][\s\S]{0,100}}\s*\n/
    );
    expect(catchBlock).not.toBeNull();
    // The catch block should not contain 'throw'
    expect(catchBlock[0]).not.toContain('throw');
  });
});
