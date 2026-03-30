'use strict';
/**
 * tests/unit/pty-login-shell.test.js
 *
 * Source-contract + unit tests for PTY login-shell spawning.
 *
 * BUG-004: Prateek-Term spawns the local shell without the -l (login) flag,
 * so ~/.bash_profile / ~/.zprofile are never sourced. As a result the PTY
 * inherits the stripped-down macOS Dock / launchd environment instead of the
 * user's full environment. Missing: NVM, Homebrew, Go, micromamba, custom
 * PATH entries — anything set in shell profile files.
 *
 * iTerm2, Terminal.app, and Ghostty all spawn login shells (-l) by default.
 *
 * Fix: pass ['-l'] as the default args when no explicit args are provided,
 * so pty.spawn gets a login shell that sources profile files and inherits
 * the same PATH the user expects.
 */

const fs   = require('fs');
const path = require('path');

const MAIN_SRC = path.join(__dirname, '../../src/main/main.js');
const src = fs.readFileSync(MAIN_SRC, 'utf-8');

// ─── Source-contract: -l is the default arg ──────────────────────────────

describe('PTY spawn — login shell (BUG-004)', () => {

  test('default args include -l to spawn a login shell', () => {
    // Must contain: options.args || ['-l']  (or equivalent)
    expect(src).toMatch(/options\.args\s*\|\|\s*\[['"][- ]l['"]\]/);
  });

  test('login shell arg appears before pty.spawn call', () => {
    const loginIdx = src.indexOf("options.args || ['-l']");
    const spawnIdx = src.indexOf('pty.spawn(shell');
    expect(loginIdx).toBeGreaterThan(-1);
    expect(spawnIdx).toBeGreaterThan(-1);
    expect(loginIdx).toBeLessThan(spawnIdx);
  });
});

// ─── Unit simulation: login-shell arg logic ───────────────────────────────

describe('login shell — unit simulation', () => {

  /**
   * Simulate the args logic in terminal:create handler:
   *   const args = options.args || ['-l'];
   */
  function resolveArgs(options = {}) {
    return options.args || ['-l'];
  }

  test('uses -l when no args provided (default local tab)', () => {
    expect(resolveArgs({})).toEqual(['-l']);
  });

  test('uses -l when options is empty object', () => {
    expect(resolveArgs()).toEqual(['-l']);
  });

  test('respects explicit args (SSH/custom shell override)', () => {
    expect(resolveArgs({ args: ['--norc'] })).toEqual(['--norc']);
  });

  test('respects empty args array (caller explicitly wants no flags)', () => {
    expect(resolveArgs({ args: [] })).toEqual([]);
  });

  test('passes through multiple explicit args unchanged', () => {
    expect(resolveArgs({ args: ['-l', '--rcfile', '/custom/rc'] }))
      .toEqual(['-l', '--rcfile', '/custom/rc']);
  });
});
