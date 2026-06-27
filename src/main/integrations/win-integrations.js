/**
 * win-integrations.js — Windows shell integration for Prateek-Term.
 *
 * Windows has no system "default terminal" API (pre-Windows Terminal), so the
 * closest equivalent to macOS's Finder Quick Action is a right-click context
 * menu on folders and folder backgrounds: "Open in Prateek-Term". We register
 * it under HKCU (no admin needed) pointing at the app exe; clicking it launches
 * Prateek-Term with the folder path as argv, which the single-instance handler
 * routes to an open-folder. Protocol registration is handled by Electron's
 * setAsDefaultProtocolClient in main.js.
 *
 * Registry writes go through `reg.exe` (always present) so we need no native
 * module. All functions are best-effort and throw with a readable message on
 * failure so the caller can surface it.
 */

'use strict';

const { execFileSync } = require('child_process');

const MENU_LABEL = 'Open in Prateek-Term';
// HKCU keys — per-user, no elevation required.
const KEY_DIR_SHELL = 'HKCU\\Software\\Classes\\Directory\\shell\\PrateekTerm';
const KEY_DIR_BG    = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\PrateekTerm';

function reg(args) {
  return execFileSync('reg.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

/** True when the context-menu entry is present. */
function isRegistered() {
  try {
    reg(['query', KEY_DIR_SHELL]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register the "Open in Prateek-Term" context menu on folders and folder
 * backgrounds. `exePath` is the absolute path to the running app executable.
 * `%V` (folder) / `%1` are substituted by Explorer at click time.
 */
function register(exePath) {
  if (!exePath) throw new Error('register: exePath required');
  const icon = `${exePath},0`;

  // Folder right-click: %1 is the clicked folder.
  reg(['add', KEY_DIR_SHELL, '/ve', '/d', MENU_LABEL, '/f']);
  reg(['add', KEY_DIR_SHELL, '/v', 'Icon', '/d', icon, '/f']);
  reg(['add', `${KEY_DIR_SHELL}\\command`, '/ve', '/d', `"${exePath}" "%1"`, '/f']);

  // Folder background right-click: %V is the current folder.
  reg(['add', KEY_DIR_BG, '/ve', '/d', MENU_LABEL, '/f']);
  reg(['add', KEY_DIR_BG, '/v', 'Icon', '/d', icon, '/f']);
  reg(['add', `${KEY_DIR_BG}\\command`, '/ve', '/d', `"${exePath}" "%V"`, '/f']);
}

/** Remove the context-menu entries (best-effort; ignores "not found"). */
function unregister() {
  for (const key of [KEY_DIR_SHELL, KEY_DIR_BG]) {
    try { reg(['delete', key, '/f']); } catch { /* already gone */ }
  }
}

module.exports = { isRegistered, register, unregister, MENU_LABEL };
