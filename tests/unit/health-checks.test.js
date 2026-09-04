'use strict';
/**
 * Environment health checks — the failures that a "is the binary installed?"
 * probe cannot see. Both cases here are ones that actually broke connections:
 * a wedged ssh-agent, and ~/.ssh/agent created without the execute bit.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { probeSshAgent, checkSshPermissions, agentIssue, runHealthChecks } =
  require('../../src/main/health-checks');

// Fake unix socket: `behaviour` decides what the "agent" does after connect.
function fakeConnect(behaviour) {
  return (_p, onConnect) => {
    const sock = new EventEmitter();
    sock.write = () => {
      if (behaviour === 'reply') setImmediate(() => sock.emit('data', Buffer.from([0, 0, 0, 5, 12])));
      if (behaviour === 'silent') { /* the wedged-agent case: accepts, never answers */ }
      if (behaviour === 'close')  setImmediate(() => sock.emit('close'));
    };
    sock.destroy = () => {};
    if (behaviour === 'error') setImmediate(() => sock.emit('error', new Error('ECONNREFUSED')));
    else setImmediate(onConnect);
    return sock;
  };
}

describe('probeSshAgent', () => {
  test('a live agent that replies → ok', async () => {
    expect((await probeSshAgent({ sock: '/tmp/a', connect: fakeConnect('reply') })).state).toBe('ok');
  });

  test('socket accepts but never answers → unresponsive (the hang we hit)', async () => {
    const r = await probeSshAgent({ sock: '/tmp/a', connect: fakeConnect('silent'), timeoutMs: 60 });
    expect(r.state).toBe('unresponsive');
  });

  test('connection error → unusable', async () => {
    expect((await probeSshAgent({ sock: '/tmp/a', connect: fakeConnect('error') })).state).toBe('unusable');
  });

  test('no SSH_AUTH_SOCK → absent (not a problem)', async () => {
    expect((await probeSshAgent({ sock: null })).state).toBe('absent');
  });

  test('resolves within the timeout — never blocks startup', async () => {
    const t0 = Date.now();
    await probeSshAgent({ sock: '/tmp/a', connect: fakeConnect('silent'), timeoutMs: 50 });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('agentIssue', () => {
  test('ok and absent produce no issue', () => {
    expect(agentIssue({ state: 'ok' })).toBeNull();
    expect(agentIssue({ state: 'absent' })).toBeNull();
  });
  test('unresponsive produces an actionable warning', () => {
    const i = agentIssue({ state: 'unresponsive', sock: '/tmp/x' });
    expect(i.severity).toBe('warn');
    expect(i.detail).toMatch(/hang|banner/i);
    expect(i.fix).toMatch(/chmod|ssh-agent/);
  });
});

// Mode-bit tests need a real POSIX filesystem: on Windows fs.statSync().mode is
// synthesised, so pinning platform:'darwin' would make the check run and flag
// every directory. Skip them there and cover win32 separately below.
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('checkSshPermissions (POSIX filesystem)', () => {
  let home;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-ssh-'));
    fs.mkdirSync(path.join(home, '.ssh'), { mode: 0o700 });
  });
  afterEach(() => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ } });

  test('a clean ~/.ssh reports nothing', () => {
    fs.writeFileSync(path.join(home, '.ssh', 'id_rsa'), 'k', { mode: 0o600 });
    expect(checkSshPermissions({ home })).toEqual([]);
  });

  test('flags a directory missing the execute bit (the real root cause)', () => {
    const agentDir = path.join(home, '.ssh', 'agent');
    fs.mkdirSync(agentDir);
    fs.chmodSync(agentDir, 0o600);            // drw------- : cannot be entered
    const issues = checkSshPermissions({ home });
    const hit = issues.find((i) => i.id.includes('agent'));
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('error');
    expect(hit.fix).toBe(`chmod 700 ${agentDir}`);
    fs.chmodSync(agentDir, 0o700);            // restore so cleanup can recurse
  });

  test('flags a world/group-readable private key', () => {
    const key = path.join(home, '.ssh', 'id_rsa');
    fs.writeFileSync(key, 'k', { mode: 0o644 });
    const hit = checkSshPermissions({ home }).find((i) => i.id.includes('id_rsa'));
    expect(hit).toBeTruthy();
    expect(hit.fix).toBe(`chmod 600 ${key}`);
  });

  test('ignores .pub files (they are meant to be readable)', () => {
    fs.writeFileSync(path.join(home, '.ssh', 'id_rsa.pub'), 'k', { mode: 0o644 });
    expect(checkSshPermissions({ home })).toEqual([]);
  });

  test('missing ~/.ssh is not an error', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-nossh-'));
    expect(checkSshPermissions({ home: empty })).toEqual([]);
    fs.rmSync(empty, { recursive: true, force: true });
  });
});

describe('checkSshPermissions on Windows', () => {
  test('skipped entirely — Windows uses ACLs, not Unix mode bits', () => {
    // Runs on every OS: the early return makes the result independent of the
    // filesystem underneath. Without the guard, Windows would synthesise
    // st.mode and report every ~/.ssh directory as unusable.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-win-'));
    fs.mkdirSync(path.join(home, '.ssh'));
    expect(checkSshPermissions({ home, platform: 'win32' })).toEqual([]);
    fs.rmSync(home, { recursive: true, force: true });
  });
});

describe('runHealthChecks', () => {
  test('returns a combined list and never throws', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-h-'));
    fs.mkdirSync(path.join(home, '.ssh'), { mode: 0o700 });
    const issues = await runHealthChecks({
      home, sock: '/tmp/x', connect: fakeConnect('silent'), timeoutMs: 40,
      platform: 'win32',   // isolate this to the agent probe on every OS
    });
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.some((i) => i.id === 'ssh-agent')).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  });
});
