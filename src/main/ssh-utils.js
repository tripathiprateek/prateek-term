/**
 * ssh-utils.js — Pure SSH/SCP/SFTP command-building utilities.
 *
 * Extracted from main.js so they can be unit-tested without Electron.
 * No electron imports — plain Node.js only.
 */

'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// SSH_ASKPASS-based password injection
// ---------------------------------------------------------------------------

/**
 * Write a temporary shell helper script that prints the password to stdout.
 * SSH calls this script (via SSH_ASKPASS) when it needs the password,
 * completely bypassing sshpass and any nested-PTY issues.
 *
 * The script is written to a system temp directory with mode 0700.
 * Callers must delete it after the SSH process exits (see _cleanupFiles).
 */
function writeAskpassScript(password) {
  // Escape single quotes for safe embedding in a single-quoted shell string:
  //   '   →   '\''   (end quote, escaped quote, start quote)
  const escaped = password.replace(/'/g, "'\\''");
  const script  = `#!/bin/sh\nprintf '%s' '${escaped}'\n`;
  const tmpPath = path.join(
    os.tmpdir(),
    `ptterm_ap_${crypto.randomBytes(8).toString('hex')}`
  );
  fs.writeFileSync(tmpPath, script, { mode: 0o700 });
  return tmpPath;
}

/**
 * Wrap an SSH command to use SSH_ASKPASS for password injection.
 *
 * This is the preferred approach over sshpass when running inside node-pty
 * because sshpass creates its own inner PTY to intercept SSH prompts, which
 * conflicts with node-pty's outer PTY and causes the password to be injected
 * at the wrong moment (sshpass exit code 5 — "wrong password" — even when
 * the password is correct).
 *
 * SSH_ASKPASS_REQUIRE=force (OpenSSH ≥ 8.4) makes SSH call the helper script
 * regardless of whether a controlling terminal is present.
 *
 * Returns { command, args, env, _cleanupFiles } where _cleanupFiles is an
 * array of temp file paths that must be deleted after the PTY exits.
 */
function wrapWithAskpass(command, args, profile) {
  if (!profile.password || profile.pemFile) {
    return { command, args, env: {}, _cleanupFiles: [] };
  }
  const askpassScript = writeAskpassScript(profile.password);
  return {
    command,
    args,
    env: {
      SSH_ASKPASS:         askpassScript,
      SSH_ASKPASS_REQUIRE: 'force',
    },
    _cleanupFiles: [askpassScript],
  };
}

// ---------------------------------------------------------------------------
// sshpass detection
// ---------------------------------------------------------------------------

/**
 * Return true if sshpass is installed and executable.
 * Checks common Homebrew paths (Intel + Apple Silicon) and /usr/bin.
 */
const SSHPASS_CANDIDATES = [
  '/opt/homebrew/bin/sshpass', // Apple Silicon Homebrew
  '/usr/local/bin/sshpass',    // Intel Homebrew
  '/usr/bin/sshpass',
];

/**
 * Return the full path to sshpass, or null if not installed.
 * Returning the full path avoids PATH-lookup issues when the PTY env
 * differs from the login shell env (e.g. Dock launch on macOS).
 */
function findSshpass() {
  for (const p of SSHPASS_CANDIDATES) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* try next */ }
  }
  try {
    const p = execSync('which sshpass', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (p) return p;
  } catch { /* not found */ }
  return null;
}

function isSshpassAvailable() {
  return findSshpass() !== null;
}

/**
 * Wrap a command with sshpass if password auth is used AND sshpass is available.
 * Falls back to running ssh directly so the user gets an interactive prompt.
 *
 * Uses -p (direct argument) rather than -e (env var) so the password is reliably
 * delivered even when the PTY env chain doesn't propagate SSHPASS correctly
 * (a known issue with Electron IPC → node-pty on macOS). The full path to
 * sshpass is used to avoid PATH-lookup failures when launched from the Dock.
 */
function wrapWithSshpass(command, args, profile) {
  const sshpassPath = profile.password ? findSshpass() : null;
  if (sshpassPath) {
    return {
      command: sshpassPath,
      args: ['-p', profile.password, command, ...args],
      env: {},
    };
  }
  return { command, args, env: {} };
}

// ---------------------------------------------------------------------------
// SSH flag building
// ---------------------------------------------------------------------------

