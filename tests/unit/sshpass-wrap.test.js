'use strict';
/**
 * tests/unit/sshpass-wrap.test.js
 *
 * Tests for wrapWithAskpass — BUG-005 fix:
 *
 * BUG-005: sshpass (both -e and -p) fails inside node-pty because sshpass
 * creates its own inner PTY to intercept SSH's password prompt. When nested
 * inside node-pty's outer PTY the two PTY layers conflict and the password
 * injection fails (exit code 1 or exit code 5 "wrong password").
 *
 * Fix: drop sshpass entirely and use SSH's built-in SSH_ASKPASS mechanism.
 *   - Write a temp shell script that echoes the password
 *   - Set SSH_ASKPASS to that script and SSH_ASKPASS_REQUIRE=force
 *   - SSH calls the script directly — no PTY nesting, no env-var chain
 *   - The temp script is deleted after the PTY exits (_cleanupFiles)
 */

const fs   = require('fs');
const os   = require('os');

// ---------------------------------------------------------------------------
// Mock fs so tests work without touching the real filesystem
// ---------------------------------------------------------------------------
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    accessSync:   jest.fn((p) => { throw new Error('ENOENT'); }),
    writeFileSync: jest.fn(),
  };
});
jest.mock('child_process', () => ({
  execSync: jest.fn(() => { throw new Error('not found'); }),
}));
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('deadbeef01020304', 'hex')),
}));

const { wrapWithAskpass, writeAskpassScript } = require('../../src/main/ssh-utils');

// ---------------------------------------------------------------------------
// writeAskpassScript
// ---------------------------------------------------------------------------

describe('writeAskpassScript', () => {
  beforeEach(() => fs.writeFileSync.mockClear());

  test('writes an executable shell script to tmp dir', () => {
    writeAskpassScript('mypassword');
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content, opts] = fs.writeFileSync.mock.calls[0];
    expect(filePath).toContain('ptterm_ap_');
    expect(content).toContain('#!/bin/sh');
    expect(content).toContain("printf '%s'");
    expect(opts.mode).toBe(0o700);
  });

  test('embeds the password in the script body', () => {
    writeAskpassScript('Vf@!2345');
    const content = fs.writeFileSync.mock.calls[0][1];
    expect(content).toContain('Vf@!2345');
  });

  test('escapes single quotes in password safely', () => {
    writeAskpassScript("it's");
    const content = fs.writeFileSync.mock.calls[0][1];
    // Single quote must be escaped as '\''
    expect(content).toContain("'\\''");
  });

  test('password with special chars (@, !, #) is embedded verbatim inside quotes', () => {
    writeAskpassScript('V@!#$%^&*()');
    const content = fs.writeFileSync.mock.calls[0][1];
    expect(content).toContain('V@!#$%^&*()');
  });
});

// ---------------------------------------------------------------------------
// wrapWithAskpass — password path (BUG-005)
// ---------------------------------------------------------------------------

describe('wrapWithAskpass — password auth (BUG-005)', () => {
  beforeEach(() => fs.writeFileSync.mockClear());

  test('returns the original ssh command (no sshpass wrapping)', () => {
    const r = wrapWithAskpass('ssh', ['-o', 'ConnectTimeout=15', 'root@192.168.1.1'], { password: 'secret' });
    expect(r.command).toBe('ssh');
  });

  test('sets SSH_ASKPASS env to the temp script path', () => {
    const r = wrapWithAskpass('ssh', [], { password: 'secret' });
    expect(r.env.SSH_ASKPASS).toContain('ptterm_ap_');
  });

  test('sets SSH_ASKPASS_REQUIRE=force to bypass controlling-terminal check', () => {
    const r = wrapWithAskpass('ssh', [], { password: 'secret' });
    expect(r.env.SSH_ASKPASS_REQUIRE).toBe('force');
  });

  test('does NOT include sshpass anywhere in command or args', () => {
    const r = wrapWithAskpass('ssh', ['root@host'], { password: 'secret' });
    expect(r.command).not.toContain('sshpass');
    expect(r.args.join(' ')).not.toContain('sshpass');
  });

  test('original ssh args are preserved unchanged', () => {
    const r = wrapWithAskpass('ssh', ['-o', 'ConnectTimeout=15', 'root@192.168.1.1'], { password: 'secret' });
    expect(r.args).toEqual(['-o', 'ConnectTimeout=15', 'root@192.168.1.1']);
  });

  test('returns _cleanupFiles with the temp script path for post-exit cleanup', () => {
    const r = wrapWithAskpass('ssh', [], { password: 'secret' });
    expect(Array.isArray(r._cleanupFiles)).toBe(true);
    expect(r._cleanupFiles).toHaveLength(1);
    expect(r._cleanupFiles[0]).toBe(r.env.SSH_ASKPASS);
  });
});

// ---------------------------------------------------------------------------
// wrapWithAskpass — key / no-password auth
// ---------------------------------------------------------------------------

describe('wrapWithAskpass — key/no-password auth', () => {
  test('returns plain ssh command when no password set', () => {
    const r = wrapWithAskpass('ssh', ['host'], { password: null });
    expect(r.command).toBe('ssh');
    expect(r.env).toEqual({});
    expect(r._cleanupFiles).toHaveLength(0);
  });

  test('returns plain ssh command when password is empty string', () => {
    const r = wrapWithAskpass('ssh', ['host'], { password: '' });
    expect(r.env).toEqual({});
  });

  test('returns plain ssh command when pemFile is set (key-based auth)', () => {
    const r = wrapWithAskpass('ssh', ['host'], { password: 'secret', pemFile: '/home/user/.ssh/id_rsa' });
    expect(r.command).toBe('ssh');
    expect(r.env.SSH_ASKPASS).toBeUndefined();
  });
});
