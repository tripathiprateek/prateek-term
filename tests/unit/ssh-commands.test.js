'use strict';
/**
 * tests/unit/ssh-commands.test.js
 *
 * Tests for the per-protocol command builders: SSH, SFTP, SCP, Telnet, FTP.
 * Verifies port flags, user@host formatting, and protocol-specific details.
 */

const {
  buildSSHCommand,
  buildSFTPCommand,
  buildSCPCommand,
  buildTelnetCommand,
  buildFTPCommand,
} = require('../../src/main/ssh-utils');

const BASE = {
  host: 'router.local',
  username: 'admin',
  port: 22,
};

// ---------------------------------------------------------------------------
// SSH command
// ---------------------------------------------------------------------------

describe('buildSSHCommand', () => {
  test('returns command = "ssh"', () => {
    expect(buildSSHCommand(BASE).command).toBe('ssh');
  });

  test('formats destination as user@host', () => {
    const { args } = buildSSHCommand(BASE);
    expect(args[args.length - 1]).toBe('admin@router.local');
  });

  test('omits -p for default port 22', () => {
    const { args } = buildSSHCommand(BASE);
    expect(args).not.toContain('-p');
  });

  test('adds -p for non-default port', () => {
    const { args } = buildSSHCommand({ ...BASE, port: 2222 });
    const idx = args.indexOf('-p');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('2222');
  });

  test('uses host only when username is empty', () => {
    const { args } = buildSSHCommand({ ...BASE, username: '' });
    expect(args[args.length - 1]).toBe('router.local');
  });
});

// ---------------------------------------------------------------------------
// SFTP command
// ---------------------------------------------------------------------------

describe('buildSFTPCommand', () => {
  test('returns command = "sftp"', () => {
    expect(buildSFTPCommand(BASE).command).toBe('sftp');
  });

  test('uses -P (uppercase) for non-default port — not -p', () => {
    const { args } = buildSFTPCommand({ ...BASE, port: 2222 });
    expect(args).not.toContain('-p');
    const idx = args.indexOf('-P');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('2222');
  });

  test('omits -P for default port 22', () => {
    const { args } = buildSFTPCommand(BASE);
    expect(args).not.toContain('-P');
  });
});

// ---------------------------------------------------------------------------
// SCP command — BUG-005 (-r flag for directory uploads)
// ---------------------------------------------------------------------------

describe('buildSCPCommand', () => {
  test('returns command = "scp"', () => {
    expect(buildSCPCommand(BASE).command).toBe('scp');
  });

  test('uses -P (uppercase) for non-default port', () => {
    const { args } = buildSCPCommand({ ...BASE, port: 2222, direction: 'upload', localPath: '/tmp/f', remotePath: '~' });
    const idx = args.indexOf('-P');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('2222');
  });

  test('adds -r when scpRecursive is true (BUG-005: directory upload support)', () => {
    const { args } = buildSCPCommand({ ...BASE, scpRecursive: true, direction: 'upload', localPath: '/tmp/dir', remotePath: '~' });
    expect(args).toContain('-r');
  });

  test('omits -r when scpRecursive is false', () => {
    const { args } = buildSCPCommand({ ...BASE, scpRecursive: false, direction: 'upload', localPath: '/tmp/f', remotePath: '~' });
    expect(args).not.toContain('-r');
  });

  test('adds -O for legacy SCP protocol mode', () => {
    const { args } = buildSCPCommand({ ...BASE, scpLegacy: true, direction: 'upload', localPath: '/tmp/f', remotePath: '~' });
    expect(args).toContain('-O');
  });

  test('upload: local path appears before remote destination', () => {
    const { args } = buildSCPCommand({ ...BASE, direction: 'upload', localPath: '/tmp/file.txt', remotePath: '/uploads' });
    const localIdx  = args.indexOf('/tmp/file.txt');
    const remoteIdx = args.findIndex(a => a.includes(':/uploads'));
    expect(localIdx).toBeGreaterThan(-1);
    expect(remoteIdx).toBeGreaterThan(-1);
    expect(localIdx).toBeLessThan(remoteIdx);
  });

  test('download: remote source appears before local destination', () => {
    const { args } = buildSCPCommand({ ...BASE, direction: 'download', remotePath: '/remote/file.txt', localPath: '/local' });
    const remoteIdx = args.findIndex(a => a.includes(':/remote/file.txt'));
    const localIdx  = args.indexOf('/local');
    expect(remoteIdx).toBeLessThan(localIdx);
  });
});

// ---------------------------------------------------------------------------
// Telnet command
// ---------------------------------------------------------------------------

describe('buildTelnetCommand', () => {
  test('returns command = "telnet"', () => {
    expect(buildTelnetCommand({ host: '192.168.1.1' }).command).toBe('telnet');
  });

  test('host is first argument', () => {
    const { args } = buildTelnetCommand({ host: '192.168.1.1' });
    expect(args[0]).toBe('192.168.1.1');
  });

  test('appends port when specified', () => {
    const { args } = buildTelnetCommand({ host: '192.168.1.1', port: 23 });
    expect(args).toContain('23');
  });

  test('prepends telnetOptions at start of args', () => {
    const { args } = buildTelnetCommand({ host: 'h', telnetOptions: '-E -K' });
    expect(args[0]).toBe('-E');
    expect(args[1]).toBe('-K');
  });
});

// ---------------------------------------------------------------------------
// FTP command
// ---------------------------------------------------------------------------

describe('buildFTPCommand', () => {
  test('returns command = "ftp"', () => {
    expect(buildFTPCommand({ host: 'ftp.example.com' }).command).toBe('ftp');
  });

  test('adds -P for custom port', () => {
    const { args } = buildFTPCommand({ host: 'ftp.example.com', port: 2121 });
    expect(args).toContain('-P');
    expect(args).toContain('2121');
  });

  test('formats as user@host', () => {
    const { args } = buildFTPCommand({ host: 'ftp.example.com', username: 'bob' });
    expect(args[args.length - 1]).toBe('bob@ftp.example.com');
  });
});
