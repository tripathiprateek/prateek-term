'use strict';
/**
 * A transfer is judged by scp's exit code, never by what the output says.
 *
 * Reported as "MCP upload_file fails with HTTP 500". It had not failed. The
 * file was on the device, byte-for-byte (md5 eb03d2ee… on both ends), written
 * at the exact minute of the "failure". What had gone wrong was the verdict:
 *
 *   const failed = /permission denied|no such file|connection refused|
 *                   lost connection/i.test(result.output);
 *
 * The PTY buffer carries the REMOTE SHELL's chatter as well as scp's own. A
 * Raspberry Pi whose en_US.UTF-8 locale was never generated answers every
 * connection with
 *
 *   bash: warning: setlocale: LC_ALL: cannot change locale (en_US.UTF-8): No such file or directory
 *
 * and `no such file` matched. Captured verbatim from the live bridge; it is
 * the PI_GREETING constant below. Not flaky, not network-dependent: that
 * device failed this check every single time while transferring perfectly
 * every single time.
 *
 * The converse was equally wrong — a device that failed without printing one
 * of those four phrases was reported as a success.
 *
 * These tests drive the real bridge over real HTTP with a fake PTY, so they
 * exercise the actual verdict rather than the shape of the source.
 */

const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// The real greeting from pi@192.168.1.183, straight out of the 500 response
// body. The known-hosts line is scp's; the setlocale line is the Pi's bash.
const PI_GREETING =
  "Warning: Permanently added '192.168.1.183' (ED25519) to the list of known hosts.\r\r\n" +
  'bash: warning: setlocale: LC_ALL: cannot change locale (en_US.UTF-8): No such file or directory\r\n';

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
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, body: b }); }
      });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

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

// Key-based so runScpTransfer takes the plain `scp` branch — no sshpass lookup,
// which would make these tests depend on what is installed on the machine.
const PROFILE = {
  name: 'pi', protocol: 'ssh', host: '192.168.1.183',
  username: 'pi', authType: 'key', aiEnabled: true,
};

let LOCAL_FILE;
const MISSING_FILE = path.join(os.tmpdir(), 'scp-exit-code-never-written.bin');

beforeAll(() => {
  LOCAL_FILE = path.join(os.tmpdir(), `scp-exit-code-${process.pid}.bin`);
  fs.writeFileSync(LOCAL_FILE, 'payload');
  try { fs.unlinkSync(MISSING_FILE); } catch { /* not there, good */ }
});

afterAll(() => { try { fs.unlinkSync(LOCAL_FILE); } catch { /* already gone */ } });

/**
 * A PTY that prints `output`, then exits with `exitCode`, in that order —
 * the same order node-pty delivers them. `exitCode: null` models a transfer
 * still running when the bridge gives up, i.e. a timeout.
 */
function wiring(bridgeRef, { output, exitCode }) {
  const terminals = new Map();
  return {
    terminals,
    serialConns: new Map(),
    loadProfiles: () => [PROFILE],
    saveProfiles: () => {}, broadcastProfilesChanged: () => {},
    connectProfile: () => Promise.resolve({ command: 'ssh', args: [], env: {}, _cleanupFiles: [] }),
    spawnPty: () => {
      terminals.set(1, { kill() {} });
      // Fires after runScpTransfer's synchronous ensureBuf — appendOutput
      // drops data for a session it has no buffer for.
      setTimeout(() => {
        bridgeRef.current.appendOutput('1', output);
        if (exitCode === null) return;      // never exits — the timeout case
        bridgeRef.current.noteExit('1', exitCode);
        terminals.delete(1);
      }, 50);
      return Promise.resolve({ id: '1' });
    },
    writeInput: () => {},
    killSession: () => { terminals.delete(1); },
    listSerialPorts: () => Promise.resolve([]),
    serialConnect: () => Promise.resolve({ id: 's1' }),
    serialWrite: () => {}, serialClose: () => {},
    getVersion: () => '1.0.0-test', port: 0,
  };
}

