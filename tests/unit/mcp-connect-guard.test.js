'use strict';
/**
 * MCP `connect` must never silently become a local shell.
 *
 * Reported after ~14.5h of intermittent failures: connect with a saved SSH
 * profile "opened" a session that was actually a local macOS login shell. The
 * debug log showed, every time:
 *
 *   [MCP] non-SSH protocol "local" — falling back to local shell
 *   [MCP bridge] spawnPtyForBridge: shell=/opt/homebrew/bin/bash args=[-l]
 *
 * "local" has exactly one source: the inline branch of POST /sessions, which
 * defaults `body.protocol || 'local'`. It is reachable ONLY when profileName is
 * absent — a present-but-unknown name 404s, and a present-but-not-aiEnabled one
 * 403s. So the client had omitted profileName, and the bridge quietly handed
 * back a local shell with no host, no protocol and no warning.
 *
 * The fix is not "require profileName" — connect({protocol:'local'}) is a
 * documented way to open a local shell. It is: refuse when NEITHER was given,
 * so an omitted profile name can never be mistaken for a deliberate local shell.
 */

const http = require('http');

function freshBridge() {
  const key = require.resolve('../../src/main/http-bridge');
  delete require.cache[key];
  return require('../../src/main/http-bridge');
}

function post(port, urlPath, token, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload || {});
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        Authorization: `Bearer ${token}`,
      },
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
                            catch { resolve({ status: res.statusCode, body: b }); } });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

function get(port, urlPath, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
                            catch { resolve({ status: res.statusCode, body: b }); } });
    });
    req.on('error', reject); req.end();
  });
}

/** start() binds asynchronously — getPort() stays 0 until it does. */
function startBound(bridge, o) {
  bridge.start(o);
  return new Promise((resolve, reject) => {
    let tries = 0;
    const t = setInterval(() => {
      const p = bridge.getPort();
      if (p > 0) { clearInterval(t); resolve(p); }
      else if (++tries > 100) { clearInterval(t); reject(new Error('bridge never bound')); }
    }, 10);
  });
}

const SSH_PROFILE = {
  name: 'VF-ML-Select-USB', protocol: 'ssh', host: '127.0.0.1', port: 65222,
  username: 'root', authType: 'password', password: 'x', aiEnabled: true,
};

function opts(overrides = {}) {
  return {
    terminals: new Map(), serialConns: new Map(),
    loadProfiles: () => [SSH_PROFILE],
    saveProfiles: () => {}, broadcastProfilesChanged: () => {},
    connectProfile: () => Promise.resolve({ command: 'ssh', args: [], env: {}, _cleanupFiles: [] }),
    spawnPty: () => Promise.resolve({ id: '1' }),
    writeInput: () => {}, killSession: () => {},
    listSerialPorts: () => Promise.resolve([]), serialConnect: () => Promise.resolve({ id: 's1' }),
    serialWrite: () => {}, serialClose: () => {},
    getVersion: () => '1.0.0-test', port: 0,
    ...overrides,
  };
}

