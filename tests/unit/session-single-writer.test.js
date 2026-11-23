'use strict';
/**
 * session.json has exactly one owner: the primary window.
 *
 * Every window ran the same renderer, so every window wrote the same
 * session.json. Two concrete losses:
 *
 *   1. Clobber — tear a tab off a 5-tab window, quit. Both windows fire
 *      beforeunload in undefined order; if the 1-tab window lands last,
 *      session.json is that one tab and the other four are gone.
 *   2. Delete — a secondary window starts empty by design (it never calls
 *      restoreSession), so closing one that was never used takes the
 *      `state.tabs.length === 0` branch and unlinks session.json outright,
 *      wiping a session the user never touched.
 *
 * The guard lives in main, not the renderer: every save and clear funnels
 * through these two IPC handlers, and main is the side that actually knows
 * which window is primary.
 */

const fs = require('fs');
const path = require('path');
const mainSource = fs.readFileSync(path.resolve(__dirname, '../../src/main/main.js'), 'utf8');

const handler = (channel) => {
  const m = mainSource.match(
    new RegExp(`ipcMain\\.on\\('${channel}'[\\s\\S]*?\\n\\}\\);`)
  );
  expect(m).not.toBeNull();
  return m[0];
};

describe('only the primary window writes session.json', () => {
  // Pin the whole refusal block in one regex. Asserting only that the string
  // `isPrimaryWindow(event.sender)` appears somewhere is not enough — two
  // single-character edits both pass that and both restore the original bug:
  //   * dropping the `!`      -> only the PRIMARY window is refused, so every
  //                              secondary writes. Worse than no guard at all.
  //   * dropping the `return` -> it logs "ignored" and writes anyway, which
  //                              makes the debug log lie to whoever reads it.
  // Mutation-tested: each of those edits fails these two tests.
  const REFUSES = (what) => new RegExp(
    String.raw`if \(!isPrimaryWindow\(event\.sender\)\) \{\s*` +
    String.raw`dbgLog\('\[session\] ${what} ignored[^']*'\);\s*` +
    String.raw`return;\s*\}`
  );

  test('a save from a non-primary window is refused and goes no further', () => {
    const save = handler('session:save-sync');
    expect(save).toMatch(REFUSES('save'));
    // ...and the refusal guards the write rather than trailing it.
    expect(save.search(REFUSES('save'))).toBeLessThan(save.indexOf('writeFileSync'));
    expect(save).toContain('writeFileSync');
  });

  test('a clear from a non-primary window is refused and goes no further', () => {
    const clear = handler('session:clear');
    expect(clear).toMatch(REFUSES('clear'));
    expect(clear.search(REFUSES('clear'))).toBeLessThan(clear.indexOf('unlinkSync'));
    expect(clear).toContain('unlinkSync');
  });

  test('the refused save still answers, or sendSync hangs the renderer forever', () => {
    const save = handler('session:save-sync');
    // returnValue is assigned before any early return — otherwise a secondary
    // window's beforeunload blocks on an answer that never comes.
    expect(save.indexOf('event.returnValue')).toBeLessThan(save.indexOf('isPrimaryWindow'));
    expect(save).toMatch(/event\.returnValue = true/);
  });

  test('the primary window is identified by its own webContents', () => {
    const fn = mainSource.match(/function isPrimaryWindow\([\s\S]{0,400}?\n}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/sender === mainWindow\.webContents/);
  });

  test('a destroyed or absent main window owns nothing', () => {
    // mainWindow is nulled on close and can be destroyed mid-quit; touching
    // .webContents on either throws, and a throw inside sendSync hangs it.
    const fn = mainSource.match(/function isPrimaryWindow\([\s\S]{0,400}?\n}/)[0];
    expect(fn).toMatch(/!mainWindow/);
    expect(fn).toMatch(/isDestroyed\(\)/);
  });

  test('session:clear takes the event so it can tell who asked', () => {
    // It used to be `() => {...}` — with no sender there is nothing to check.
    expect(handler('session:clear')).toMatch(/ipcMain\.on\('session:clear', \(event\)/);
  });
});

describe('the primary window keeps working', () => {
  const appSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/renderer/js/app.js'), 'utf8');

  test('beforeunload still clears when the last tab is gone', () => {
    // The fix must not cost a real "I closed everything" clear, or a cleared
    // session reopens on next launch.
    const unload = appSource.match(/beforeunload[\s\S]{0,400}?\n\}\);/);
    expect(unload).not.toBeNull();
    expect(unload[0]).toMatch(/state\.tabs\.length > 0/);
    expect(unload[0]).toMatch(/saveSessionSync\(buildSessionData\(\)\)/);
    expect(unload[0]).toMatch(/clearSession\(\)/);
  });
});
