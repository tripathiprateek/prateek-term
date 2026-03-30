'use strict';
/**
 * tests/unit/pty-locale.test.js
 *
 * Source-contract tests for PTY UTF-8 locale injection.
 *
 * BUG-003 (issue #3): vim/vi renders Unicode box-drawing characters as garbled
 * ~T~@ sequences when launched from the macOS Dock because process.env contains
 * no LANG or LC_ALL. Without a UTF-8 locale, vim falls back to Latin-1 and
 * renders each byte of a multi-byte UTF-8 sequence individually.
 *
 * Fix: set LANG=en_US.UTF-8 and LC_ALL=en_US.UTF-8 in the PTY env unless
 * already present, so all spawned shells inherit a consistent UTF-8 locale.
 */

const fs   = require('fs');
const path = require('path');

const MAIN_SRC = path.join(__dirname, '../../src/main/main.js');
const src = fs.readFileSync(MAIN_SRC, 'utf-8');

// ─── Source-contract: locale vars injected into PTY env ──────────────────

describe('PTY environment — UTF-8 locale (BUG-003 / issue #3)', () => {

  test('LANG is set to en_US.UTF-8 when not already present', () => {
    // The fix must set env.LANG = 'en_US.UTF-8' (or equivalent)
    expect(src).toMatch(/env\.LANG\s*=\s*['"]en_US\.UTF-8['"]/);
  });

  test('LC_ALL is set to en_US.UTF-8 when not already present', () => {
    expect(src).toMatch(/env\.LC_ALL\s*=\s*['"]en_US\.UTF-8['"]/);
  });

  test('LANG is only set when not already in env (preserves user locale)', () => {
    // Must be guarded: if (!env.LANG) or similar — never unconditionally overwrite
    expect(src).toMatch(/if\s*\(\s*!env\.LANG\s*\)/);
  });

  test('LC_ALL is only set when not already in env (preserves user locale)', () => {
    expect(src).toMatch(/if\s*\(\s*!env\.LC_ALL\s*\)/);
  });

  test('locale is set in the same env block as TERM (before pty.spawn)', () => {
    const termIdx   = src.indexOf("env.TERM = 'xterm-256color'");
    const langIdx   = src.indexOf("env.LANG    = 'en_US.UTF-8'");
    const spawnIdx  = src.indexOf('pty.spawn(');
    // LANG must appear after TERM is set and before pty.spawn is called
    expect(termIdx).toBeGreaterThan(-1);
    expect(langIdx).toBeGreaterThan(termIdx);
    expect(langIdx).toBeLessThan(spawnIdx);
  });
});

// ─── Unit: locale injection logic (simulated) ────────────────────────────

describe('locale injection — unit simulation', () => {

  /**
   * Simulate the env-building logic extracted from main.js:
   *   env = { ...process.env, ...options.env }
   *   env.TERM = 'xterm-256color'
   *   if (!env.LANG)   env.LANG   = 'en_US.UTF-8'
   *   if (!env.LC_ALL) env.LC_ALL = 'en_US.UTF-8'
   */
  function buildPtyEnv(processEnv, optionsEnv = {}) {
    const env = { ...processEnv, ...optionsEnv };
    env.TERM = 'xterm-256color';
    if (!env.LANG)   env.LANG   = 'en_US.UTF-8';
    if (!env.LC_ALL) env.LC_ALL = 'en_US.UTF-8';
    return env;
  }

  test('sets LANG when absent (Dock-launched app with no locale)', () => {
    const env = buildPtyEnv({ HOME: '/Users/prateek', PATH: '/usr/bin' });
    expect(env.LANG).toBe('en_US.UTF-8');
  });

  test('sets LC_ALL when absent', () => {
    const env = buildPtyEnv({ HOME: '/Users/prateek' });
    expect(env.LC_ALL).toBe('en_US.UTF-8');
  });

  test('preserves existing LANG value', () => {
    const env = buildPtyEnv({ LANG: 'ja_JP.UTF-8' });
    expect(env.LANG).toBe('ja_JP.UTF-8');
  });

  test('preserves existing LC_ALL value', () => {
    const env = buildPtyEnv({ LC_ALL: 'fr_FR.UTF-8' });
    expect(env.LC_ALL).toBe('fr_FR.UTF-8');
  });

  test('TERM is always set to xterm-256color', () => {
    const env = buildPtyEnv({});
    expect(env.TERM).toBe('xterm-256color');
  });

  test('options.env overrides process.env before locale defaults applied', () => {
    // If a connection profile sets LANG explicitly, it must be respected
    const env = buildPtyEnv({ LANG: 'en_US.UTF-8' }, { LANG: 'C' });
    expect(env.LANG).toBe('C'); // options.env wins; locale default not applied
  });
});