describe('connect refuses to guess', () => {
  let bridge, port, token, connectCalls;

  // A fake PTY that behaves like a real one: it draws a prompt, and answers the
  // hostname probe POST /sessions runs to verify it actually landed remotely.
  function wiring(hostnameReply = 'testbox') {
    connectCalls = [];
    return opts({
      connectProfile: (p) => {
        connectCalls.push(p);
        return Promise.resolve({ command: 'ssh', args: [], env: {}, _cleanupFiles: [] });
      },
      spawnPty: () => {
        setImmediate(() => bridge.appendOutput('1', 'testbox:~$ '));
        return Promise.resolve({ id: '1' });
      },
      writeInput: (_id, data) => {
        const m = /(MTERM_DONE_[0-9a-f]+:)/.exec(String(data));
        if (m) setImmediate(() => bridge.appendOutput('1', `\n${hostnameReply}\n${m[1]}0_MTERM_END`));
      },
    });
  }

  async function boot(hostnameReply) {
    bridge = freshBridge();
    port = await startBound(bridge, wiring(hostnameReply));
    token = bridge.getToken();
  }

  beforeEach(() => boot());
  afterEach(() => { try { bridge.stop(); } catch { /* already down */ } });

  test('an empty body is refused, not turned into a local shell', async () => {
    const r = await post(port, '/sessions', token, {});
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/profileName|protocol/i);
    expect(connectCalls).toHaveLength(0);   // nothing was ever spawned
  });

  test('a body with only unrelated fields is refused too', async () => {
    const r = await post(port, '/sessions', token, { host: '127.0.0.1', port: 65222 });
    expect(r.status).toBe(400);
    expect(connectCalls).toHaveLength(0);
  });

  test('a deliberate local shell still works', async () => {
    const r = await post(port, '/sessions', token, { protocol: 'local' });
    expect(r.status).toBe(201);
    expect(connectCalls[0].protocol).toBe('local');
  });

  test('a saved SSH profile still connects as SSH', async () => {
    const r = await post(port, '/sessions', token, { profileName: 'VF-ML-Select-USB' });
    expect(r.status).toBe(201);
    expect(connectCalls[0].protocol).toBe('ssh');
    expect(r.body.remoteHostname).toBe('testbox');
  });

  test('a mistyped profile name 404s — it never degrades to a local shell', async () => {
    const r = await post(port, '/sessions', token, { profileName: 'VF-ML-Select-USBB' });
    expect(r.status).toBe(404);
    expect(connectCalls).toHaveLength(0);
  });

  test('a password prompt is never reported as the remote hostname', async () => {
    // Produced: Connected to: prateek@127.0.0.1's password: (127.0.0.1)
    bridge.stop();
    await boot("root@127.0.0.1's password: ");
    const r = await post(port, '/sessions', token, { profileName: 'VF-ML-Select-USB' });
    expect(r.body.remoteHostname).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/password/i);
    expect(r.body.warning).toBeTruthy();
  });
});

describe('list_sessions reports the real session type', () => {
  let bridge, port, token, terminals, serialConns;

  beforeEach(async () => {
    terminals   = new Map([[7, { fake: 'pty' }]]);
    serialConns = new Map([['s1', { isOpen: true }]]);
    bridge = freshBridge();
    port = await startBound(bridge, opts({ terminals, serialConns }));
    token = bridge.getToken();
    // Three buffers: a live pty, a live serial port, and one whose process is gone.
    bridge.ensureBuf('7'); bridge.ensureBuf('s1'); bridge.ensureBuf('99');
  });
  afterEach(async () => { try { await bridge.stop(); } catch { /* already down */ } });

  test('a pty is "pty" and a serial port is "serial"', async () => {
    const r = await get(port, '/sessions', token);
    const byId = Object.fromEntries(r.body.map((s) => [String(s.id), s.type]));
    expect(byId['7']).toBe('pty');
    expect(byId.s1).toBe('serial');
  });

  test('a dead session is not mislabelled "serial"', async () => {
    // The old test was `_terminals.has(id) ? 'pty' : 'serial'`, so ANYTHING not
    // currently a pty — including a closed SSH session — was reported as serial.
    const r = await get(port, '/sessions', token);
    const byId = Object.fromEntries(r.body.map((s) => [String(s.id), s.type]));
    expect(byId['99']).not.toBe('serial');
    expect(byId['99']).toBe('closed');
  });
});

describe('the remote-hostname probe only reports a real hostname', () => {
  const { looksLikeHostname } = require('../../src/main/http-bridge');

  test('accepts hostnames devices actually report', () => {
    for (const h of ['stm32mp13-mx', 'ntc-552', 'rpi-100', 'host.example.com', 'Prateeks-MacBook-Pro.local']) {
      expect(looksLikeHostname(h)).toBe(true);
    }
  });

  test('rejects a captured password prompt — the reported bug', () => {
    // Produced: Connected to: prateek@127.0.0.1's password: (127.0.0.1)
    expect(looksLikeHostname("prateek@127.0.0.1's password:")).toBe(false);
    expect(looksLikeHostname('root@192.168.2.150\'s password: ')).toBe(false);
    expect(looksLikeHostname('Password:')).toBe(false);
  });

  test('rejects other non-hostname noise', () => {
    for (const s of ['', '   ', 'bash: hostname: command not found', 'a b', '-bad', 'x'.repeat(300)]) {
      expect(looksLikeHostname(s)).toBe(false);
    }
  });
});