/**
 * Build common SSH flags shared by ssh, sftp, and scp commands.
 *
 * Key algorithm decisions (see inline comments):
 *  - HostKeyAlgorithms=+ssh-rsa   re-enables ssh-rsa for older network gear
 *  - PubkeyAcceptedAlgorithms=+ssh-rsa  (renamed from PubkeyAcceptedKeyTypes in 8.5+)
 *  - ssh-dss is NOT included — fully removed in OpenSSH 8.8+
 *  - KexAlgorithms=+diffie-hellman-group14-sha1 NOT included — broken in 8.7+
 */
function buildCommonSSHFlags(profile) {
  const flags = [];

  flags.push('-o', 'ConnectTimeout=15');

  if (!profile.strictHostOff) {
    flags.push('-o', 'StrictHostKeyChecking=accept-new');
  }

  // Re-enable ssh-rsa only (NOT ssh-dss — removed in OpenSSH 8.8+).
  flags.push('-o', 'HostKeyAlgorithms=+ssh-rsa');
  flags.push('-o', 'PubkeyAcceptedAlgorithms=+ssh-rsa'); // renamed from PubkeyAcceptedKeyTypes in 8.5+

  // When a password is set (sshpass path), force keyboard-interactive first then
  // password. Without this, OpenSSH tries publickey first — sshpass then intercepts
  // the wrong prompt and the connection fails with exit code 1.
  // Teltonika / BusyBox devices typically advertise keyboard-interactive only.
  if (profile.password && !profile.pemFile) {
    flags.push('-o', 'PreferredAuthentications=keyboard-interactive,password');
  }

  if (profile.pemFile) {
    flags.push('-i', profile.pemFile);
  }

  if (profile.compression) flags.push('-C');
  if (profile.verbose)     flags.push('-v');
  if (profile.agentForwarding) flags.push('-A');
  if (profile.x11Forwarding)   flags.push('-X');
  if (profile.ipv4) flags.push('-4');
  if (profile.ipv6) flags.push('-6');

  if (profile.strictHostOff) {
    flags.push('-o', 'StrictHostKeyChecking=no');
    flags.push('-o', 'UserKnownHostsFile=/dev/null');
  }

  if (profile.keepAlive) {
    flags.push('-o', 'ServerAliveInterval=60');
  }

  if (profile.extraOptions) {
    const extra = profile.extraOptions.trim().split(/\s+/);
    flags.push(...extra);
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Per-protocol command builders
// ---------------------------------------------------------------------------

function buildSSHCommand(profile) {
  const args = buildCommonSSHFlags(profile);

  if (profile.port && profile.port !== 22) {
    args.push('-p', String(profile.port));
  }

  const userHost = profile.username
    ? `${profile.username}@${profile.host}`
    : profile.host;

  args.push(userHost);

  // Password injection is handled in the renderer via auto-type (see app.js).
  // The renderer watches PTY output for "Password:" and sends the password via
  // sendInput — no sshpass, no SSH_ASKPASS, no PTY nesting issues.
  return { command: 'ssh', args, env: {}, _cleanupFiles: [] };
}

function buildSFTPCommand(profile) {
  const args = buildCommonSSHFlags(profile);

  if (profile.port && profile.port !== 22) {
    args.push('-P', String(profile.port)); // SFTP uses -P (uppercase)
  }

  const userHost = profile.username
    ? `${profile.username}@${profile.host}`
    : profile.host;

  args.push(userHost);

  return wrapWithSshpass('sftp', args, profile);
}

function buildSCPCommand(profile) {
  const args = buildCommonSSHFlags(profile);

  if (profile.port && profile.port !== 22) {
    args.push('-P', String(profile.port)); // SCP uses -P (uppercase)
  }

  if (profile.scpLegacy)    args.push('-O');
  if (profile.scpRecursive) args.push('-r');

  const userHost = profile.username
    ? `${profile.username}@${profile.host}`
    : profile.host;

  const remotePath = profile.remotePath || '.';
  const localPath  = profile.localPath  || '.';

  if (profile.direction === 'download') {
    args.push(`${userHost}:${remotePath}`, localPath);
  } else {
    args.push(localPath, `${userHost}:${remotePath}`);
  }

  return wrapWithSshpass('scp', args, profile);
}

function buildTelnetCommand(profile) {
  const args = [profile.host];

  if (profile.port) {
    args.push(String(profile.port));
  }

  if (profile.telnetOptions) {
    const extraArgs = profile.telnetOptions.trim().split(/\s+/);
    args.unshift(...extraArgs);
  }

  return { command: 'telnet', args, env: {} };
}

function buildFTPCommand(profile) {
  const args = [];

  if (profile.port) {
    args.push('-P', String(profile.port));
  }

  if (profile.ftpOptions) {
    const extraArgs = profile.ftpOptions.trim().split(/\s+/);
    args.push(...extraArgs);
  }

  const userHost = profile.username
    ? `${profile.username}@${profile.host}`
    : profile.host;

  args.push(userHost);

  return { command: 'ftp', args, env: {} };
}

// ---------------------------------------------------------------------------
// SSH config import / export
// ---------------------------------------------------------------------------

/**
 * Parse an OpenSSH config file text into Prateek-Term profile objects.
 */
function parseSSHConfig(text) {
  const profiles = [];
  let current = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const m = line.match(/^(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    const k = key.toLowerCase();

    if (k === 'host') {
      if (current && current.name !== '*') profiles.push(current);
      current = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: value.trim(),
        protocol: 'ssh',
        host: '',
        port: null,
        username: '',
        tags: [],
        sshMode: 'terminal',
        authType: 'key',
        keyMode: 'file',
        pemFile: null,
        pemText: null,
        password: null,
        compression: false, verbose: false, agentForwarding: false,
        x11Forwarding: false, strictHostOff: false, keepAlive: false,
        ipv4: false, ipv6: false, extraOptions: '',
      };
    } else if (current) {
      if (k === 'hostname')     current.host     = value.trim();
      else if (k === 'port')    current.port     = parseInt(value, 10) || null;
      else if (k === 'user')    current.username = value.trim();
      else if (k === 'identityfile') {
        current.pemFile  = value.trim().replace(/^~/, process.env.HOME || '~');
        current.authType = 'key';
        current.keyMode  = 'file';
      }
      else if (k === 'compression')           current.compression     = /yes/i.test(value);
      else if (k === 'forwardagent')           current.agentForwarding = /yes/i.test(value);
      else if (k === 'forwardx11')             current.x11Forwarding   = /yes/i.test(value);
      else if (k === 'stricthostkeychecking')  current.strictHostOff   = /no/i.test(value);
      else if (k === 'serveralivecountmax' || k === 'serveraliveinterval') current.keepAlive = true;
    }
  }
  if (current && current.name !== '*') profiles.push(current);
  return profiles;
}

/**
 * Convert Prateek-Term profiles → OpenSSH config text.
 */
function profilesToSSHConfig(profiles) {
  const sshProfiles = profiles.filter(p => p.protocol === 'ssh' && p.host);
  if (!sshProfiles.length) return '# No SSH profiles to export\n';

  const lines = [
    '# Prateek-Term SSH Config — compatible with Termius, Tabby, and any OpenSSH client',
    `# Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const p of sshProfiles) {
    lines.push(`Host ${p.name || p.host}`);
    lines.push(`    HostName ${p.host}`);
    if (p.port)     lines.push(`    Port ${p.port}`);
    if (p.username) lines.push(`    User ${p.username}`);
    if (p.pemFile)  lines.push(`    IdentityFile ${p.pemFile}`);
    if (p.compression)    lines.push('    Compression yes');
    if (p.agentForwarding) lines.push('    ForwardAgent yes');
    if (p.x11Forwarding)   lines.push('    ForwardX11 yes');
    if (p.strictHostOff) {
      lines.push('    StrictHostKeyChecking no');
      lines.push('    UserKnownHostsFile /dev/null');
    }
    if (p.keepAlive) {
      lines.push('    ServerAliveInterval 60');
      lines.push('    ServerAliveCountMax 3');
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  writeAskpassScript,
  wrapWithAskpass,
  findSshpass,
  isSshpassAvailable,
  wrapWithSshpass,
  buildCommonSSHFlags,
  buildSSHCommand,
  buildSFTPCommand,
  buildSCPCommand,
  buildTelnetCommand,
  buildFTPCommand,
  parseSSHConfig,
  profilesToSSHConfig,
};
