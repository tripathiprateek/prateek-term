'use strict';
/**
 * tests/unit/ssh-flags.test.js
 *
 * Regression tests for SSH algorithm flags.
 *
 * BUG-001: Bad key types error — OpenSSH 8.8+ removed ssh-dss and
 *          diffie-hellman-group14-sha1.  Adding them via -o caused
 *          "Bad key types" exit code 255 and silent exit code 1.
 *
 * BUG-002: Wrong option name — PubkeyAcceptedKeyTypes was renamed to
 *          PubkeyAcceptedAlgorithms in OpenSSH 8.5+.
 */

const { buildCommonSSHFlags } = require('../../src/main/ssh-utils');

const BASE_PROFILE = {
  host: '192.168.1.1',
  username: 'admin',
  port: 22,
};

// ---------------------------------------------------------------------------
// Algorithm safety — BUG-001 regression
// ---------------------------------------------------------------------------

describe('SSH flags — algorithm safety (BUG-001)', () => {
  let flags;

  beforeEach(() => {
    flags = buildCommonSSHFlags(BASE_PROFILE);
  });

  test('does NOT include ssh-dss (removed in OpenSSH 8.8+)', () => {
    const joined = flags.join(' ');
    expect(joined).not.toContain('ssh-dss');
  });

  test('does NOT include diffie-hellman-group14-sha1 (broken SHA-1 kex, removed 8.7+)', () => {
    const joined = flags.join(' ');
    expect(joined).not.toContain('diffie-hellman-group14-sha1');
  });

  test('does NOT include diffie-hellman-group1-sha1 (removed in OpenSSH 8.8+)', () => {
    const joined = flags.join(' ');
    expect(joined).not.toContain('diffie-hellman-group1-sha1');
  });

  test('includes HostKeyAlgorithms=+ssh-rsa (re-enables for legacy gear)', () => {
    expect(flags).toContain('HostKeyAlgorithms=+ssh-rsa');
  });
});

// ---------------------------------------------------------------------------
// Option name correctness — BUG-002 regression
// ---------------------------------------------------------------------------

describe('SSH flags — option name correctness (BUG-002)', () => {
  let flags;

  beforeEach(() => {
    flags = buildCommonSSHFlags(BASE_PROFILE);
  });

  test('uses PubkeyAcceptedAlgorithms (not the removed PubkeyAcceptedKeyTypes)', () => {
    const joined = flags.join(' ');
    expect(joined).toContain('PubkeyAcceptedAlgorithms=+ssh-rsa');
    expect(joined).not.toContain('PubkeyAcceptedKeyTypes');
  });
});

// ---------------------------------------------------------------------------
// Connect timeout (quality-of-life default)
// ---------------------------------------------------------------------------

describe('SSH flags — connection timeout', () => {
  test('always includes ConnectTimeout=15 to avoid 2-minute hangs', () => {
    const flags = buildCommonSSHFlags(BASE_PROFILE);
    expect(flags).toContain('ConnectTimeout=15');
  });
});

// ---------------------------------------------------------------------------
// StrictHostKeyChecking
// ---------------------------------------------------------------------------

describe('SSH flags — StrictHostKeyChecking', () => {
  test('uses accept-new by default (safe first-connect; warns on key change)', () => {
    const flags = buildCommonSSHFlags(BASE_PROFILE);
    expect(flags).toContain('StrictHostKeyChecking=accept-new');
  });

  test('switches to StrictHostKeyChecking=no when strictHostOff is set', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, strictHostOff: true });
    expect(flags).toContain('StrictHostKeyChecking=no');
    expect(flags).not.toContain('StrictHostKeyChecking=accept-new');
  });

  test('adds UserKnownHostsFile=/dev/null when strictHostOff is set', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, strictHostOff: true });
    expect(flags).toContain('UserKnownHostsFile=/dev/null');
  });
});

// ---------------------------------------------------------------------------
// Optional feature flags
// ---------------------------------------------------------------------------

describe('SSH flags — optional features', () => {
  test('adds -C compression flag when compression is true', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, compression: true });
    expect(flags).toContain('-C');
  });

  test('does NOT add -C when compression is false', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, compression: false });
    expect(flags).not.toContain('-C');
  });

  test('adds -v verbose flag', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, verbose: true });
    expect(flags).toContain('-v');
  });

  test('adds -A agent forwarding flag', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, agentForwarding: true });
    expect(flags).toContain('-A');
  });

  test('adds -X X11 forwarding flag', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, x11Forwarding: true });
    expect(flags).toContain('-X');
  });

  test('adds -4 IPv4-only flag', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, ipv4: true });
    expect(flags).toContain('-4');
  });

  test('adds -6 IPv6-only flag', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, ipv6: true });
    expect(flags).toContain('-6');
  });

  test('adds ServerAliveInterval=60 for keepAlive', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, keepAlive: true });
    expect(flags).toContain('ServerAliveInterval=60');
  });

  test('adds identity file via -i when pemFile is set', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, pemFile: '/home/user/.ssh/id_rsa' });
    const idx = flags.indexOf('-i');
    expect(idx).toBeGreaterThan(-1);
    expect(flags[idx + 1]).toBe('/home/user/.ssh/id_rsa');
  });

  test('appends raw extraOptions to flag list', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, extraOptions: '-o BatchMode=yes' });
    expect(flags).toContain('-o');
    expect(flags).toContain('BatchMode=yes');
  });
});

// ---------------------------------------------------------------------------
// BUG-003: sshpass exit code 1 on keyboard-interactive devices (Teltonika / BusyBox)
//
// Cause: OpenSSH tries publickey first; sshpass intercepts the wrong prompt
//        and exits 1. Devices like Teltonika RUT951 advertise keyboard-interactive
//        only, so sshpass must be told to skip publickey entirely.
// Fix:   Add PreferredAuthentications=keyboard-interactive,password when a
//        password is set and no PEM file is configured.
// ---------------------------------------------------------------------------

describe('SSH flags — PreferredAuthentications for sshpass (BUG-003)', () => {
  test('adds PreferredAuthentications=keyboard-interactive,password when password set, no PEM', () => {
    const flags = buildCommonSSHFlags({ ...BASE_PROFILE, password: 's3cr3t' });
    const joined = flags.join(' ');
    expect(joined).toContain('PreferredAuthentications=keyboard-interactive,password');
  });

  test('does NOT add PreferredAuthentications when no password set', () => {
    const flags = buildCommonSSHFlags(BASE_PROFILE);
    const joined = flags.join(' ');
    expect(joined).not.toContain('PreferredAuthentications');
  });

  test('does NOT add PreferredAuthentications when PEM file is used (key-based auth)', () => {
    const flags = buildCommonSSHFlags({
      ...BASE_PROFILE,
      password: 's3cr3t',
      pemFile: '/home/user/.ssh/id_rsa',
    });
    const joined = flags.join(' ');
    expect(joined).not.toContain('PreferredAuthentications');
  });

  test('Teltonika RUT951 profile generates correct auth flags', () => {
    // Reproduces the exact failure: sshpass -e ssh … root@192.168.1.1 exits 1
    const profile = {
      host: '192.168.1.1',
      username: 'root',
      port: 22,
      password: 'admin123',
      strictHostOff: true,
      keepAlive: true,
    };
    const flags = buildCommonSSHFlags(profile);
    const joined = flags.join(' ');
    expect(joined).toContain('PreferredAuthentications=keyboard-interactive,password');
    expect(joined).toContain('StrictHostKeyChecking=no');
    expect(joined).toContain('ServerAliveInterval=60');
  });
});
