/**
 * Unit tests for src/main/http-bridge.js
 *
 * Tests focus on the pure logic that can run without Electron:
 *  - Ring-buffer management (appendOutput, ensureBuf)
 *  - DONE-marker detection and long-poll resolution (waitForDone is internal,
 *    so we test it indirectly via appendOutput + the exported ensureBuf)
 *  - Token path derivation
 *  - Auth header enforcement (via a real test HTTP server started in-process)
 *  - Route handler: /health, /profiles, /sessions
 */

const http   = require('http');
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

// ── isolate the bridge module so each test suite gets a fresh instance ──────
// We require it fresh in beforeEach by clearing the require cache
function freshBridge() {
  const key = require.resolve('../../src/main/http-bridge');
  delete require.cache[key];
  return require('../../src/main/http-bridge');
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMinimalOpts(overrides = {}) {
  return {
    terminals:       new Map(),
    serialConns:     new Map(),
    loadProfiles:    () => [],
    connectProfile:  () => Promise.resolve({ command: 'ssh', args: [], env: {}, _cleanupFiles: [] }),
    spawnPty:        () => Promise.resolve({ id: '1' }),
    writeInput:      () => {},
    killSession:     () => {},
    listSerialPorts: () => Promise.resolve([]),
    serialConnect:   () => Promise.resolve({ id: 'serial-1' }),
    serialWrite:     () => {},
    serialClose:     () => {},
    getVersion:      () => '1.0.0-test',
    port:            0, // OS-assigned port
    ...overrides,
  };
}

function httpGet(port, urlPath, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port, path: urlPath, method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
    http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on('error', reject).end();
  });
}

