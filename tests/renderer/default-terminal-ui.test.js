'use strict';
/**
 * tests/renderer/default-terminal-ui.test.js
 *
 * Source-contract tests for the "Set as Default Terminal" UI added in
 * Settings → General.
 *
 * New feature: A button (btn-set-default-terminal) and a status badge allow
 * the user to check whether Prateek-Term is the system default terminal and
 * to set it as default. The badge shows an "is-default" CSS class when
 * Prateek-Term is already the default.
 */

const fs   = require('fs');
const path = require('path');

const APP_JS = path.resolve(__dirname, '../../src/renderer/js/app.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(APP_JS, 'utf8');
});

// ---------------------------------------------------------------------------
// btn-set-default-terminal wiring
// ---------------------------------------------------------------------------

describe('btn-set-default-terminal — event listener setup', () => {
  test('btn-set-default-terminal element is queried by getElementById in setupEventListeners', () => {
    const setupBlock = source.match(/function setupEventListeners\(\)[\s\S]{0,3000}/);
    expect(setupBlock).not.toBeNull();
    expect(setupBlock[0]).toContain("getElementById('btn-set-default-terminal')");
  });

  test('button disables itself (btn.disabled = true) during the set operation', () => {
    // After clicking, the handler sets btn.disabled = true before the async call
    expect(source).toMatch(/btn\.disabled\s*=\s*true/);
  });
});

// ---------------------------------------------------------------------------
// refreshDefaultTerminalStatus function
// ---------------------------------------------------------------------------

describe('refreshDefaultTerminalStatus function', () => {
  test('refreshDefaultTerminalStatus function is defined', () => {
    expect(source).toMatch(/async function refreshDefaultTerminalStatus\s*\(/);
  });

  test('refreshDefaultTerminalStatus calls window.terminalAPI.isDefaultTerminal()', () => {
    const fnBlock = source.match(/async function refreshDefaultTerminalStatus\s*\(\)[\s\S]{0,500}/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock[0]).toContain('window.terminalAPI.isDefaultTerminal()');
  });

  test('refreshDefaultTerminalStatus applies is-default CSS class when already default', () => {
    const fnBlock = source.match(/async function refreshDefaultTerminalStatus\s*\(\)[\s\S]{0,500}/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock[0]).toContain('is-default');
  });
});

// ---------------------------------------------------------------------------
// openSettings calls refreshDefaultTerminalStatus
// ---------------------------------------------------------------------------

describe('openSettings — refreshes default terminal status', () => {
  test('refreshDefaultTerminalStatus is called inside openSettings', () => {
    // openSettings is a large function (~2500 chars); use wide window to reach the call
    const openSettingsBlock = source.match(/async function openSettings\s*\(\)[\s\S]{0,3000}/);
    expect(openSettingsBlock).not.toBeNull();
    expect(openSettingsBlock[0]).toContain('refreshDefaultTerminalStatus()');
  });
});
