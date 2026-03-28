/**
 * ssh-utils.js — Pure SSH/SCP/SFTP command-building utilities.
 *
 * Extracted from main.js so they can be unit-tested without Electron.
 * No electron imports — plain Node.js only.
 */

'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// sshpass detection
// ---------------------------------------------------------------------------

/**
 * Return true if sshpass is installed and executable.
 * Checks common Homebrew paths (Intel + Apple Silicon) and /usr/bin.
 */
function isSshpassAvailable() {
  const candidates = [
    '/opt/homebrew/bin/sshpass', // Apple Silicon Homebrew
    '/usr/local/bin/sshpass',    // Intel Homebrew
    '/usr/bin/sshpass',
  ];
  for (const p of candidates) {
    try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { /* try next */ }
  }
  try {
    execSync('which sshpass', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

/**
 * Wrap a command with sshpass if password auth is used AND sshpass is available.
 * Falls back to running ssh directly so the user gets an interactive prompt.
 * Uses SSHPASS env var (-e flag) to avoid exposing password in the process list.
 */
function wrapWithSshpass(command, args, profile) {
  if (profile.password && isSshpassAvailable()) {
    return {
      command: 'sshpass',
      args: ['-e', command, ...args],
      env: { SSHPASS: profile.password },
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

  return wrapWithSshpass('ssh', args, profile);
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