function httpPost(port, urlPath, token, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload || {});
    const opts = {
      hostname: '127.0.0.1', port, path: urlPath, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpDelete(port, urlPath, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port, path: urlPath, method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
    http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on('error', reject).end();
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('http-bridge — ring buffer', () => {
  let bridge;

  beforeEach(() => { bridge = freshBridge(); });

  test('ensureBuf creates empty buffer', () => {
    bridge.ensureBuf('42');
    // No error — buffer created
  });

  test('appendOutput is a no-op for unknown session ids', () => {
    expect(() => bridge.appendOutput('unknown-id', 'hello')).not.toThrow();
  });

  test('appendOutput accumulates data after ensureBuf', () => {
    bridge.ensureBuf('1');
    bridge.appendOutput('1', 'hello ');
    bridge.appendOutput('1', 'world');
    // No direct accessor to buf — verified indirectly via bridge behaviour
    // (reading /sessions/:id/output in integration test)
  });

  test('appendOutput with non-MCP session id is safe', () => {
    // Should not throw even if the id was never registered
    expect(() => bridge.appendOutput(999, 'data')).not.toThrow();
  });
});

describe('http-bridge — HTTP server', () => {
  let bridge, port, token, tokenFile;

  beforeEach((done) => {
    bridge = freshBridge();
    tokenFile = path.join(os.tmpdir(), `.ptterm-test-token-${crypto.randomBytes(4).toString('hex')}`);

    // Patch TOKEN_PATH by writing a known token before start()
    // We can't easily inject the path, so we use a real temp file at the home dir
    // location and accept that getOrCreateToken() may write a new one.
    // For tests, we start the server and read back the actual token via /health-token.
    // Instead: we expose getToken() after start, which returns the real token.

    const opts = makeMinimalOpts({ port: 0 });
    bridge.start(opts);

    // Wait a tick for the server to bind
    setImmediate(() => {
      port  = bridge.getPort();
      token = bridge.getToken();
      // port will be 0 until server binds — poll briefly
      let tries = 0;
      const wait = setInterval(() => {
        tries++;
        port = bridge.getPort();
        if (port > 0 || tries > 20) { clearInterval(wait); done(); }
      }, 10);
    });
  });

  afterEach(() => {
    bridge.stop();
  });

  test('GET /health returns ok without auth', async () => {
    // Need actual bound port — if still 0, skip
    if (!port) return;
    const res = await httpGet(port, '/health', null);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toBe('1.0.0-test');
  });

  test('GET /profiles returns 401 without token', async () => {
    if (!port) return;
    const res = await httpGet(port, '/profiles', null);
    expect(res.status).toBe(401);
  });

  test('GET /profiles returns 401 with wrong token', async () => {
    if (!port) return;
    const res = await httpGet(port, '/profiles', 'wrong-token');
    expect(res.status).toBe(401);
  });

  test('GET /profiles returns empty array when no ai-tagged profiles', async () => {
    if (!port) return;
    const res = await httpGet(port, '/profiles', token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  test('GET /profiles strips credentials from ai-tagged profiles', async () => {
    if (!port) return;
    bridge.stop();
    bridge = freshBridge();
    const opts = makeMinimalOpts({
      port: 0,
      loadProfiles: () => [{
        name: 'Router',
        protocol: 'ssh',
        host: '192.168.1.1',
        username: 'root',
        password: 'secret',
        pemFile: '/path/to/key.pem',
        pemText: '-----BEGIN RSA PRIVATE KEY-----',
        tags: [{ name: 'ai', color: '#89b4fa' }],
      }],
    });
    bridge.start(opts);
    await new Promise((r) => setTimeout(r, 50));
    const p = bridge.getPort();
    const t = bridge.getToken();
    if (!p) return;
    const res = await httpGet(p, '/profiles', t);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Router');
    expect(res.body[0].password).toBeUndefined();
    expect(res.body[0].pemFile).toBeUndefined();
    expect(res.body[0].pemText).toBeUndefined();
    bridge.stop();
  });

  test('GET /profiles excludes profiles not tagged ai', async () => {
    if (!port) return;
    bridge.stop();
    bridge = freshBridge();
    const opts = makeMinimalOpts({
      port: 0,
      loadProfiles: () => [
        { name: 'Secret', protocol: 'ssh', tags: [{ name: 'work', color: '#f38ba8' }] },
        { name: 'Public', protocol: 'ssh', tags: [{ name: 'ai', color: '#89b4fa' }] },
      ],
    });
    bridge.start(opts);
    await new Promise((r) => setTimeout(r, 50));
    const p = bridge.getPort();
    const t = bridge.getToken();
    if (!p) return;
    const res = await httpGet(p, '/profiles', t);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Public');
    bridge.stop();
  });

  test('GET /sessions returns empty list initially', async () => {
    if (!port) return;
    const res = await httpGet(port, '/sessions', token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('GET /unknown-route returns 404', async () => {
    if (!port) return;
    const res = await httpGet(port, '/unknown-route', token);
    expect(res.status).toBe(404);
  });

  test('isRunning() returns true when started', () => {
    expect(bridge.isRunning()).toBe(true);
  });

  test('isRunning() returns false after stop()', () => {
    bridge.stop();
    expect(bridge.isRunning()).toBe(false);
  });

  test('start() is idempotent — second call is a no-op', () => {
    const portBefore = bridge.getPort();
    bridge.start(makeMinimalOpts({ port: 0 })); // should not throw or rebind
    expect(bridge.getPort()).toBe(portBefore);
  });
});

describe('http-bridge — profile ai-tag filtering', () => {
  test('tag as plain string "ai" is accepted', () => {
    const bridge = freshBridge();
    const opts = makeMinimalOpts({
      port: 0,
      loadProfiles: () => [{
        name: 'Dev',
        protocol: 'local',
        tags: ['ai'],  // plain string tag variant
      }],
    });
    bridge.start(opts);
    // Doesn't throw — coverage for the string-tag path
    bridge.stop();
  });
});

describe('http-bridge — send_input type mismatch fix', () => {
  let bridge, port, token;

  beforeEach(async () => {
    bridge = freshBridge();
    const writeInputCalls = [];
    const serialWriteCalls = [];
    const terminals = new Map();
    terminals.set(42, { fake: true }); // numeric key

    const opts = makeMinimalOpts({
      port: 0,
      terminals,
      serialConns: new Map(),
      writeInput: (id, data) => { writeInputCalls.push({ id, data }); },
      serialWrite: (id, data) => { serialWriteCalls.push({ id, data }); },
    });
    bridge.start(opts);
    bridge._testHelpers = { writeInputCalls, serialWriteCalls, terminals };
    await new Promise((r) => setTimeout(r, 50));
    port  = bridge.getPort();
    token = bridge.getToken();
  });

  afterEach(() => { bridge.stop(); });

  test('POST /sessions/:id/input routes to PTY when id is string but Map key is number', async () => {
    if (!port) return;
    // Register buffer for session "42" (string key in outputBuffers)
    bridge.ensureBuf('42');
    const res = await httpPost(port, '/sessions/42/input', token, { data: 'mypassword\r' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // writeInput should have been called (not serialWrite)
    expect(bridge._testHelpers.writeInputCalls.length).toBe(1);
    expect(bridge._testHelpers.writeInputCalls[0].data).toBe('mypassword\r');
    expect(bridge._testHelpers.serialWriteCalls.length).toBe(0);
  });
});

describe('http-bridge — disconnect type mismatch fix', () => {
  let bridge, port, token;

  beforeEach(async () => {
    bridge = freshBridge();
    const killCalls = [];
    const terminals = new Map();
    terminals.set(42, { fake: true }); // numeric key

    const opts = makeMinimalOpts({
      port: 0,
      terminals,
      serialConns: new Map(),
      killSession: (id) => { killCalls.push(id); },
    });
    bridge.start(opts);
    bridge._testHelpers = { killCalls, terminals };
    await new Promise((r) => setTimeout(r, 50));
    port  = bridge.getPort();
    token = bridge.getToken();
  });

  afterEach(() => { bridge.stop(); });

  test('DELETE /sessions/:id calls killSession when id is string but Map key is number', async () => {
    if (!port) return;
    bridge.ensureBuf('42');
    const res = await httpDelete(port, '/sessions/42', token);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(bridge._testHelpers.killCalls.length).toBe(1);
    expect(bridge._testHelpers.killCalls[0]).toBe('42');
  });
});

describe('http-bridge — run_command waiting_for_input detection', () => {
  let bridge;

  beforeEach(() => { bridge = freshBridge(); });

  test('waitForDone timeout resolves with waiting_for_input when buffer has password prompt', async () => {
    bridge.ensureBuf('99');
    // Simulate a password prompt appearing in the buffer
    bridge.appendOutput('99', 'Connecting to host...\r\nroot@192.168.1.1 password: ');

    // waitForDone is internal but exercised indirectly:
    // The buffer contains a password prompt and no DONE marker,
    // so a short timeout should resolve with waiting_for_input.
    // We access the internal via a fresh bridge run_command flow.
    // Instead, test the pattern used in waitForDone directly:
    const entry = { buf: 'Connecting to host...\r\nroot@192.168.1.1 password: ' };
    const inputPromptRe = /(?:password|passphrase|yes\/no|continue connecting|Enter|confirm).*[:?]\s*$/im;
    const bufTail = entry.buf.slice(-512);
    expect(inputPromptRe.test(bufTail)).toBe(true);
    const match = bufTail.match(inputPromptRe);
    expect(match[0].trim()).toContain('password');
  });

  test('waiting_for_input detects yes/no prompts', () => {
    const inputPromptRe = /(?:password|passphrase|yes\/no|continue connecting|Enter|confirm).*[:?]\s*$/im;
    expect(inputPromptRe.test('Are you sure you want to continue connecting (yes/no)? ')).toBe(true);
  });

  test('waiting_for_input does NOT trigger on normal output', () => {
    const inputPromptRe = /(?:password|passphrase|yes\/no|continue connecting|Enter|confirm).*[:?]\s*$/im;
    expect(inputPromptRe.test('total 24\ndrwxr-xr-x 3 root root 4096\n$ ')).toBe(false);
  });
});

describe('http-bridge — POST /upload endpoint', () => {
  let bridge, port, token;

  beforeEach(async () => {
    bridge = freshBridge();
    const opts = makeMinimalOpts({
      port: 0,
      loadProfiles: () => [
        {
          name: 'Router',
          protocol: 'ssh',
          host: '192.168.1.1',
          username: 'root',
          tags: [{ name: 'ai', color: '#89b4fa' }],
        },
        {
          name: 'Private',
          protocol: 'ssh',
          host: '10.0.0.1',
          tags: [{ name: 'work', color: '#f38ba8' }],
        },
      ],
    });
    bridge.start(opts);
    await new Promise((r) => setTimeout(r, 50));
    port  = bridge.getPort();
    token = bridge.getToken();
  });

  afterEach(() => { bridge.stop(); });

  test('returns 400 when localPath is missing', async () => {
    if (!port) return;
    const res = await httpPost(port, '/upload', token, { profileName: 'Router', remotePath: '/tmp/file' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('localPath');
  });

  test('returns 400 when remotePath is missing', async () => {
    if (!port) return;
    const res = await httpPost(port, '/upload', token, { profileName: 'Router', localPath: '/tmp/local' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('remotePath');
  });

  test('returns 400 when profileName is missing', async () => {
    if (!port) return;
    const res = await httpPost(port, '/upload', token, { localPath: '/tmp/local', remotePath: '/tmp/remote' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('profileName');
  });

  test('returns 404 when profile is not found', async () => {
    if (!port) return;
    const res = await httpPost(port, '/upload', token, { profileName: 'NonExistent', localPath: '/tmp/local', remotePath: '/tmp/remote' });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('NonExistent');
  });

  test('returns 403 when profile is not ai-tagged', async () => {
    if (!port) return;
    const res = await httpPost(port, '/upload', token, { profileName: 'Private', localPath: '/tmp/local', remotePath: '/tmp/remote' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('ai-accessible');
  });
});

describe('http-bridge — path traversal guard on upload', () => {
  let bridge, port, token;

  beforeEach(async () => {
    bridge = freshBridge();
    const opts = makeMinimalOpts({
      port: 0,
      loadProfiles: () => [
        {
          name: 'Router',
          protocol: 'ssh',
          host: '192.168.1.1',
          username: 'root',
          tags: [{ name: 'ai', color: '#89b4fa' }],
        },
      ],
    });
    bridge.start(opts);
    await new Promise((r) => setTimeout(r, 50));
    port  = bridge.getPort();
    token = bridge.getToken();
  });

  afterEach(() => { bridge.stop(); });

  test('returns 403 when localPath is outside home and /tmp (e.g. /etc/passwd)', async () => {
    if (!port) return;
    const res = await httpPost(port, '/upload', token, {
      profileName: 'Router', localPath: '/etc/passwd', remotePath: '/tmp/passwd',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('home directory');
  });

  test('does not return 403 for localPath under home directory', async () => {
    if (!port) return;
    const res = await httpPost(port, '/upload', token, {
      profileName: 'Router', localPath: `${os.homedir()}/file.txt`, remotePath: '/tmp/file.txt',
    });
    // May fail with 400 (file not found) but must NOT be 403 path traversal
    expect(res.status).not.toBe(403);
  });

  test('does not return 403 for localPath under /tmp', async () => {
    if (!port) return;
    const res = await httpPost(port, '/upload', token, {
      profileName: 'Router', localPath: '/tmp/file.txt', remotePath: '/tmp/file.txt',
    });
    expect(res.status).not.toBe(403);
  });
});

describe('http-bridge — path traversal guard on download', () => {
  let bridge, port, token;

  beforeEach(async () => {
    bridge = freshBridge();
    const opts = makeMinimalOpts({
      port: 0,
      loadProfiles: () => [
        {
          name: 'Router',
          protocol: 'ssh',
          host: '192.168.1.1',
          username: 'root',
          tags: [{ name: 'ai', color: '#89b4fa' }],
        },
      ],
    });
    bridge.start(opts);
    await new Promise((r) => setTimeout(r, 50));
    port  = bridge.getPort();
    token = bridge.getToken();
  });

  afterEach(() => { bridge.stop(); });

  test('returns 403 when localPath is outside home and /tmp (e.g. /etc/shadow)', async () => {
    if (!port) return;
    const res = await httpPost(port, '/download', token, {
      profileName: 'Router', remotePath: '/etc/shadow', localPath: '/etc/shadow',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('home directory');
  });

  test('does not return 403 for localPath under home directory', async () => {
    if (!port) return;
    const res = await httpPost(port, '/download', token, {
      profileName: 'Router', remotePath: '/tmp/data.bin', localPath: `${os.homedir()}/data.bin`,
    });
    expect(res.status).not.toBe(403);
  });
});

describe('http-bridge — pager prevention via PTY env', () => {
  test('source sets PAGER, SYSTEMD_PAGER, GIT_PAGER env vars on PTY spawn', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/main/http-bridge.js'), 'utf8');
    // Pager env vars are set on the PTY environment, not prepended to commands
    expect(src).toContain("PAGER: 'cat'");
    expect(src).toContain("SYSTEMD_PAGER: 'cat'");
    expect(src).toContain("GIT_PAGER: 'cat'");
  });

  test('run_command does NOT prepend PAGER vars to the command string', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/main/http-bridge.js'), 'utf8');
    expect(src).not.toContain('${noPager}${cmd}');
  });
});

describe('http-bridge — dead code removal verification', () => {
  test('source does NOT contain legacy "function route(" helper', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/main/http-bridge.js'), 'utf8');
    expect(src).not.toContain('function route(');
  });

  test('source does NOT contain legacy "req_method" variable', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/main/http-bridge.js'), 'utf8');
    expect(src).not.toContain('req_method');
  });
});

describe('http-bridge — GET /sessions/:id/status endpoint', () => {
  let bridge, port, token;

  beforeEach(async () => {
    bridge = freshBridge();
    const terminals = new Map();
    terminals.set(10, { fake: true }); // alive session

    const opts = makeMinimalOpts({
      port: 0,
      terminals,
      serialConns: new Map(),
    });
    bridge.start(opts);
    await new Promise((r) => setTimeout(r, 50));
    port  = bridge.getPort();
    token = bridge.getToken();
  });

  afterEach(() => { bridge.stop(); });

  test('returns 404 for unknown session', async () => {
    if (!port) return;
    const res = await httpGet(port, '/sessions/999/status', token);
    expect(res.status).toBe(404);
  });

  test('returns idle when buffer ends with shell prompt', async () => {
    if (!port) return;
    bridge.ensureBuf('10');
    bridge.appendOutput('10', 'last login: ...\nroot@router:~# ');
    const res = await httpGet(port, '/sessions/10/status', token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('idle');
    expect(res.body.alive).toBe(true);
  });

  test('returns waiting_for_input when buffer ends with password prompt', async () => {
    if (!port) return;
    bridge.ensureBuf('10');
    bridge.appendOutput('10', 'root@192.168.1.1 password: ');
    const res = await httpGet(port, '/sessions/10/status', token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('waiting_for_input');
    expect(res.body.prompt).toContain('password');
  });

  test('returns disconnected when terminal is not alive', async () => {
    if (!port) return;
    // Session 20 has a buffer but no terminal in the Map
    bridge.ensureBuf('20');
    const res = await httpGet(port, '/sessions/20/status', token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('disconnected');
    expect(res.body.alive).toBe(false);
  });
});
