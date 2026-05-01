'use strict';
/**
 * tests/unit/session-restore-cwd.test.js
 *
 * When Prateek-Term restores tabs on launch, each tab should land in the
 * working directory it had when the app was closed. Previously tabs came
 * back in $HOME because:
 *   1. `tab._lastCwd` stored only the basename ("tmp"), not the full path
 *   2. `restoreSession` never used `saved.cwd` — no `cd` was injected
 *
 * This suite pins the fix: full path is saved, and a `cd` is scheduled
 * post-restore. Pure-logic tests for `shellQuote` + source-contract tests
 * to prevent regression.
 */

const fs   = require('fs');
const path = require('path');

// Pure POSIX shell-quote — mirrors the helper in app.js.
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

describe('shellQuote — POSIX safe paths', () => {
  test('simple path', () => {
    expect(shellQuote('/tmp')).toBe(`'/tmp'`);
  });
  test('path with spaces', () => {
    expect(shellQuote('/home/user/My Docs')).toBe(`'/home/user/My Docs'`);
  });
  test('path containing single quote', () => {
    // /home/user's-dir → '/home/user'\''s-dir'
    expect(shellQuote(`/home/user's-dir`)).toBe(`'/home/user'\\''s-dir'`);
  });
  test('path with shell metacharacters', () => {
    expect(shellQuote('/tmp/$VAR;`cmd`')).toBe(`'/tmp/$VAR;\`cmd\`'`);
  });
  test('empty string', () => {
    expect(shellQuote('')).toBe(`''`);
  });
});

// ---------------------------------------------------------------------------
// Source-contract: app.js must persist full cwd and inject cd on restore
// ---------------------------------------------------------------------------

const APP_JS = path.resolve(__dirname, '../../src/renderer/js/app.js');
let appSource;
beforeAll(() => { appSource = fs.readFileSync(APP_JS, 'utf8'); });

describe('app.js — full cwd path is tracked (not just basename)', () => {
  test('tab has _cwdPath field for full local cwd', () => {
    expect(appSource).toMatch(/_cwdPath:\s*null/);
  });

  test('local cwd poller stores full path to _cwdPath', () => {
    // tab._cwdPath = cwd  (the full path, before basename extraction)
    expect(appSource).toMatch(/tab\._cwdPath\s*=\s*cwd/);
  });
});

describe('app.js — session save uses full path, never basename', () => {
  test('buildSessionData uses _remoteCwd or _cwdPath, NOT _lastCwd', () => {
    // The save must NOT use _lastCwd (basename-only).
    expect(appSource).toMatch(/cwd:\s*t\._remoteCwd\s*\|\|\s*t\._cwdPath/);
    // Source-contract: make sure the old bug doesn't sneak back
    expect(appSource).not.toMatch(/cwd:\s*t\._lastCwd\s*\|\|/);
  });
});

describe('app.js — restoreSession injects cd to saved path', () => {
  test('shellQuote helper exists for POSIX-safe path injection', () => {
    expect(appSource).toMatch(/function shellQuote\(s\)/);
  });

  test('scheduleCwdRestore helper exists', () => {
    expect(appSource).toMatch(/function scheduleCwdRestore\(tab,\s*savedCwd,\s*protocol\)/);
  });

  test('scheduleCwdRestore sends ` cd <quoted-path>` (leading space for history skip)', () => {
    expect(appSource).toMatch(/sendInput\(tab\.ptyId,\s*` cd \$\{shellQuote\(savedCwd\)\}\\r`\)/);
  });

  test('SSH delay ≥ 2000ms so OSC 7 inject (~1800ms) finishes first', () => {
    // protocol === 'local' ? 500 : 2200
    expect(appSource).toMatch(/protocol === 'local' \? 500 : 2200/);
  });

  test('pre-seeds _cwdPath (local) or _remoteCwd (ssh) for immediate drag-drop', () => {
    expect(appSource).toMatch(/tab\._cwdPath\s*=\s*savedCwd/);
    expect(appSource).toMatch(/tab\._remoteCwd\s*=\s*savedCwd/);
  });

  test('restoreSession spawns local PTY directly in saved cwd (no cd command needed)', () => {
    // Local tabs: cwd is passed to createTab so the shell starts there from birth.
    expect(appSource).toMatch(/createTab\(\{[^}]*cwd:\s*saved\.cwd/);
  });

  test('restoreSession still calls scheduleCwdRestore for SSH branch', () => {
    const sshCalls = appSource.match(/scheduleCwdRestore\(tab,\s*saved\.cwd,\s*saved\.protocol\)/g) || [];
    expect(sshCalls.length).toBe(1);
  });

  test('skips non-absolute paths (legacy basename-only format)', () => {
    // Old code saved basename via `_lastCwd`; new code must not inject `cd packaging`
    expect(appSource).toMatch(/if \(!String\(savedCwd\)\.startsWith\('\/'\)\) return/);
  });
});

describe('app.js — proactive first cwd probe on spawn', () => {
  test('local tabs get a setTimeout(checkCwd, 600) after spawn', () => {
    // Without this, freshly-restored tabs save `cwd: null` if user quits
    // before pressing Enter, and next restore lands in $HOME again.
    expect(appSource).toMatch(/setTimeout\(checkCwd,\s*600\)/);
  });
});

describe('app.js — tab name preservation during session restore (race fix)', () => {
  test('scheduleCwdRestore cancels the 600ms probe timer to prevent wrong-name overwrite', () => {
    expect(appSource).toMatch(/clearTimeout\(tab\._cwdProbeTimer\)/);
  });

  test('proactive probe timer handle is stored on tab._cwdProbeTimer', () => {
    expect(appSource).toMatch(/tab\._cwdProbeTimer\s*=\s*setTimeout\(checkCwd,\s*600\)/);
  });

  test('tab._checkCwd is exposed so scheduleCwdRestore can trigger a post-cd name refresh', () => {
    expect(appSource).toMatch(/tab\._checkCwd\s*=\s*checkCwd/);
  });

  test('scheduleCwdRestore schedules post-cd name check for local protocol', () => {
    // After the cd command is sent, a follow-up checkCwd fires 1000ms later
    expect(appSource).toMatch(/tab\._checkCwd\s*\)/);
    expect(appSource).toMatch(/setTimeout\(tab\._checkCwd,\s*1000\)/);
  });
});
