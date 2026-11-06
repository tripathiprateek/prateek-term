'use strict';
/**
 * Web links must open in the user's default browser, not inside the app.
 *
 * xterm's WebLinksAddon was constructed bare, so its default handler ran
 * `window.open(uri)`. With no setWindowOpenHandler registered, Electron turned
 * that into a new in-app BrowserWindow — a second, worse browser with no URL
 * bar, no extensions and no profile.
 *
 * The scheme allowlist is the load-bearing part. A terminal renders output from
 * remote devices, so a "link" is attacker-chosen text. Handing an arbitrary
 * scheme to shell.openExternal is a known Electron code-execution path:
 * file:// opens the target with its registered application, and smb:// can leak
 * NTLM credentials on Windows.
 */

const { isSafeExternalUrl } = require('../../src/main/external-links');

describe('links a user actually clicks', () => {
  test('http and https', () => {
    for (const u of [
      'https://github.com/tripathiprateek/prateek-term',
      'http://192.168.1.68:8080/status?tab=1#frag',
      'HTTPS://Example.COM/Path',
      'https://example.com/a_(b)_c',
    ]) {
      expect(isSafeExternalUrl(u)).toBe(true);
    }
  });

  test('mailto, which terminals print constantly', () => {
    expect(isSafeExternalUrl('mailto:tripathiprateek@gmail.com')).toBe(true);
  });

  test('surrounding whitespace is tolerated', () => {
    expect(isSafeExternalUrl('  https://example.com  ')).toBe(true);
  });
});

describe('schemes that must never reach shell.openExternal', () => {
  test('file:// — opens the target with its registered app', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('file:///Applications/Calculator.app')).toBe(false);
  });

  test('script-bearing pseudo-schemes', () => {
    for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:msgbox', 'data:text/html,<script>']) {
      expect(isSafeExternalUrl(u)).toBe(false);
    }
  });

  test('smb/unc — leaks NTLM credentials on Windows', () => {
    expect(isSafeExternalUrl('smb://evil.example.com/share')).toBe(false);
  });

  test('arbitrary app schemes a remote host could invoke', () => {
    for (const u of ['ms-msdt:/id', 'search-ms:query=x', 'prateekterm://open?path=/', 'ssh://h']) {
      expect(isSafeExternalUrl(u)).toBe(false);
    }
  });

  test('malformed and empty input is refused, never thrown on', () => {
    for (const u of ['', '   ', 'not a url', 'https://', null, undefined, 42, {}, []]) {
      expect(() => isSafeExternalUrl(u)).not.toThrow();
      expect(isSafeExternalUrl(u)).toBe(false);
    }
  });

  test('control characters cannot be smuggled in', () => {
    // A terminal can emit anything; a newline inside a URL has been used to
    // confuse downstream handlers.
    expect(isSafeExternalUrl('https://example.com\n/evil')).toBe(false);
    expect(isSafeExternalUrl('https://example.com\u0000')).toBe(false);
  });

  test('an absurdly long URL is refused', () => {
    expect(isSafeExternalUrl('https://example.com/' + 'a'.repeat(5000))).toBe(false);
  });
});

describe('wiring', () => {
  const fs = require('fs'); const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');

  test('the terminal addon is given a handler instead of defaulting to window.open', () => {
    const app = read('src/renderer/js/app.js');
    expect(app).toMatch(/new WebLinksAddon\.WebLinksAddon\(\s*\(/);
    expect(app).not.toMatch(/new WebLinksAddon\.WebLinksAddon\(\)/);
  });

  test('the renderer routes clicks through the preload bridge', () => {
    expect(read('src/renderer/js/app.js')).toMatch(/openExternal\(/);
    expect(read('src/main/preload.js')).toMatch(/openExternal:.*shell:openExternal/s);
  });

  test('main validates before opening', () => {
    const main = read('src/main/main.js');
    expect(main).toContain("ipcMain.handle('shell:openExternal'");
    expect(main).toMatch(/isSafeExternalUrl/);
  });

  test('every window refuses to become a browser', () => {
    // setWindowOpenHandler must deny in-app windows for ALL three BrowserWindows
    // (main, user guide, help) — otherwise any stray window.open reopens the hole.
    const main = read('src/main/main.js');
    const windows = (main.match(/new BrowserWindow\(/g) || []).length;
    const routed  = (main.match(/routeLinksToDefaultBrowser\(/g) || []).length;
    expect(windows).toBeGreaterThanOrEqual(3);
    // one definition + one call per window
    expect(routed).toBeGreaterThanOrEqual(windows + 1);
    expect(main).toMatch(/setWindowOpenHandler/);
    expect(main).toMatch(/action:\s*'deny'/);
  });
});