describe('source contracts', () => {
  const fs = require('fs'); const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');

  test('nothing in the MCP surface still claims the "ai" tag grants access', () => {
    // Access follows aiEnabled; the tag convention went away in 1.4.0. An
    // earlier version of this test matched only /tagged\s+"ai"/, which passed
    // while two other claims survived — including the empty-list message shown
    // at exactly the moment a user needs the right remedy. Assert the absolute
    // contract instead: the literal does not appear anywhere in the file.
    expect(read('src/mcp/server.js')).not.toMatch(/"ai"/);
  });

  test('the connect schema does not promise a protocol default the bridge rejects', () => {
    expect(read('src/mcp/server.js')).not.toMatch(/default:\s*local/i);
  });

  test('every bridge spawn logs the profile it was actually given', () => {
    // Must reference options.profileName — a hardcoded "profile=" literal would
    // satisfy a looser grep while logging nothing useful, which is exactly the
    // gap that cost the reporter 14h.
    expect(read('src/main/main.js'))
      .toMatch(/spawnPtyForBridge:[^\n]*profile=\$\{options\.profileName/);
  });
});

// ---------------------------------------------------------------------------
// The same bug through the path the first guard did not cover
// ---------------------------------------------------------------------------
/**
 * The 400 guard only covers a MISSING profileName. A saved profile whose
 * protocol is not ssh/telnet/ftp still reached buildSSHCommandForProfile's
 * `default:` branch and became `bash -l` — so connect({profileName}) on an
 * aiEnabled SERIAL profile reproduced the original report exactly: a local
 * shell returned as a bare {id}, with no host, no protocol and no warning.
 */
describe('a saved profile never silently degrades to a local shell', () => {
  const SERIAL_PROFILE = {
    name: 'Fox4', protocol: 'serial', serialPort: '/dev/tty.usbserial-0001',
    baudRate: 115200, aiEnabled: true,
  };
  const ODD_PROFILE = { name: 'Odd', protocol: 'gopher', host: 'x', aiEnabled: true };

  let bridge, port, token, connectCalls, serialCalls;

  beforeEach(async () => {
    connectCalls = []; serialCalls = [];
    bridge = freshBridge();
    port = await startBound(bridge, opts({
      loadProfiles: () => [SSH_PROFILE, SERIAL_PROFILE, ODD_PROFILE],
      connectProfile: (p) => { connectCalls.push(p); return Promise.resolve({ command: 'ssh', args: [], env: {}, _cleanupFiles: [] }); },
      serialConnect: (o) => { serialCalls.push(o); return Promise.resolve({ id: 'serial-9' }); },
      spawnPty: () => { setImmediate(() => bridge.appendOutput('1', 'x:~$ ')); return Promise.resolve({ id: '1' }); },
    }));
    token = bridge.getToken();
  });
  afterEach(() => { try { bridge.stop(); } catch { /* already down */ } });

  test('a serial profile opens the serial port, not bash', async () => {
    const r = await post(port, '/sessions', token, { profileName: 'Fox4' });
    expect(r.status).toBe(201);
    expect(r.body.protocol).toBe('serial');
    expect(serialCalls[0].port).toBe('/dev/tty.usbserial-0001');
    expect(serialCalls[0].baudRate).toBe(115200);
    // The decisive one: no PTY/bash was ever spawned for it.
    expect(connectCalls).toHaveLength(0);
  });

  test('a protocol the bridge cannot open is refused, not silently localised', async () => {
    const r = await post(port, '/sessions', token, { profileName: 'Odd' });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/gopher|protocol/i);
    expect(connectCalls).toHaveLength(0);
  });

  test('a saved local profile is still allowed to be a local shell', async () => {
    // Deliberate local profiles exist; only the accidental ones are the bug.
    bridge.stop();
    port = await startBound(bridge = freshBridge(), opts({
      loadProfiles: () => [{ name: 'Local', protocol: 'local', aiEnabled: true }],
      connectProfile: (p) => { connectCalls.push(p); return Promise.resolve({ command: 'bash', args: ['-l'], env: {}, _cleanupFiles: [] }); },
      spawnPty: () => { setImmediate(() => bridge.appendOutput('1', 'x:~$ ')); return Promise.resolve({ id: '1' }); },
    }));
    token = bridge.getToken();
    const r = await post(port, '/sessions', token, { profileName: 'Local' });
    expect(r.status).toBe(201);
    expect(connectCalls[0].protocol).toBe('local');
  });
});
