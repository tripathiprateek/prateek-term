'use strict';
/**
 * Default-shell selection: users with several shells installed (zsh, bash, sh,
 * a Homebrew bash, …) can pick which one new local tabs open, instead of always
 * inheriting $SHELL.
 */

const fs   = require('fs');
const path = require('path');
const platform = require('../../src/main/platform');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');

describe('platform.listShells', () => {
  test('returns only executables that exist', () => {
    for (const p of platform.listShells()) {
      expect(fs.existsSync(p)).toBe(true);
      expect(() => fs.accessSync(p, fs.constants.X_OK)).not.toThrow();
    }
  });

  test('includes a usable shell on this machine and never duplicates', () => {
    const shells = platform.listShells();
    expect(shells.length).toBeGreaterThan(0);
    expect(new Set(shells).size).toBe(shells.length);
  });

  test('always offers something findShell() could return', () => {
    // The picker must not be empty on a machine where the app can run at all.
    expect(typeof platform.findShell()).toBe('string');
  });
});

describe('wiring', () => {
  const main    = read('src/main/main.js');
  const preload = read('src/main/preload.js');
  const app     = read('src/renderer/js/app.js');
  const html    = read('src/renderer/index.html');

  test('main exposes shells:list with the detected default', () => {
    expect(main).toContain("ipcMain.handle('shells:list'");
    const block = main.match(/ipcMain\.handle\('shells:list'[\s\S]{0,300}/);
    expect(block[0]).toContain('listShells()');
    expect(block[0]).toContain('detected');
  });

  test('preload bridges listShells', () => {
    expect(preload).toContain('listShells');
  });

  test('settings UI has the picker', () => {
    expect(html).toContain('id="settings-default-shell"');
    expect(html).toContain('System default');
  });

  test('saveSettings persists the selection', () => {
    const fn = app.match(/async function saveSettings\(\)[\s\S]{0,900}/);
    expect(fn[0]).toContain('settings-default-shell');
    expect(fn[0]).toContain('settingsState.defaultShell');
  });

  test('new LOCAL tabs use the chosen shell; SSH/serial keep their own command', () => {
    // The override must sit in the `else` of the shellCommand branch, so a
    // connection profile's own command is never replaced by the local shell.
    const branch = app.match(/if \(shellCommand\) \{[\s\S]{0,600}/);
    expect(branch[0]).toContain('else if (settingsState.defaultShell)');
    expect(branch[0]).toContain('ptyOptions.shell = settingsState.defaultShell');
  });

  test('the choice is seeded at startup, not only when Settings opens', () => {
    // settingsState is otherwise populated in openSettings(), so without this a
    // saved shell would not apply until the user visited Settings.
    expect(app).toMatch(/settingsState\.defaultShell = savedSettings\.defaultShell/);
  });

  test('a saved-but-uninstalled shell is not silently dropped', () => {
    const fn = app.match(/async function populateShellPicker\(current\)[\s\S]{0,900}/);
    expect(fn[0]).toContain('!shells.includes(current)');
  });
});
