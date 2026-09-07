'use strict';
/**
 * Password auto-type across a jump host.
 *
 * A jump-host connection produces TWO password prompts:
 *   pi@192.168.1.68's password:      <- jump host
 *   root@192.168.2.140's password:   <- target
 *
 * The old implementation held ONE password and fired on the first text matching
 * /password/i, so it typed the TARGET password into the JUMP prompt — the wrong
 * secret sent to the wrong host — and then had nothing left for the target.
 * Reproduced on Windows, where there is no sshpass so the jump prompt is
 * actually shown rather than answered behind the scenes.
 *
 * Mirrors the renderer's logic (renderer code cannot be required directly), and
 * the source-contract tests below keep the two in step.
 */

const fs   = require('fs');
const path = require('path');

const who = (u, h) => (u ? `${u}@${h}` : String(h || ''));

function buildPasswordQueue(cp) {
  if (!cp || cp.protocol !== 'ssh') return [];
  const q = [];
  if (cp.proxyEnabled && cp.proxyPassword && cp.proxyHost) {
    q.push({ who: who(cp.proxyUsername, cp.proxyHost), password: cp.proxyPassword });
  }
  if (cp.authType === 'password' && cp.password && cp.host) {
    q.push({ who: who(cp.username, cp.host), password: cp.password });
  }
  return q;
}

/** Feed a prompt at the queue; returns the password sent, or null. */
function answer(queue, prompt) {
  if (!/password/i.test(prompt)) return null;
  let i = queue.findIndex((e) => e.who && prompt.includes(e.who));
  if (i === -1 && queue.length === 1) i = 0;
  return i === -1 ? null : queue.splice(i, 1)[0].password;
}

const G526 = {
  protocol: 'ssh', host: '192.168.2.140', username: 'root',
  authType: 'password', password: 'TARGETPW',
  proxyEnabled: true, proxyHost: '192.168.1.68',
  proxyUsername: 'pi', proxyPassword: 'JUMPPW',
};

describe('buildPasswordQueue', () => {
  test('a jump-host profile queues jump then target, in ssh prompt order', () => {
    expect(buildPasswordQueue(G526).map((e) => e.who))
      .toEqual(['pi@192.168.1.68', 'root@192.168.2.140']);
  });

  test('no jump host → just the target', () => {
    const q = buildPasswordQueue({ ...G526, proxyEnabled: false });
    expect(q.map((e) => e.who)).toEqual(['root@192.168.2.140']);
  });

  test('key auth on the target still queues the jump password', () => {
    const q = buildPasswordQueue({ ...G526, authType: 'key', password: '' });
    expect(q.map((e) => e.who)).toEqual(['pi@192.168.1.68']);
  });

  test('a key-based jump host queues nothing for it', () => {
    const q = buildPasswordQueue({ ...G526, proxyPassword: '', proxyPemFile: '/k' });
    expect(q.map((e) => e.who)).toEqual(['root@192.168.2.140']);
  });

  test('non-ssh protocols and junk input yield an empty queue', () => {
    expect(buildPasswordQueue({ ...G526, protocol: 'telnet' })).toEqual([]);
    expect(buildPasswordQueue(null)).toEqual([]);
  });

  test('a host with no username matches on host alone', () => {
    const q = buildPasswordQueue({ ...G526, username: '', proxyEnabled: false });
    expect(q[0].who).toBe('192.168.2.140');
  });
});

describe('answering the prompts', () => {
  test('each host gets ITS OWN password — the reported bug', () => {
    const q = buildPasswordQueue(G526);
    expect(answer(q, "pi@192.168.1.68's password: ")).toBe('JUMPPW');
    expect(answer(q, "root@192.168.2.140's password: ")).toBe('TARGETPW');
    expect(q).toHaveLength(0);
  });

  test('order does not matter — matching is by host, not position', () => {
    const q = buildPasswordQueue(G526);
    expect(answer(q, "root@192.168.2.140's password: ")).toBe('TARGETPW');
    expect(answer(q, "pi@192.168.1.68's password: ")).toBe('JUMPPW');
  });

  test('the target password is never sent to the jump host', () => {
    const q = buildPasswordQueue(G526);
    expect(answer(q, "pi@192.168.1.68's password: ")).not.toBe('TARGETPW');
  });

  test('single-hop still answers a differently-worded prompt', () => {
    // Some servers say "Password:" with no user@host at all.
    const q = buildPasswordQueue({ ...G526, proxyEnabled: false });
    expect(answer(q, 'Password: ')).toBe('TARGETPW');
  });

  test('an unrecognised prompt on a MULTI-hop connection sends nothing', () => {
    // Guessing here is what caused the wrong secret to go to the wrong host.
    const q = buildPasswordQueue(G526);
    expect(answer(q, 'Enter passphrase for key: ')).toBeNull();
    expect(q).toHaveLength(2);
  });

  test('non-password output is ignored', () => {
    const q = buildPasswordQueue(G526);
    expect(answer(q, 'Warning: Permanently added ...')).toBeNull();
    expect(q).toHaveLength(2);
  });
});

describe('renderer source contract', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../src/renderer/js/app.js'), 'utf8');

  test('the renderer builds a queue, not a single password', () => {
    expect(app).toContain('function buildPasswordQueue(cp)');
    expect(app).not.toContain('_pendingPassword');
  });

  test('it matches the prompt against the host it belongs to', () => {
    const m = app.match(/tab\._pwdBuf = \(\(tab\._pwdBuf[\s\S]{0,800}/);
    expect(m).not.toBeNull();
    expect(m[0]).toContain('tab._pwdBuf.includes(e.who)');
    expect(m[0]).toContain('tab._pwdQueue.length === 1');   // single-hop fallback
  });

  test('OSC injection waits until every password is answered', () => {
    expect(app).toContain('if (tab._pwdQueue && tab._pwdQueue.length) return;');
  });
});