describe('scp verdict comes from the exit code', () => {
  let bridge, port, token;
  const ref = { current: null };

  async function boot(pty) {
    bridge = freshBridge();
    ref.current = bridge;
    port = await startBound(bridge, wiring(ref, pty));
    token = bridge.getToken();
  }

  afterEach(() => { try { bridge.stop(); } catch { /* already down */ } });

  // ── the regression ────────────────────────────────────────────────────────

  test('an upload that exits 0 succeeds even though the Pi said "No such file or directory"', async () => {
    await boot({ output: PI_GREETING, exitCode: 0 });
    const r = await post(port, '/upload', token, {
      profileName: 'pi', localPath: LOCAL_FILE, remotePath: '/tmp/hw4.bin',
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.exitCode).toBe(0);
    // Proof this is the real trap and not a watered-down stand-in: the text the
    // old regex keyed on is genuinely present in what we just called a success.
    expect(r.body.output).toMatch(/no such file or directory/i);
  }, 20000);

  // ── the converse the old check also got wrong ─────────────────────────────

  test('an upload that exits non-zero fails even when the output looks clean', async () => {
    await boot({ output: 'transferring…\r\n', exitCode: 1 });
    const r = await post(port, '/upload', token, {
      profileName: 'pi', localPath: LOCAL_FILE, remotePath: '/tmp/hw4.bin',
    });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(r.body.exitCode).toBe(1);
    expect(r.body.output).not.toMatch(/permission denied|no such file/i);
  }, 20000);

  test('a genuine scp error still fails, and its text reaches the caller', async () => {
    await boot({ output: 'scp: /tmp/x: Permission denied\r\n', exitCode: 1 });
    const r = await post(port, '/upload', token, {
      profileName: 'pi', localPath: LOCAL_FILE, remotePath: '/tmp/x',
    });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(r.body.output).toMatch(/permission denied/i);
  }, 20000);

  // ── timeout: no exit code at all is a failure, not a silent pass ──────────

  test('a transfer that never exits is a failure, and says so', async () => {
    await boot({ output: PI_GREETING, exitCode: null });
    const r = await post(port, '/upload', token, {
      profileName: 'pi', localPath: LOCAL_FILE, remotePath: '/tmp/hw4.bin', timeout_ms: 5000,
    });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(r.body.exitCode).toBeNull();
    expect(r.body.output).toMatch(/timed out/i);
  }, 30000);

  // ── download: exit code AND the file must actually be there ───────────────

  test('a download that exits 0 succeeds despite the same "No such file" greeting', async () => {
    await boot({ output: PI_GREETING, exitCode: 0 });
    const r = await post(port, '/download', token, {
      profileName: 'pi', remotePath: '/tmp/hw4.bin', localPath: LOCAL_FILE,
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.output).toMatch(/no such file or directory/i);
  }, 20000);

  test('a download that exits 0 without producing the file is still a failure', async () => {
    await boot({ output: '', exitCode: 0 });
    const r = await post(port, '/download', token, {
      profileName: 'pi', remotePath: '/tmp/hw4.bin', localPath: MISSING_FILE,
    });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
  }, 20000);
});

// ── the other half of the bug: the caller could not see any of this ─────────
//
// The bridge answers a failed transfer with {ok:false, output:"…"} and no
// `error` key, so `parsed.error || HTTP ${status}` threw away the explanation
// and the user was shown a bare "Error: HTTP 500". Asserting that `output`
// merely appears somewhere is not enough — it has to be reached when `error`
// is absent, and it must not displace `error` when that is present.

// ── the wiring the behavioural tests above cannot reach ────────────────────
//
// Those tests fake spawnPty and call noteExit themselves, so they would all
// still pass if main.js stopped recording the exit code — and then every
// transfer would report failure, because an unrecorded code reads as
// undefined. main.js needs electron, so it cannot be executed here; this is a
// source contract, pinned to the two edits that would break it silently:
// deleting the noteExit call, and dropping `{ exitCode }` from the handler's
// parameter list (which leaves noteExit recording an undefined).
// Mutation-tested: both of those edits fail this test.

describe('main.js records the PTY exit code for the bridge', () => {
  const MAIN = path.resolve(__dirname, '../../src/main/main.js');
  let onExitBlock;

  beforeAll(() => {
    const src = fs.readFileSync(MAIN, 'utf8');
    // The bridge's own PTY, not the UI's — spawnPtyForBridge is where MCP
    // transfers get their session.
    const fn = src.slice(src.indexOf('function spawnPtyForBridge'));
    expect(fn).not.toHaveLength(0);
    const start = fn.indexOf('term.onExit(');
    expect(start).toBeGreaterThan(-1);
    onExitBlock = fn.slice(start, fn.indexOf('});', start) + 3);
  });

  test('the handler takes the exit code and hands it to the bridge', () => {
    expect(onExitBlock).toMatch(/term\.onExit\(\(\{\s*exitCode\s*\}\)\s*=>/);
    expect(onExitBlock).toMatch(/bridge\.noteExit\(\s*id\s*,\s*exitCode\s*\)/);
  });

  test('the bridge still exports noteExit under that name', () => {
    expect(typeof freshBridge().noteExit).toBe('function');
  });
});

describe('the MCP client surfaces the bridge body, not just the status', () => {
  const SERVER = path.resolve(__dirname, '../../src/mcp/server.js');
  let src;
  beforeAll(() => { src = fs.readFileSync(SERVER, 'utf8'); });

  test('the >=400 branch falls back through error → output → status line', () => {
    const branch = src.slice(src.indexOf('if (res.statusCode >= 400)'));
    const detail = branch.slice(0, branch.indexOf('reject('));
    // `error` must be tried first, `output` must be a real fallback after it.
    expect(detail).toMatch(/parsed\.error\s*\n?\s*\|\|/);
    expect(detail).toMatch(/parsed\.output/);
    const rejectLine = branch.slice(branch.indexOf('reject('), branch.indexOf('reject(') + 120);
    expect(rejectLine).toMatch(/detail\s*\|\|/);
    expect(rejectLine).toMatch(/HTTP \$\{res\.statusCode\}/);
    // Ordering, not just presence: error ahead of output ahead of the status.
    expect(detail.indexOf('parsed.error')).toBeLessThan(detail.indexOf('parsed.output'));
  });
});
