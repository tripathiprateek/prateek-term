'use strict';
/**
 * tests/renderer/clone-profile.test.js
 *
 * "Duplicate profile" feature: clone a profile with every detail (host, port,
 * username, password, key, actions, options, tags, port-forwards) under a
 * suggested unique name.
 *
 * suggestCloneName is pure, so it's re-declared here and unit-tested directly
 * (same pattern as tab-grouping.test.js). The rest are source-contract checks
 * against app.js so a running Electron instance isn't required.
 */

const fs   = require('fs');
const path = require('path');

const APP_JS = path.resolve(__dirname, '../../src/renderer/js/app.js');
const source = fs.readFileSync(APP_JS, 'utf8');

// ---------------------------------------------------------------------------
// Pure logic — suggestCloneName (mirrors the implementation in app.js)
// ---------------------------------------------------------------------------
function suggestCloneName(baseName, existingNames) {
  const taken = new Set((existingNames || []).map((n) => (n || '').trim()));
  const base = (baseName || 'Profile').trim();
  let candidate = `${base} (copy)`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base} (copy ${n})`;
    n += 1;
  }
  return candidate;
}

describe('suggestCloneName', () => {
  test('appends " (copy)" when the name is free', () => {
    expect(suggestCloneName('prod-server', ['prod-server'])).toBe('prod-server (copy)');
  });

  test('bumps to " (copy 2)", " (copy 3)" on collisions', () => {
    const existing = ['router-01', 'router-01 (copy)', 'router-01 (copy 2)'];
    expect(suggestCloneName('router-01', existing)).toBe('router-01 (copy 3)');
  });

  test('falls back to "Profile" when the base name is empty', () => {
    expect(suggestCloneName('', [])).toBe('Profile (copy)');
    expect(suggestCloneName(undefined, [])).toBe('Profile (copy)');
  });

  test('the suggested name is unique against the existing set', () => {
    const existing = ['a', 'a (copy)'];
    const suggestion = suggestCloneName('a', existing);
    expect(existing).not.toContain(suggestion);
  });
});

// ---------------------------------------------------------------------------
// Source contract — cloneProfile + Duplicate menu item
// ---------------------------------------------------------------------------
describe('cloneProfile — source contract', () => {
  const getCloneFn = () => {
    const m = source.match(/function cloneProfile\(profile\)[\s\S]{0,900}/);
    return m ? m[0] : '';
  };

  test('cloneProfile exists and deep-copies via JSON', () => {
    const fn = getCloneFn();
    expect(fn).not.toBe('');
    expect(fn).toContain('JSON.parse(JSON.stringify(');
  });

  test('cloneProfile assigns a fresh id (not the source id)', () => {
    const fn = getCloneFn();
    expect(fn).toMatch(/copy\.id\s*=\s*Date\.now\(\)\.toString\(36\)/);
  });

  test('cloneProfile suggests a unique name and persists', () => {
    const fn = getCloneFn();
    expect(fn).toContain('suggestCloneName(');
    expect(fn).toContain('state.profiles.push(copy)');
    expect(fn).toContain('saveAllProfiles()');
  });

  test('cloneProfile opens the clone for review/rename', () => {
    const fn = getCloneFn();
    expect(fn).toContain('openConnectionManager(copy)');
  });

  test('the host context menu offers a Duplicate action wired to cloneProfile', () => {
    // The menu builds a cloneItem whose click handler calls cloneProfile(profile).
    expect(source).toMatch(/cloneItem[\s\S]{0,400}cloneProfile\(profile\)/);
    expect(source).toContain('menu.appendChild(cloneItem)');
  });
});
