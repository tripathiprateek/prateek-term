'use strict';
/**
 * tests/unit/scp-upload.test.js
 *
 * Regression tests for the inline SCP upload handler in main.js.
 *
 * BUG-005: Drag-and-drop of a directory failed because the -r flag was not
 *          added.  The handler now calls fs.statSync(filePath).isDirectory()
 *          and prepends -r when true.
 *
 * BUG-006: Multi-window SCP progress was sent to hardcoded mainWindow instead
 *          of event.sender — uploads in secondary windows showed no progress.
 *
 * These tests validate the flag-building logic by reading the source and
 * verifying the critical patterns are present (source-contract tests).
 * They are intentionally lightweight so they run without Electron or node-pty.
 */

const fs   = require('fs');
const path = require('path');

const MAIN_JS = path.resolve(__dirname, '../../src/main/main.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(MAIN_JS, 'utf8');
});

// ---------------------------------------------------------------------------
// BUG-005 — -r flag for directory uploads
// ---------------------------------------------------------------------------

describe('SCP upload — directory support (BUG-005)', () => {
  test('calls fs.statSync(filePath).isDirectory() to detect directories', () => {
    expect(source).toMatch(/statSync\(filePath\)\.isDirectory\(\)/);
  });

  test('pushes "-r" flag when isDirectory is true', () => {
    // The code must contain: if (isDirectory) flags.push('-r')
    expect(source).toMatch(/if\s*\(isDirectory\)\s*flags\.push\('-r'\)/);
  });
});

// ---------------------------------------------------------------------------
// BUG-006 — SCP progress routed to correct window
// ---------------------------------------------------------------------------

describe('SCP upload — multi-window progress routing (BUG-006)', () => {
  test('captures event.sender before async operations', () => {
    // senderContents must be captured from event.sender
    expect(source).toMatch(/const senderContents\s*=\s*event\.sender/);
  });

  test('sends scp:progress to senderContents (not hardcoded mainWindow)', () => {
    // All sends within the scp:upload handler must use senderContents
    expect(source).toMatch(/senderContents\.send\('scp:progress'/);
    // Must NOT send scp:progress through mainWindow
    expect(source).not.toMatch(/mainWindow\.webContents\.send\('scp:progress'/);
  });

  test('sends scp:complete to senderContents (not hardcoded mainWindow)', () => {
    expect(source).toMatch(/senderContents\.send\('scp:complete'/);
    expect(source).not.toMatch(/mainWindow\.webContents\.send\('scp:complete'/);
  });

  test('checks senderContents.isDestroyed() before sending progress', () => {
    // Prevents sending to a destroyed window (e.g. tab closed mid-transfer)
    expect(source).toMatch(/senderContents\.isDestroyed\(\)/);
  });
});
