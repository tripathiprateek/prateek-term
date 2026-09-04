'use strict';
/**
 * SemVer comparison + update-channel selection.
 *
 * The regression these tests exist for: the old comparator dropped the
 * pre-release suffix, so a user on 1.5.0-beta.2 was told neither about
 * 1.5.0-rc.1 nor about the final 1.5.0 — they were stranded until 1.5.1.
 */

const { compareVersions, isVersionNewer, resolveChannel, pickCandidate } =
  require('../../src/main/version');

describe('compareVersions — SemVer 2.0 precedence', () => {
  const cases = [
    // [a, b, expected sign]
    ['1.5.0',        '1.5.0',        0],
    ['1.5.1',        '1.5.0',        1],
    ['1.6.0',        '1.5.9',        1],
    ['2.0.0',        '1.9.9',        1],
    ['1.5.0',        '1.5.0-rc.1',   1],   // release outranks its own pre-release
    ['1.5.0-rc.1',   '1.5.0-beta.2', 1],   // rc > beta (ASCII)
    ['1.5.0-rc.2',   '1.5.0-rc.1',   1],
    ['1.5.0-rc.10',  '1.5.0-rc.2',   1],   // numeric compare, not ASCII
    ['1.5.1-rc.1',   '1.5.0-rc.1',   1],
    ['1.5.0-rc.1',   '1.5.0-rc.1',   0],
    ['1.5.0-rc.1',   '1.5.0-rc.1.1', -1],  // fewer identifiers ranks lower
  ];

  for (const [a, b, expected] of cases) {
    test(`${a} vs ${b} → ${expected}`, () => {
      // `+ 0` normalises -0 → 0: Jest's toBe is Object.is, and Object.is(0, -0)
      // is false, so the equality cases would fail on sign alone.
      expect(Math.sign(compareVersions(a, b)) + 0).toBe(expected);
      expect(Math.sign(compareVersions(b, a)) + 0).toBe(-expected + 0);  // antisymmetry
    });
  }

  test('a leading v is ignored', () => {
    expect(compareVersions('v1.5.1', '1.5.0')).toBe(1);
    expect(compareVersions('v1.5.0', 'v1.5.0')).toBe(0);
  });

  test('unparseable input sorts lowest and never throws', () => {
    expect(compareVersions('garbage', '1.0.0')).toBe(-1);
    expect(compareVersions(null, '1.0.0')).toBe(-1);
    expect(compareVersions(undefined, undefined)).toBe(0);
    expect(() => compareVersions({}, [])).not.toThrow();
  });
});

describe('isVersionNewer — the stranding regression', () => {
  test('a pre-release user IS told about the final release', () => {
    // This returned false before the fix.
    expect(isVersionNewer('1.5.0', '1.5.0-beta.2')).toBe(true);
    expect(isVersionNewer('1.5.0', '1.5.0-rc.3')).toBe(true);
  });

  test('a pre-release user IS told about a newer pre-release', () => {
    expect(isVersionNewer('1.5.0-rc.2', '1.5.0-rc.1')).toBe(true);
    expect(isVersionNewer('1.5.0-rc.1', '1.5.0-beta.2')).toBe(true);
  });

  test('no false positives — same or older is never "newer"', () => {
    expect(isVersionNewer('1.5.0', '1.5.0')).toBe(false);
    expect(isVersionNewer('1.5.0-rc.1', '1.5.0')).toBe(false);
    expect(isVersionNewer('1.4.9', '1.5.0')).toBe(false);
  });
});

describe('resolveChannel', () => {
  test('auto follows RCs only when the running build is itself a pre-release', () => {
    expect(resolveChannel('auto', '1.5.0-rc.1')).toBe('rc');
    expect(resolveChannel('auto', '1.5.0-beta.2')).toBe('rc');
    expect(resolveChannel('auto', '1.5.0')).toBe('stable');
  });

  test('an explicit setting always wins', () => {
    expect(resolveChannel('stable', '1.5.0-rc.1')).toBe('stable');
    expect(resolveChannel('rc', '1.5.0')).toBe('rc');
  });

  test('missing/unknown settings fall back to auto', () => {
    expect(resolveChannel(undefined, '1.5.0-rc.1')).toBe('rc');
    expect(resolveChannel('nonsense', '1.5.0')).toBe('stable');
  });
});

describe('pickCandidate', () => {
  // Deliberately in GitHub's order (newest-created first), NOT version order.
  const releases = [
    { tag_name: 'v1.4.1',      prerelease: false, draft: false },  // hotfix, newest by date
    { tag_name: 'v1.5.0',      prerelease: false, draft: false },
    { tag_name: 'v1.5.1-rc.1', prerelease: true,  draft: false },
    { tag_name: 'v1.5.2-rc.1', prerelease: true,  draft: true  },  // draft
  ];

  test('stable picks the highest NON-prerelease, not the newest by date', () => {
    // `releases.find(...)` returned v1.4.1 here — offering everyone a downgrade.
    expect(pickCandidate(releases, 'stable').tag_name).toBe('v1.5.0');
  });

  test('rc is a superset — picks the highest of stable + prerelease', () => {
    expect(pickCandidate(releases, 'rc').tag_name).toBe('v1.5.1-rc.1');
  });

  test('drafts are never offered', () => {
    expect(pickCandidate(releases, 'rc').tag_name).not.toBe('v1.5.2-rc.1');
  });

  test('non-version tags are ignored', () => {
    const odd = [{ tag_name: 'nightly', prerelease: false, draft: false }];
    expect(pickCandidate(odd, 'stable')).toBeNull();
  });

  test('empty / invalid input yields null', () => {
    expect(pickCandidate([], 'stable')).toBeNull();
    expect(pickCandidate(null, 'rc')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Wiring: main process and settings UI
// ---------------------------------------------------------------------------
describe('update-channel wiring', () => {
  const fs   = require('fs');
  const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');
  const main = read('src/main/main.js');
  const app  = read('src/renderer/js/app.js');
  const html = read('src/renderer/index.html');

  test('main.js uses the shared module, not its own comparator', () => {
    expect(main).toContain("require('./version')");
    // The old suffix-stripping implementation must be gone for good.
    expect(main).not.toContain("split('-')[0].split('.').map(Number)");
  });

  test('checkForUpdates is channel-aware and picks by SemVer', () => {
    const fn = main.match(/async function checkForUpdates\(opts = \{\}\)[\s\S]{0,1200}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('resolveChannel(');
    expect(fn[0]).toContain('pickCandidate(releases, channel)');
    expect(fn[0]).not.toContain('releases.find(');
  });

  test('the update:check IPC forwards the whole opts object', () => {
    expect(main).toContain("checkForUpdates(opts || {})");
  });

  test('settings UI exposes the channel and the renderer persists it', () => {
    expect(html).toContain('id="settings-update-channel"');
    expect(app).toContain("updateChannel: 'auto'");
    const save = app.match(/async function saveSettings\(\)[\s\S]{0,1100}/);
    expect(save[0]).toContain('settings-update-channel');
    expect(save[0]).toContain('settingsState.updateChannel');
  });
});
