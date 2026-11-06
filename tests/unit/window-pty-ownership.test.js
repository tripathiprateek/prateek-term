'use strict';
/**
 * A window must only tear down the PTYs IT owns.
 *
 * createWindow() registered `mainWindow.on('closed')` with a loop over
 * `terminals` — the process-wide map of EVERY pty — killing all of them.
 * Closing the first window therefore SIGHUP'd the shell in every torn-off
 * window, plus every MCP bridge session. Secondary windows registered no
 * cleanup at all, so closing one orphaned its pty until app quit.
 *
 * app.on('window-all-closed') already quits the app, so the mass kill only
 * ever ran while other windows were still open — precisely when it did harm.
 */

const fs = require('fs');
const path = require('path');
const mainSource = fs.readFileSync(path.resolve(__dirname, '../../src/main/main.js'), 'utf8');

describe('window close kills only that window\'s PTYs', () => {
  test('no WINDOW-close handler kills every terminal in the process', () => {
    // Reaping everything is correct at app quit; doing it when one window of
    // several closes is what killed other windows' sessions.
    const closeHandlers = mainSource.match(/\.on\('closed'[\s\S]{0,400}?\n  \}\)/g) || [];
    for (const h of closeHandlers) {
      expect(h).not.toContain('terminals.clear()');
      expect(h).not.toMatch(/of terminals\) term\.kill/);
    }
  });

  test('everything IS reaped at app quit, so nothing outlives the app', () => {
    const quit = mainSource.match(/app\.on\('will-quit'[\s\S]{0,600}?\n\}\);/);
    expect(quit).not.toBeNull();
    expect(quit[0]).toMatch(/of terminals\)[\s\S]{0,60}kill\(\)/);
    expect(quit[0]).toMatch(/of scpTransfers\)[\s\S]{0,60}kill\(\)/);
  });

  test('cleanup is scoped by the closing window\'s webContents id', () => {
    const fn = mainSource.match(/function closeWindowTerminals\([\s\S]{0,900}?\n}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/terminalOwnerIds\.get\(id\) !== wcId/);
    expect(fn[0]).toContain('term.kill()');
  });

  test('every window registers the cleanup, not just the first one', () => {
    // Secondary (torn-off) windows previously had none, orphaning their PTYs.
    const fn = mainSource.match(/function createNewWindow\(opts = \{\}\)[\s\S]*?\n  return win;/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/win\.on\('closed'/);
    expect(fn[0]).toContain('closeWindowTerminals');
  });

  test('the webContents id is captured BEFORE close — it is unreadable after', () => {
    const fn = mainSource.match(/function createNewWindow\(opts = \{\}\)[\s\S]*?\n  return win;/)[0];
    expect(fn.indexOf('const wcId = win.webContents.id'))
      .toBeLessThan(fn.indexOf("win.on('closed'"));
  });

  test('owner ids are tracked wherever ownership is assigned', () => {
    // Creation, and adoption by a torn-off window.
    const assigns = mainSource.match(/terminalOwners\.set\(/g) || [];
    const idAssigns = mainSource.match(/terminalOwnerIds\.set\(/g) || [];
    expect(idAssigns.length).toBe(assigns.length);
  });

  test('a released (mid-tear-off) PTY belongs to no window, so no close kills it', () => {
    const release = mainSource.match(/ipcMain\.on\('terminal:release'[\s\S]{0,500}?\n}\);/);
    expect(release).not.toBeNull();
    expect(release[0]).toContain('terminalOwnerIds.delete(id)');
  });

  test('a closing window drops its queued auto-connect profile', () => {
    expect(mainSource).toMatch(/pendingAutoConnect\.delete\(wcId\)/);
  });
});

describe('adopting a PTY that has already exited', () => {
  test('the held backlog is replayed even when the PTY is gone', () => {
    // Its dying output explains WHY it died; dropping it leaves a blank window.
    const adopt = mainSource.match(/ipcMain\.handle\('terminal:adopt'[\s\S]{0,1200}?\n}\);/)[0];
    expect(adopt.indexOf('handoff.end(id)')).toBeLessThan(adopt.indexOf('terminals.has(id)'));
  });

  test('a failed adopt still reports it so the renderer can show the exit state', () => {
    const adopt = mainSource.match(/ipcMain\.handle\('terminal:adopt'[\s\S]{0,1200}?\n}\);/)[0];
    expect(adopt).toMatch(/success: false/);
  });
});
