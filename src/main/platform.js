/**
 * platform.js — single source of truth for per-OS decisions.
 *
 * Centralizes every place the app must behave differently on macOS, Windows,
 * and Linux: shell selection, browser/binary discovery, config-file locations,
 * the SSH agent socket, and how to wrap a string command for a shell.
 *
 * All exported functions read `process.platform` at call time (not at module
 * load) so they can be unit-tested by overriding `process.platform`.
 */

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execSync } = require('child_process');

const isWindows = () => process.platform === 'win32';
const isMac     = () => process.platform === 'darwin';
const isLinux   = () => !isWindows() && !isMac();

const tmpDir = () => os.tmpdir();

/**
 * Resolve an executable: prefer an explicit candidate that exists on disk,
 * else ask the OS (`where` on Windows, `which` elsewhere). Returns an absolute
 * path, or null when nothing is found.
 *
 * @param {string} name       command name to look up on PATH (e.g. "node")
 * @param {string[]} [candidates] absolute fallback paths, checked first
 * @returns {string|null}
 */
function whichBin(name, candidates = []) {
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch { /* keep looking */ }
  }
  const lookup = isWindows() ? `where ${name}` : `which ${name}`;
  try {
    const out = execSync(lookup, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    // `where` can return several lines — take the first.
    const first = out.split(/\r?\n/)[0].trim();
    return first || null;
  } catch {
    return null;
  }
}

/**
 * The interactive shell to spawn for a local terminal tab.
 * macOS/Linux: $SHELL → zsh → bash → sh. Windows: pwsh → powershell → COMSPEC/cmd.
 */
function findShell() {
  if (isWindows()) {
    const candidates = [
      whichBin('pwsh.exe', [
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      ]),
      whichBin('powershell.exe', [
        path.join(process.env.SystemRoot || 'C:\\Windows',
          'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ]),
      process.env.COMSPEC,
      'cmd.exe',
    ].filter(Boolean);
    return candidates[0];
  }
  const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);
  for (const sh of candidates) {
    try { fs.accessSync(sh, fs.constants.X_OK); return sh; } catch { /* next */ }
  }
  return '/bin/sh';
}

/**
 * Default args for the local shell. Unix shells get `-l` (login) so the user's
 * full PATH/profile is sourced; Windows shells take no login flag.
 */
function loginShellArgs() {
  return isWindows() ? [] : ['-l'];
}

/**
 * Wrap a string command for non-interactive execution by a shell.
 * Windows: cmd /c "<cmd>"; elsewhere: /bin/sh -c "<cmd>".
 * @returns {{shell:string, args:string[]}}
 */
function shellExec(cmd) {
  if (isWindows()) {
    return { shell: process.env.COMSPEC || 'cmd.exe', args: ['/c', cmd] };
  }
  return { shell: '/bin/sh', args: ['-c', cmd] };
}

/**
 * Resolve a bare command name (e.g. "ssh") to a full executable path on Windows.
 * node-pty's Windows (ConPTY) backend does NOT search PATH — spawning a bare
 * "ssh" fails with "File not found". On macOS/Linux the name is returned
 * unchanged (the PTY there resolves via PATH). Returns the original string if
 * nothing better is found.
 */
function resolveCommand(cmd) {
  if (!isWindows() || !cmd) return cmd;
  // Already a path or carries an extension — use as-is.
  if (cmd.includes('\\') || cmd.includes('/') || /\.[a-z0-9]+$/i.test(cmd)) return cmd;
  const sysRoot = process.env.SystemRoot || 'C:\\Windows';
  const candidates = [];
  if (cmd === 'ssh' || cmd === 'scp' || cmd === 'sftp') {
    candidates.push(path.join(sysRoot, 'System32', 'OpenSSH', `${cmd}.exe`));
  }
  return whichBin(`${cmd}.exe`, candidates) || whichBin(cmd, candidates) || cmd;
}

/** Absolute path to the Google Chrome / Chromium executable, or null. */
function chromePath() {
  if (isMac()) {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return fs.existsSync(p) ? p : null;
  }
  if (isWindows()) {
    const pf   = process.env['ProgramFiles']        || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)']   || 'C:\\Program Files (x86)';
    const lad  = process.env['LOCALAPPDATA']        || path.join(os.homedir(), 'AppData', 'Local');
    return whichBin('chrome.exe', [
      path.join(pf,   'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(lad,  'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]);
  }
  // Linux
  return whichBin('google-chrome', []) ||
         whichBin('google-chrome-stable', []) ||
         whichBin('chromium', []) ||
         whichBin('chromium-browser', []) ||
         whichBin('microsoft-edge', []);
}

/** Path to Claude Desktop's config file (mirrors its per-OS location). */
function claudeDesktopConfigPath() {
  if (isMac()) {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (isWindows()) {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Claude', 'claude_desktop_config.json');
}

/**
 * Best-effort SSH agent socket. macOS apps launched from the Dock lose
 * SSH_AUTH_SOCK, so we scan launchd's tmp dir for it. On Windows/Linux we trust
 * the inherited env (Pageant / ssh-agent). Returns a socket path or null.
 */
function sshAgentSock() {
  if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK;
  if (!isMac()) return null;
  try {
    const base = '/private/tmp';
    const dirs = fs.readdirSync(base).filter(d => d.startsWith('com.apple.launchd.'));
    for (const d of dirs) {
      const sock = path.join(base, d, 'Listeners');
      if (fs.existsSync(sock)) return sock;
    }
  } catch { /* no agent — IdentitiesOnly handles key profiles */ }
  return null;
}

module.exports = {
  isWindows,
  isMac,
  isLinux,
  tmpDir,
  whichBin,
  findShell,
  loginShellArgs,
  shellExec,
  resolveCommand,
  chromePath,
  claudeDesktopConfigPath,
  sshAgentSock,
};
