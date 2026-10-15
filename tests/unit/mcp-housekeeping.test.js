'use strict';
/**
 * Two loose ends found while reviewing the MCP connect fixes.
 *
 * 1. Dead sessions were never reaped. Every session ever opened kept its output
 *    buffer in `outputBuffers` for the life of the app, so list_sessions grew an
 *    ever-longer list of entries whose process was long gone.
 *
 * 2. add_profile stored tags as the plain strings its schema advertised, but the
 *    renderer reads `t.name` (app.js:2927 `tagMap.set(t.name, t.color)`), so a
 *    profile created over MCP got tags that render blank and never filter.
 */

const http = require('http');

function freshBridge() {
  const key = require.resolve('../../src/main/http-bridge');
  delete require.cache[key];
  return require('../../src/main/http-bridge');
}

function startBound(bridge, o) {
  bridge.start(o);
  return new Promise((resolve, reject) => {
    let n = 0;
    const t = setInterval(() => {
      const p = bridge.getPort();
      if (p > 0) { clearInterval(t); resolve(p); }
      else if (++n > 100) { clearInterval(t); reject(new Error('never bound')); }
    }, 10);
  });
}

function req(method, port, urlPath, token, payload) {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : null;
    const r = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
                            catch { resolve({ status: res.statusCode, body: b }); } });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

function baseOpts(o = {}) {
  return {
    terminals: new Map(), serialConns: new Map(),
    loadProfiles: () => [], saveProfiles: () => {}, broadcastProfilesChanged: () => {},
    connectProfile: () => Promise.resolve({ command: 'ssh', args: [], env: {}, _cleanupFiles: [] }),
    spawnPty: () => Promise.resolve({ id: '1' }),
    writeInput: () => {}, killSession: () => {},
    listSerialPorts: () => Promise.resolve([]), serialConnect: () => Promise.resolve({ id: 's1' }),
    serialWrite: () => {}, serialClose: () => {},
    getVersion: () => '1.0.0-test', port: 0, ...o,
  };
}

describe('dead sessions are reaped', () => {
  let bridge, port, token;

  beforeEach(async () => {
    bridge = freshBridge();
    port = await startBound(bridge, baseOpts({
      terminals:   new Map([[1, { live: true }]]),
      serialConns: new Map([['s1', { isOpen: true }]]),
    }));
    token = bridge.getToken();
    bridge.ensureBuf('1');   // live pty
    bridge.ensureBuf('s1');  // live serial
    bridge.ensureBuf('99');  // process gone
    bridge.ensureBuf('98');  // process gone
  });
  afterEach(() => { try { bridge.stop(); } catch { /* down */ } });

  test('a closed session is kept at first, so its last output is still readable', async () => {
    const r = await req('GET', port, '/sessions', token);
    const ids = r.body.map((s) => String(s.id));
    expect(ids).toContain('99');
    expect(r.body.find((s) => String(s.id) === '99').type).toBe('closed');
  });

  test('it is dropped once the grace period has passed', () => {
    bridge.reapClosedBuffers(Date.now());              // first sighting — stamps it
    expect(bridge.ensureBuf('99').buf).toBeDefined();  // still present
    bridge.reapClosedBuffers(Date.now() + 10 * 60 * 1000);
    // ensureBuf would recreate it, so check the listing instead.
    return req('GET', port, '/sessions', token).then((r) => {
      const ids = r.body.map((s) => String(s.id));
      expect(ids).not.toContain('98');
      expect(ids).toContain('1');    // live pty survives
      expect(ids).toContain('s1');   // live serial survives
    });
  });

  test('a session someone is still reading is never reaped', () => {
    const entry = bridge.ensureBuf('98');
    entry.waiters.push({ fake: 'long-poll' });
    bridge.reapClosedBuffers(Date.now());
    bridge.reapClosedBuffers(Date.now() + 10 * 60 * 1000);
    return req('GET', port, '/sessions', token).then((r) => {
      expect(r.body.map((s) => String(s.id))).toContain('98');
    });
  });

  test('a session that comes back to life loses its death stamp', () => {
    // '1' is a live pty in this fixture, so it must never be stamped at all.
    const live = bridge.ensureBuf('1');
    bridge.reapClosedBuffers(Date.now());
    expect(live.closedAt).toBeFalsy();
    bridge.reapClosedBuffers(Date.now() + 10 * 60 * 1000);
    expect(live.closedAt).toBeFalsy();
  });

  test('a dead session IS stamped, and only then expires', () => {
    const dead = bridge.ensureBuf('99');
    const t0 = Date.now();
    bridge.reapClosedBuffers(t0);
    expect(dead.closedAt).toBe(t0);                 // stamped, not dropped
    bridge.reapClosedBuffers(t0 + 60 * 1000);       // inside the grace period
    return req('GET', port, '/sessions', token).then((r) => {
      expect(r.body.map((x) => String(x.id))).toContain('99');
    });
  });

});

describe('add_profile stores tags in the shape the UI reads', () => {
  let bridge, port, token, saved;

  beforeEach(async () => {
    saved = null;
    bridge = freshBridge();
    port = await startBound(bridge, baseOpts({
      loadProfiles: () => [],
      saveProfiles: (p) => { saved = p; },
    }));
    token = bridge.getToken();
  });
  afterEach(() => { try { bridge.stop(); } catch { /* down */ } });

  test('plain strings become {name,color} objects', async () => {
    await req('POST', port, '/profiles', token, {
      name: 'dev-box', protocol: 'ssh', host: '10.0.0.5', tags: ['HOME', 'lab'],
    });
    expect(saved[0].tags).toEqual([
      { name: 'HOME', color: expect.any(String) },
      { name: 'lab',  color: expect.any(String) },
    ]);
  });

  test('a tag object the GUI already made is left alone', async () => {
    await req('POST', port, '/profiles', token, {
      name: 'dev-box', protocol: 'ssh', host: '10.0.0.5',
      tags: [{ name: 'HOME', color: '#fb89c0' }],
    });
    expect(saved[0].tags).toEqual([{ name: 'HOME', color: '#fb89c0' }]);
  });

  test('a bare string tag is still accepted', async () => {
    await req('POST', port, '/profiles', token, {
      name: 'dev-box', protocol: 'ssh', host: '10.0.0.5', tags: 'solo',
    });
    expect(saved[0].tags).toEqual([{ name: 'solo', color: expect.any(String) }]);
  });

  test('junk entries are dropped rather than stored unusable', async () => {
    await req('POST', port, '/profiles', token, {
      name: 'dev-box', protocol: 'ssh', host: '10.0.0.5', tags: ['ok', null, 42, {}, ''],
    });
    expect(saved[0].tags).toEqual([{ name: 'ok', color: expect.any(String) }]);
  });

  test('no tags at all stays an empty array', async () => {
    await req('POST', port, '/profiles', token, { name: 'x', protocol: 'ssh', host: 'h' });
    expect(saved[0].tags).toEqual([]);
  });
});

describe('the add_profile schema describes the shape it accepts', () => {
  const fs = require('fs'); const path = require('path');
  test('tags are documented as names, not as the access control', () => {
    const s = fs.readFileSync(path.join(__dirname, '../../src/mcp/server.js'), 'utf8');
    expect(s).toMatch(/tags:[^\n]*description:[^\n]*grouping/i);
    expect(s).not.toMatch(/"ai"/);
  });
});
