'use strict';
/**
 * tests/unit/jump-host.test.js
 *
 * Tests for SSH jump-host (ProxyJump) ProxyCommand generation.
 * Covers buildJumpHostProxyCommand() and its integration in buildSSHCommand().
 */

// ---------------------------------------------------------------------------
// Hermetic mocks so tests don't depend on local sshpass installation
// ---------------------------------------------------------------------------
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    accessSync: jest.fn((p) => {
      if (p === '/opt/homebrew/bin/sshpass') return; // simulate found
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
  };
});
jest.mock('child_process', () => ({
  execSync: jest.fn(() => { throw new Error('not found'); }),
}));

const { buildJumpHostProxyCommand, buildSSHCommand } = require('../../src/main/ssh-utils');

const BASE_JUMP = {
  proxyEnabled:  true,
  proxyHost:     '192.168.1.96',
  proxyPort:     22,
  proxyUsername: 'pi',
  proxyPemFile:  null,
  proxyPassword: null,
};

const BASE_TARGET = {
  host:     '192.168.2.120',
  username: 'admin',
  port:     22,
};

// ---------------------------------------------------------------------------
// Guard / disabled
// ---------------------------------------------------------------------------

describe('buildJumpHostProxyCommand — disabled / guard', () => {
  test('returns [] when proxyEnabled is false', () => {
    expect(buildJumpHostProxyCommand({ ...BASE_JUMP, proxyEnabled: false })).toEqual([]);
  });

  test('returns [] when proxyEnabled is absent', () => {
    expect(buildJumpHostProxyCommand({})).toEqual([]);
  });

  test('returns [] when proxyHost is empty even if proxyEnabled', () => {
    expect(buildJumpHostProxyCommand({ proxyEnabled: true, proxyHost: '' })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Agent / none auth
// ---------------------------------------------------------------------------

describe('buildJumpHostProxyCommand — agent/none auth', () => {
  let flags;
  beforeEach(() => { flags = buildJumpHostProxyCommand(BASE_JUMP); });

  test('returns exactly 2 elements: ["-o", "ProxyCommand=..."]', () => {
    expect(flags).toHaveLength(2);
    expect(flags[0]).toBe('-o');
    expect(flags[1]).toMatch(/^ProxyCommand=/);
  });

  test('ProxyCommand starts with "ssh " (no sshpass for agent auth)', () => {
    expect(flags[1]).toMatch(/^ProxyCommand=ssh /);
    expect(flags[1]).not.toContain('sshpass');
  });

  test('includes -W %h:%p for stdin/stdout forwarding', () => {
    expect(flags[1]).toContain('-W %h:%p');
  });

  test('includes StrictHostKeyChecking=no for jump host', () => {
    expect(flags[1]).toContain('StrictHostKeyChecking=no');
  });

  test('includes UserKnownHostsFile=/dev/null for jump host', () => {
    expect(flags[1]).toContain('UserKnownHostsFile=/dev/null');
  });

  test('destination is formatted as user@host', () => {
    expect(flags[1]).toContain('pi@192.168.1.96');
  });

  test('omits -p flag for default port 22', () => {
    expect(flags[1]).not.toMatch(/ -p 22\b/);
  });

  test('includes -p for non-default port', () => {
    const f = buildJumpHostProxyCommand({ ...BASE_JUMP, proxyPort: 2222 });
    expect(f[1]).toContain('-p 2222');
  });

  test('uses bare host when username is empty', () => {
    const f = buildJumpHostProxyCommand({ ...BASE_JUMP, proxyUsername: '' });
    expect(f[1]).toContain('192.168.1.96');
    expect(f[1]).not.toContain('@192.168.1.96');
  });
});

// ---------------------------------------------------------------------------
// Key file auth
// ---------------------------------------------------------------------------

describe('buildJumpHostProxyCommand — key file auth', () => {
  const KEY_JUMP = { ...BASE_JUMP, proxyPemFile: '/home/prateek/.ssh/rpi_key' };

  test('includes -i KEY path in ProxyCommand', () => {
    const [, cmd] = buildJumpHostProxyCommand(KEY_JUMP);
    expect(cmd).toContain('-i /home/prateek/.ssh/rpi_key');
  });

  test('includes IdentitiesOnly=yes to skip ssh-agent lookup', () => {
    const [, cmd] = buildJumpHostProxyCommand(KEY_JUMP);
    expect(cmd).toContain('IdentitiesOnly=yes');
  });

  test('expands leading ~ in proxyPemFile path', () => {
    const homeDir = process.env.HOME || '/Users/test';
    const [, cmd] = buildJumpHostProxyCommand({ ...KEY_JUMP, proxyPemFile: '~/.ssh/rpi_key' });
    expect(cmd).toContain(`-i ${homeDir}/.ssh/rpi_key`);
  });

  test('does NOT use sshpass for key auth', () => {
    const [, cmd] = buildJumpHostProxyCommand(KEY_JUMP);
    expect(cmd).not.toContain('sshpass');
  });
});

// ---------------------------------------------------------------------------
// Password auth
// ---------------------------------------------------------------------------

describe('buildJumpHostProxyCommand — password auth', () => {
  const PASS_JUMP = { ...BASE_JUMP, proxyPassword: 'raspberry' };

  test('ProxyCommand contains sshpass', () => {
    const [, cmd] = buildJumpHostProxyCommand(PASS_JUMP);
    expect(cmd).toContain('sshpass');
  });

  test('includes -p PASSWORD before ssh', () => {
    const [, cmd] = buildJumpHostProxyCommand(PASS_JUMP);
    expect(cmd).toMatch(/sshpass -p raspberry ssh /);
  });

  test('still includes -W %h:%p and jump host', () => {
    const [, cmd] = buildJumpHostProxyCommand(PASS_JUMP);
    expect(cmd).toContain('-W %h:%p');
    expect(cmd).toContain('pi@192.168.1.96');
  });
});

// ---------------------------------------------------------------------------
// buildSSHCommand integration
// ---------------------------------------------------------------------------

describe('buildSSHCommand — jump host integration', () => {
  const PROFILE = { ...BASE_TARGET, ...BASE_JUMP };

  test('ProxyCommand= entry appears in args', () => {
    const { args } = buildSSHCommand(PROFILE);
    const entry = args.find(a => typeof a === 'string' && a.startsWith('ProxyCommand='));
    expect(entry).toBeDefined();
    expect(entry).toContain('-W %h:%p');
  });

  test('top-level command is still "ssh" (not sshpass)', () => {
    expect(buildSSHCommand(PROFILE).command).toBe('ssh');
  });

  test('final arg is still the target host (not jump host)', () => {
    const { args } = buildSSHCommand(PROFILE);
    expect(args[args.length - 1]).toBe('admin@192.168.2.120');
  });

  test('no ProxyCommand when proxyEnabled is false', () => {
    const { args } = buildSSHCommand({ ...PROFILE, proxyEnabled: false });
    const entry = args.find(a => typeof a === 'string' && a.startsWith('ProxyCommand='));
    expect(entry).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mutual exclusion: Cloudflare Access wins over Jump Host
// ---------------------------------------------------------------------------

describe('buildSSHCommand — Cloudflare vs Jump Host mutual exclusion', () => {
  const BOTH = {
    ...BASE_TARGET,
    ...BASE_JUMP,
    cloudflareAccess: true,
    cloudflaredPath:  '/opt/homebrew/bin/cloudflared',
  };

  test('Cloudflare ProxyCommand is used when both are enabled', () => {
    const { args } = buildSSHCommand(BOTH);
    const entry = args.find(a => typeof a === 'string' && a.startsWith('ProxyCommand='));
    expect(entry).toBeDefined();
    expect(entry).toContain('cloudflared');
    expect(entry).not.toContain('-W %h:%p');
  });

  test('exactly one ProxyCommand= entry is emitted', () => {
    const { args } = buildSSHCommand(BOTH);
    const entries = args.filter(a => typeof a === 'string' && a.startsWith('ProxyCommand='));
    expect(entries).toHaveLength(1);
  });
});
