'use strict';
/**
 * browsers.js — which browsers are installed, and how to launch one.
 *
 * Terminal links go to the OS default browser (shell.openExternal). A user with
 * several browsers installed can override that per-app, so work links can land
 * in Chrome while Safari stays the system default.
 *
 * Launch commands are returned as {command, args} and spawned directly, never
 * through a shell. The URL comes from terminal output — output produced by
 * remote devices — so a shell string would turn a printed link into command
 * injection. Keeping the URL as its own argv entry is what prevents that.
 *
 * Distinct from platform.chromePath(), which finds one hardcoded Chrome binary
 * for the SOCKS-proxy launch feature; this enumerates browsers for the user to
 * choose between.
 */

const fs = require('fs');
const path = require('path');

/**
 * Known browsers, with where each one lives per platform.
 *   mac   — .app bundle paths (checked for existence)
 *   linux — binary names (resolved on PATH)
 *   win   — absolute .exe paths, %-vars expanded before probing
 * A browser absent from a platform's list is simply not offered there.
 */
const BROWSER_CATALOG = [
  {
    id: 'safari', name: 'Safari',
    mac: ['/Applications/Safari.app'],
  },
  {
    id: 'chrome', name: 'Google Chrome',
    mac: ['/Applications/Google Chrome.app'],
    linux: ['google-chrome', 'google-chrome-stable'],
    win: ['%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe',
      '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe'],
  },
  {
    id: 'firefox', name: 'Firefox',
    mac: ['/Applications/Firefox.app'],
    linux: ['firefox'],
    win: ['%ProgramFiles%\\Mozilla Firefox\\firefox.exe',
      '%ProgramFiles(x86)%\\Mozilla Firefox\\firefox.exe'],
  },
  {
    id: 'edge', name: 'Microsoft Edge',
    mac: ['/Applications/Microsoft Edge.app'],
    linux: ['microsoft-edge', 'microsoft-edge-stable'],
    win: ['%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe',
      '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe'],
  },
  {
    id: 'brave', name: 'Brave',
    mac: ['/Applications/Brave Browser.app'],
    linux: ['brave-browser', 'brave'],
    win: ['%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
  },
  {
    id: 'arc', name: 'Arc',
    mac: ['/Applications/Arc.app'],
  },
  {
    id: 'vivaldi', name: 'Vivaldi',
    mac: ['/Applications/Vivaldi.app'],
    linux: ['vivaldi', 'vivaldi-stable'],
    win: ['%ProgramFiles%\\Vivaldi\\Application\\vivaldi.exe'],
  },
  {
    id: 'opera', name: 'Opera',
    mac: ['/Applications/Opera.app'],
    linux: ['opera'],
    win: ['%ProgramFiles%\\Opera\\launcher.exe'],
  },
  {
    id: 'chromium', name: 'Chromium',
    mac: ['/Applications/Chromium.app'],
    linux: ['chromium', 'chromium-browser'],
  },
];

const KEY_FOR_PLATFORM = { darwin: 'mac', linux: 'linux', win32: 'win' };

/** Expand %VAR% in a Windows path. An unset var makes the path unusable. */
function expandWinVars(p) {
  return p.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '\u0000');
}

/** Default probe: does this app bundle / binary / exe actually exist? */
function defaultProbe(candidate, platform) {
  if (platform === 'linux') {
    // Walk PATH directly rather than shelling out — no shell, no quoting rules.
    const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    return dirs.some((d) => {
      try { fs.accessSync(path.join(d, candidate), fs.constants.X_OK); return true; }
      catch { return false; }
    });
  }
  try { fs.accessSync(candidate); return true; } catch { return false; }
}

/**
 * Browsers installed on `platform`.
 * @param {string} platform  a process.platform value
 * @param {(candidate: string) => boolean} [probe]  injectable for tests
 * @returns {Array<{id: string, name: string, target: string}>}
 *          `target` is the bundle path or binary to launch
 */
function listBrowsers(platform = process.platform, probe = null) {
  const key = KEY_FOR_PLATFORM[platform];
  if (!key) return [];                        // unknown OS — offer nothing rather than guess
  const test = probe || ((c) => defaultProbe(c, platform));
  const out = [];
  for (const b of BROWSER_CATALOG) {
    const candidates = b[key];
    if (!Array.isArray(candidates)) continue;  // not available on this platform
    for (const raw of candidates) {
      const candidate = key === 'win' ? expandWinVars(raw) : raw;
      if (candidate.includes('\u0000')) continue;   // an env var was unset
      let present = false;
      try { present = !!test(candidate); } catch { present = false; }
      if (present) { out.push({ id: b.id, name: b.name, target: candidate }); break; }
    }
  }
  return out;
}

/**
 * How to launch `url` in `browser`.
 * @returns {{command: string, args: string[]}|null}  null → use the OS default
 */
function openCommand(browser, url, platform = process.platform) {
  if (!browser || !browser.target) return null;
  if (typeof url !== 'string' || !url) return null;
  if (platform === 'darwin') {
    // `open -a <bundle> <url>` hands the URL to the app; open(1) is not a shell.
    return { command: 'open', args: ['-a', browser.target, url] };
  }
  // Linux and Windows invoke the browser binary with the URL as its argument.
  return { command: browser.target, args: [url] };
}

module.exports = { BROWSER_CATALOG, listBrowsers, openCommand };
