'use strict';
/**
 * The debug log must not contain passwords.
 *
 * Debug logging exists so users can send us a log for a bug report — the
 * Settings panel offers Copy and reveal-in-file-manager for exactly that. But
 * a password jump host is driven by an embedded `sshpass -p <password>` inside
 * the ProxyCommand, and four separate dbgLog() call sites print the full argv:
 * pty create, scp cmd, the MCP bridge SSH command, and spawnPtyForBridge.
 *
 * A real log on this machine had 309 such lines. Redaction belongs in dbgLog
 * itself rather than at each call site, so a future log line cannot reintroduce
 * the leak.
 */

const { redactSecrets } = require('../../src/main/redact');

describe('passwords are stripped', () => {
  test('sshpass -p inside a ProxyCommand argument', () => {
    const line = 'args=[-o,ProxyCommand=/opt/homebrew/bin/sshpass -p s3cr3t-placeholder ssh -W %h:%p pi@192.168.1.68]';
    const out  = redactSecrets(line);
    expect(out).not.toContain('s3cr3t-placeholder');
    expect(out).toContain('sshpass -p ');
    expect(out).toContain('pi@192.168.1.68');   // non-secret context is kept
  });

  test('a bare sshpass invocation', () => {
    expect(redactSecrets('shell=/opt/homebrew/bin/sshpass args=[-p, hunter2, ssh]'))
      .not.toContain('hunter2');
  });

  test('the SSHPASS environment variable', () => {
    expect(redactSecrets('env: SSHPASS=hunter2 TERM=xterm')).not.toContain('hunter2');
  });

  test('every occurrence on a line, not just the first', () => {
    const out = redactSecrets('a sshpass -p one b sshpass -p two c');
    expect(out).not.toContain('one');
    expect(out).not.toContain('two');
  });
});

describe('non-secrets survive — redaction must not destroy the log', () => {
  test('an ssh port is not a password', () => {
    // `ssh -p 65222` looks identical to `sshpass -p <pw>` if the pattern is
    // anchored on "-p" alone. It must stay readable.
    const line = 'args=[-o,ConnectTimeout=15,-p,65222,root@127.0.0.1]';
    expect(redactSecrets(line)).toBe(line);
    expect(redactSecrets('ssh -p 65222 root@127.0.0.1')).toContain('65222');
  });

  test("scp's -P port flag is not a password", () => {
    const line = 'shell=/opt/homebrew/bin/sshpass args=[-f, /tmp/pw, scp, -P, 2222, a, b]';
    expect(redactSecrets(line)).toContain('2222');
  });

  test('sshpass -f names a temp file, not a secret', () => {
    const line = 'shell=/opt/homebrew/bin/sshpass args=[-f, /var/folders/qv/T/prateek-term-pw-46a6d311, scp]';
    expect(redactSecrets(line)).toBe(line);
  });

  test('ordinary lines are untouched', () => {
    for (const s of [
      '[MCP] listening on 127.0.0.1:29419',
      '[profiles] loaded 33 profiles from "/Users/x/connection-profiles.json"',
      '',
    ]) expect(redactSecrets(s)).toBe(s);
  });

  test('junk input cannot throw', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      expect(() => redactSecrets(v)).not.toThrow();
    }
  });
});

describe('dbgLog applies it', () => {
  const fs = require('fs'); const path = require('path');
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

  test('redaction happens inside dbgLog, not at individual call sites', () => {
    const fn = main.match(/function dbgLog\(msg\)[\s\S]{0,800}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('redactSecrets');
  });

  test('main requires the helper', () => {
    expect(main).toMatch(/require\('\.\/redact'\)/);
  });
});
