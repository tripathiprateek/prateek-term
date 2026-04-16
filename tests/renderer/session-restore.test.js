'use strict';
/**
 * tests/renderer/session-restore.test.js
 *
 * Source-contract tests for the session restore flow.
 *
 * BUG: restoreSession() previously called switchTab(target.id), but the
 * function is named activateTab. This caused init() to crash silently
 * (TypeError: switchTab is not a function), preventing rendererReady()
 * from ever being called and leaving all buffered open-folder paths
 * undelivered.
 *
 * Fix: restoreSession() now calls activateTab(target.id).
 */

const fs   = require('fs');
const path = require('path');

const APP_JS = path.resolve(__dirname, '../../src/renderer/js/app.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(APP_JS, 'utf8');
});

// ---------------------------------------------------------------------------
// activateTab / switchTab naming
// ---------------------------------------------------------------------------

describe('activateTab vs switchTab naming', () => {
  test('switchTab is NOT defined anywhere in app.js (old bad name gone)', () => {
    expect(source).not.toMatch(/function switchTab\b/);
  });

  test('activateTab IS defined as a function', () => {
    expect(source).toMatch(/function activateTab\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// restoreSession correctness
// ---------------------------------------------------------------------------

describe('restoreSession — calls activateTab (not switchTab)', () => {
  test('restoreSession calls activateTab to re-activate the last tab', () => {
    // Find the restoreSession function body and assert activateTab is called there
    // Function is ~1500 chars; use a wide window to capture the final activateTab call
    const restoreBlock = source.match(/async function restoreSession\(\)[\s\S]{0,2000}/);
    expect(restoreBlock).not.toBeNull();
    expect(restoreBlock[0]).toContain('activateTab');
  });

  test('restoreSession does NOT call switchTab', () => {
    const restoreBlock = source.match(/async function restoreSession\(\)[\s\S]{0,2000}/);
    expect(restoreBlock).not.toBeNull();
    expect(restoreBlock[0]).not.toContain('switchTab');
  });
});

// ---------------------------------------------------------------------------
// restoreSession resilience — per-tab try-catch
// ---------------------------------------------------------------------------

describe('restoreSession — try-catch around each tab restore', () => {
  test('restoreSession wraps tab restoration in try-catch', () => {
    // The for-loop over session.tabs must have a try-catch inside it
    const restoreBlock = source.match(/async function restoreSession\(\)[\s\S]{0,2000}/);
    expect(restoreBlock).not.toBeNull();
    // Should contain both try { and } catch (e) {
    expect(restoreBlock[0]).toMatch(/try\s*\{/);
    expect(restoreBlock[0]).toMatch(/\}\s*catch\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// rendererReady called in init() after restoreSession
// ---------------------------------------------------------------------------

describe('init() — rendererReady called after restoreSession', () => {
  test('rendererReady() is called in init()', () => {
    expect(source).toContain('window.terminalAPI.rendererReady()');
  });

  test('rendererReady() appears after restoreSession in source order', () => {
    const restoreIdx   = source.indexOf('await restoreSession()');
    const readyIdx     = source.indexOf('window.terminalAPI.rendererReady()');
    expect(restoreIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(restoreIdx);
  });
});
