'use strict';
/**
 * dependencies.js — the external command-line tools Prateek-Term shells out to.
 *
 * The app bundles its own native modules (node-pty, serialport, xterm), but it
 * relies on a handful of system binaries for connections and integrations.
 * This module declares them and tests for their presence at startup so the app
 * can highlight anything missing (e.g. `sshpass`, which is needed for password
 * jump-hosts) instead of failing later with a cryptic "command not found".
 *
 * Electron-free / pure Node so it can be unit-tested; the probe is injectable.
 */

const platform = require('./platform');

// Absolute-path candidates worth checking first, because a GUI-launched app has
// a minimal PATH that often omits Homebrew (macOS) / user-local dirs.
const UNIX_BINDIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
const withDir = (name) => UNIX_BINDIRS.map((d) => `${d}/${name}`);

/**
 * The dependency catalogue, resolved for the current OS.
 * @returns {Array<{key,bin,required,purpose,install,candidates}>}
 */
function dependencySpec() {
  const win = platform.isWindows();
  const mac = platform.isMac();
  const exe = (n) => (win ? `${n}.exe` : n);

  return [
    {
      key: 'ssh', bin: exe('ssh'), required: true,
      purpose: 'SSH, SFTP and SCP connections (the core of the app)',
      candidates: win ? [`${process.env.SystemRoot || 'C:\\Windows'}\\System32\\OpenSSH\\ssh.exe`] : withDir('ssh'),
      install: win
        ? 'Windows: Settings → Apps → Optional Features → add "OpenSSH Client".'
        : 'Preinstalled with OpenSSH on macOS and Linux.',
    },
    {
      key: 'sshpass', bin: exe('sshpass'), required: false,
      purpose: 'Password auth for jump hosts and for SCP/SFTP over the MCP bridge',
      candidates: win ? [] : withDir('sshpass'),
      install: win
        ? 'Not available on Windows — use key-based auth instead.'
        : mac
          ? 'brew install hudochenkov/sshpass/sshpass'
          : 'Debian/Ubuntu: sudo apt install sshpass',
    },
    {
      key: 'cloudflared', bin: exe('cloudflared'), required: false,
      purpose: 'Cloudflare Access (zero-trust) SSH tunnels',
      candidates: win ? [] : withDir('cloudflared'),
      install: win
        ? 'winget install --id Cloudflare.cloudflared'
        : mac
          ? 'brew install cloudflared'
          : 'See developers.cloudflare.com/cloudflare-one for your distro.',
    },
    {
      key: 'node', bin: exe('node'), required: false,
      purpose: 'Runs the MCP server for AI (Claude) integration',
      candidates: win ? [`${process.env.ProgramFiles || 'C:\\Program Files'}\\nodejs\\node.exe`] : withDir('node'),
      install: 'Install Node.js 18+ from nodejs.org.',
    },
    {
      key: 'telnet', bin: exe('telnet'), required: false,
      purpose: 'Telnet connections',
      candidates: win ? [] : withDir('telnet'),
      install: win
        ? 'Windows: Optional Features → add "Telnet Client".'
        : mac
          ? 'brew install telnet'
          : 'Debian/Ubuntu: sudo apt install telnet',
    },
  ];
}

/**
 * Probe every dependency and report presence. `probe(bin, candidates)` returns
 * an absolute path or null (defaults to platform.whichBin, injectable for tests).
 * @returns {Array<{key,bin,required,purpose,install,found,path}>}
 */
function checkDependencies(probe = platform.whichBin) {
  return dependencySpec().map((d) => {
    let path = null;
    try { path = probe(d.bin, d.candidates || []); } catch { path = null; }
    return {
      key: d.key, bin: d.bin, required: d.required, purpose: d.purpose,
      install: d.install, found: !!path, path: path || null,
    };
  });
}

module.exports = { dependencySpec, checkDependencies };
