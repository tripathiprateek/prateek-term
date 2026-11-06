'use strict';
/**
 * Choosing which browser a terminal link opens in.
 *
 * Default stays "system default" (shell.openExternal). A user with several
 * browsers installed can pin one instead — e.g. work links in Chrome while
 * Safari stays the OS default.
 *
 * The launch command is built as {command, args} and spawned directly. It must
 * never become a shell string: the URL comes from terminal output, i.e. output
 * from remote devices, so a shell would turn a link into command injection.
 */

const { listBrowsers, openCommand, BROWSER_CATALOG } = require('../../src/main/browsers');

/** A probe that reports only the named paths/binaries as present. */
const only = (...present) => (candidate) => present.includes(candidate);

describe('catalogue', () => {
  test('every entry has an id and a display name', () => {
    for (const b of BROWSER_CATALOG) {
      expect(typeof b.id).toBe('string');
      expect(b.id).toMatch(/^[a-z0-9-]+$/);
      expect(typeof b.name).toBe('string');
      expect(b.name.length).toBeGreaterThan(0);
    }
  });

  test('ids are unique', () => {
    const ids = BROWSER_CATALOG.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('covers the browsers people actually use', () => {
    const ids = BROWSER_CATALOG.map((b) => b.id);
    for (const id of ['safari', 'chrome', 'firefox', 'edge', 'brave']) {
      expect(ids).toContain(id);
    }
  });
});

describe('listBrowsers — only reports what is installed', () => {
  test('macOS: finds app bundles that exist', () => {
    const found = listBrowsers('darwin', only('/Applications/Google Chrome.app', '/Applications/Safari.app'));
    expect(found.map((b) => b.id).sort()).toEqual(['chrome', 'safari']);
    expect(found.find((b) => b.id === 'chrome').target).toBe('/Applications/Google Chrome.app');
  });

  test('nothing installed → empty list, never a crash', () => {
    expect(listBrowsers('darwin', () => false)).toEqual([]);
    expect(listBrowsers('linux', () => false)).toEqual([]);
    expect(listBrowsers('win32', () => false)).toEqual([]);
  });

  test('linux: finds binaries on PATH', () => {
    const found = listBrowsers('linux', only('firefox'));
    expect(found.map((b) => b.id)).toEqual(['firefox']);
    expect(found[0].target).toBe('firefox');
  });

  test('windows: finds an installed exe, expanding %ProgramFiles%', () => {
    // The catalogue stores %ProgramFiles(x86)%\... — expansion has to happen
    // before the probe, or the candidate can never match an installed path.
    const prev = process.env['ProgramFiles(x86)'];
    process.env['ProgramFiles(x86)'] = 'C:\\Program Files (x86)';
    try {
      const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
      const found = listBrowsers('win32', only(edge));
      expect(found.map((b) => b.id)).toEqual(['edge']);
      expect(found[0].target).toBe(edge);
    } finally {
      if (prev === undefined) delete process.env['ProgramFiles(x86)'];
      else process.env['ProgramFiles(x86)'] = prev;
    }
  });

  test('a candidate whose %VAR% is unset is skipped, not probed literally', () => {
    const prev = process.env['ProgramFiles(x86)'];
    delete process.env['ProgramFiles(x86)'];
    try {
      // A probe that says yes to everything must still not yield a browser
      // whose path could not be resolved.
      const seen = [];
      listBrowsers('win32', (c) => { seen.push(c); return false; });
      expect(seen.some((c) => c.includes('%'))).toBe(false);
      expect(seen.some((c) => c.includes('\u0000'))).toBe(false);
    } finally {
      if (prev !== undefined) process.env['ProgramFiles(x86)'] = prev;
    }
  });

  test('Safari is not offered off macOS', () => {
    expect(listBrowsers('linux', () => true).map((b) => b.id)).not.toContain('safari');
    expect(listBrowsers('win32', () => true).map((b) => b.id)).not.toContain('safari');
  });

  test('a probe that throws degrades to "not installed"', () => {
    expect(() => listBrowsers('darwin', () => { throw new Error('boom'); })).not.toThrow();
    expect(listBrowsers('darwin', () => { throw new Error('boom'); })).toEqual([]);
  });

  test('an unknown platform yields nothing rather than guessing', () => {
    expect(listBrowsers('sunos', () => true)).toEqual([]);
  });
});

describe('openCommand — argv, never a shell string', () => {
  const url = 'https://example.com/a?b=c';

  test('macOS opens the bundle via open -a', () => {
    const b = { id: 'chrome', name: 'Chrome', target: '/Applications/Google Chrome.app' };
    expect(openCommand(b, url, 'darwin')).toEqual({
      command: 'open', args: ['-a', '/Applications/Google Chrome.app', url],
    });
  });

  test('linux and windows invoke the binary directly', () => {
    expect(openCommand({ id: 'firefox', target: 'firefox' }, url, 'linux'))
      .toEqual({ command: 'firefox', args: [url] });
    expect(openCommand({ id: 'edge', target: 'C:\\msedge.exe' }, url, 'win32'))
      .toEqual({ command: 'C:\\msedge.exe', args: [url] });
  });

  test('the URL is always the last ARGUMENT, never concatenated', () => {
    // A shell string would make `https://x/;rm -rf ~` executable. Keeping the
    // URL as its own argv entry is what prevents that.
    const nasty = 'https://example.com/$(whoami);rm -rf ~';
    for (const [plat, b] of [
      ['darwin', { target: '/Applications/Safari.app' }],
      ['linux',  { target: 'firefox' }],
      ['win32',  { target: 'C:\\x.exe' }],
    ]) {
      const cmd = openCommand(b, nasty, plat);
      expect(cmd.args[cmd.args.length - 1]).toBe(nasty);
      expect(cmd.command).not.toContain(nasty);
      expect(cmd.command).not.toMatch(/sh$|bash$|cmd\.exe$/i);
    }
  });

  test('a browser with no target yields null — caller falls back to the OS default', () => {
    expect(openCommand(null, url, 'darwin')).toBeNull();
    expect(openCommand({ id: 'x' }, url, 'darwin')).toBeNull();
    expect(openCommand({ id: 'x', target: '/A.app' }, '', 'darwin')).toBeNull();
  });
});

describe('wiring', () => {
  const fs = require('fs'); const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');

  test('every link path goes through one function, so they cannot disagree', () => {
    // The terminal handler, a stray window.open and an attempted navigation
    // must all apply the same scheme check AND the same browser preference.
    const main = read('src/main/main.js');
    expect(main).toMatch(/function openLinkExternally\(url\)/);
    expect((main.match(/openLinkExternally\(/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  test('the chosen browser is launched without a shell', () => {
    const fn = read('src/main/main.js').match(/function openLinkExternally[\s\S]{0,1400}/)[0];
    expect(fn).toMatch(/spawn\(cmd\.command, cmd\.args/);
    expect(fn).not.toMatch(/\bexec\(|shell:\s*true/);
  });

  test('an uninstalled or failed browser falls back to the OS default', () => {
    const fn = read('src/main/main.js').match(/function openLinkExternally[\s\S]{0,1400}/)[0];
    expect(fn).toMatch(/shell\.openExternal\(url\)/);
    expect(fn).toMatch(/not installed/);
    expect(fn).toMatch(/catch/);
  });

  test('the setting is surfaced, persisted and read back', () => {
    expect(read('src/renderer/index.html')).toContain('id="settings-link-browser"');
    const app = read('src/renderer/js/app.js');
    expect(app).toMatch(/async function populateBrowserPicker\(current\)/);
    expect(app).toMatch(/settingsState\.linkBrowser = browserEl\.value/);
    expect(app).toMatch(/populateBrowserPicker\(settingsState\.linkBrowser\)/);
    expect(read('src/main/preload.js')).toMatch(/listBrowsers:.*browsers:list/);
    expect(read('src/main/main.js')).toMatch(/ipcMain\.handle\('browsers:list'/);
  });
});
