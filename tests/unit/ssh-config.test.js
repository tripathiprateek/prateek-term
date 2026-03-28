'use strict';
/**
 * tests/unit/ssh-config.test.js
 *
 * Tests for OpenSSH config import (parseSSHConfig) and export (profilesToSSHConfig).
 * Covers round-trip fidelity and edge cases.
 */

const { parseSSHConfig, profilesToSSHConfig } = require('../../src/main/ssh-utils');

// ---------------------------------------------------------------------------
// parseSSHConfig
// ---------------------------------------------------------------------------

describe('parseSSHConfig — import', () => {
  const SAMPLE = `
# Sample SSH config
Host router
    HostName 192.168.1.1
    User admin
    Port 2222
    IdentityFile ~/.ssh/router_rsa
    Compression yes
    ForwardAgent yes
    KeepAlive yes
    ServerAliveInterval 60

Host webserver
    HostName 10.0.0.5
    User ubuntu
    StrictHostKeyChecking no
`;

  let profiles;

  beforeEach(() => {
    profiles = parseSSHConfig(SAMPLE);
  });

  test('parses two host entries', () => {
    expect(profiles).toHaveLength(2);
  });

  test('first profile: name = "router"', () => {
    expect(profiles[0].name).toBe('router');
  });

  test('first profile: host = "192.168.1.1"', () => {
    expect(profiles[0].host).toBe('192.168.1.1');
  });

  test('first profile: port = 2222', () => {
    expect(profiles[0].port).toBe(2222);
  });

  test('first profile: username = "admin"', () => {
    expect(profiles[0].username).toBe('admin');
  });

  test('first profile: pemFile expands ~ to HOME', () => {
    const home = process.env.HOME || '~';
    expect(profiles[0].pemFile).toBe(`${home}/.ssh/router_rsa`);
  });

  test('first profile: compression = true', () => {
    expect(profiles[0].compression).toBe(true);
  });

  test('first profile: agentForwarding = true', () => {
    expect(profiles[0].agentForwarding).toBe(true);
  });

  test('second profile: strictHostOff = true when StrictHostKeyChecking=no', () => {
    expect(profiles[1].strictHostOff).toBe(true);
  });

  test('second profile: protocol is always "ssh"', () => {
    expect(profiles[1].protocol).toBe('ssh');
  });

  test('comment lines are ignored', () => {
    // All three profiles in the fixture above, only two real Host blocks
    expect(profiles).toHaveLength(2);
  });

  test('Host * wildcard blocks are excluded', () => {
    const config = 'Host *\n    ServerAliveInterval 60\n\nHost real\n    HostName 1.2.3.4\n';
    const result = parseSSHConfig(config);
    expect(result.every(p => p.name !== '*')).toBe(true);
  });

  test('empty input returns empty array', () => {
    expect(parseSSHConfig('')).toEqual([]);
    expect(parseSSHConfig('# just a comment')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// profilesToSSHConfig — export
// ---------------------------------------------------------------------------

describe('profilesToSSHConfig — export', () => {
  const PROFILES = [
    {
      protocol: 'ssh',
      name: 'myserver',
      host: '10.0.0.1',
      port: 2222,
      username: 'deploy',
      pemFile: '/home/user/.ssh/id_rsa',
      compression: true,
      agentForwarding: false,
      x11Forwarding: false,
      strictHostOff: false,
      keepAlive: true,
    },
  ];

  let output;

  beforeEach(() => {
    output = profilesToSSHConfig(PROFILES);
  });

  test('output contains Host line', () => {
    expect(output).toContain('Host myserver');
  });

  test('output contains HostName', () => {
    expect(output).toContain('HostName 10.0.0.1');
  });

  test('output contains Port', () => {
    expect(output).toContain('Port 2222');
  });

  test('output contains User', () => {
    expect(output).toContain('User deploy');
  });

  test('output contains IdentityFile', () => {
    expect(output).toContain('IdentityFile /home/user/.ssh/id_rsa');
  });

  test('output contains Compression yes', () => {
    expect(output).toContain('Compression yes');
  });

  test('output contains ServerAliveInterval for keepAlive', () => {
    expect(output).toContain('ServerAliveInterval 60');
  });

  test('returns comment-only string for empty profile list', () => {
    const result = profilesToSSHConfig([]);
    expect(result).toMatch(/No SSH profiles/i);
  });

  test('filters out non-SSH profiles', () => {
    const mixed = [
      ...PROFILES,
      { protocol: 'telnet', name: 'switch', host: '192.168.1.2' },
    ];
    const result = profilesToSSHConfig(mixed);
    expect(result).toContain('Host myserver');
    expect(result).not.toContain('Host switch');
  });

  // Round-trip: parse what we exported and get back equivalent data
  test('round-trip: exported config can be re-imported', () => {
    const { parseSSHConfig: parse } = require('../../src/main/ssh-utils');
    const reimported = parse(output);
    expect(reimported).toHaveLength(1);
    expect(reimported[0].host).toBe('10.0.0.1');
    expect(reimported[0].username).toBe('deploy');
    expect(reimported[0].port).toBe(2222);
  });
});
