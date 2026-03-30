'use strict';
/**
 * tests/unit/sshpass-wrap.test.js
 *
 * Tests for wrapWithSshpass — specifically the BUG-005 fix:
 *
 * BUG-005: sshpass -e (env var) approach fails silently on macOS because
 * the SSHPASS env var is not reliably propagated through the Electron IPC →
 * contextBridge → node-pty chain. The PTY spawns sshpass with -e but
 * SSHPASS is empty/unset, so SSH auth fails with exit code 1.
 *
 * Fix: switch to sshpass -p PASSWORD (direct argument) using the full path
 * to the sshpass binary to avoid PATH lookup failures when launched from
 * the macOS Dock.
 */

const path = require('path');
const fs   = require('fs');

// ---------------------------------------------------------------------------
// Mock fs.accessSync so tests work on any machine regardless of whether
// sshpass is physically installed at /opt/homebrew/bin/sshpass.
// ---------------------------------------------------------------------------
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    accessSync: jest.fn((p, mode) => {
      // Simulate sshpass installed at Apple Silicon Homebrew path only
      if (p === '/opt/homebrew/bin/sshpass') return; // found
      throw new Error('ENOENT');
    }),
  };
});

// Also mock child_process.execSync so `which sshpass` fallback doesn't run
jest.mock('child_process', () => ({
  execSync: jest.fn(() => { throw new Error('not found'); }),
}));

const { wrapWithSshpass, findSshpass, isSshpassAvailable } = require('../../src/main/ssh-utils');

const SSHPASS_PATH = '/opt/homebrew/bin/sshpass';

// ---------------------------------------------------------------------------
// findSshpass / isSshpassAvailable
// ---------------------------------------------------------------------------

describe('findSshpass', () => {
  test('returns full path to sshpass binary', () => {
    expect(findSshpass()).toBe(SSHPASS_PATH);
  });

  test('isSshpassAvailable returns true when sshpass found', () => {
    expect(isSshpassAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// wrapWithSshpass — password path
// ---------------------------------------------------------------------------

describe('wrapWithSshpass — password auth (BUG-005)', () => {
  const profile = { password: 'Vf@!2345' };
  let result;

  beforeEach(() => {
    result = wrapWithSshpass('ssh', ['-o', 'ConnectTimeout=15', 'root@192.168.1.1'], profile);
  });

  test('uses full path to sshpass binary (avoids PATH lookup failure from Dock)', () => {
    expect(result.command).toBe(SSHPASS_PATH);
  });

  test('uses -p flag (direct arg) instead of -e (env var) to avoid IPC env propagation bug', () => {
    expect(result.args[0]).toBe('-p');
  });

  test('passes the password as the second argument immediately after -p', () => {
    expect(result.args[1]).toBe('Vf@!2345');
  });

  test('does NOT use -e flag', () => {
    expect(result.args).not.toContain('-e');
  });

  test('password with special chars (@, !) is passed verbatim', () => {
    const r = wrapWithSshpass('ssh', [], { password: 'V@!#$%^&*()f' });
    expect(r.args[1]).toBe('V@!#$%^&*()f');
  });

  test('env is empty — SSHPASS not needed with -p flag', () => {
    expect(result.env).toEqual({});
  });

  test('ssh command is the third argument', () => {
    expect(result.args[2]).toBe('ssh');
  });

  test('original ssh args follow after ssh command', () => {
    expect(result.args).toContain('-o');
    expect(result.args).toContain('ConnectTimeout=15');
    expect(result.args).toContain('root@192.168.1.1');
  });
});

// ---------------------------------------------------------------------------
// wrapWithSshpass — no password / key auth
// ---------------------------------------------------------------------------

describe('wrapWithSshpass — key/no-password auth', () => {
  test('returns plain ssh command when no password', () => {
    const r = wrapWithSshpass('ssh', ['-i', '/home/user/.ssh/id_rsa', 'host'], { password: null });
    expect(r.command).toBe('ssh');
    expect(r.args).toContain('-i');
    expect(r.env).toEqual({});
  });

  test('returns plain ssh command when password is empty string', () => {
    const r = wrapWithSshpass('ssh', ['host'], { password: '' });
    expect(r.command).toBe('ssh');
  });

  test('returns plain ssh command when password is undefined', () => {
    const r = wrapWithSshpass('ssh', ['host'], {});
    expect(r.command).toBe('ssh');
  });
});
