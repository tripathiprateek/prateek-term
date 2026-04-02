/**
 * Prateek-Term — MCP HTTP Bridge
 *
 * A localhost-only HTTP server embedded in the Electron main process.
 * It exposes the running PTY sessions and connection profiles to the
 * standalone MCP server (src/mcp/server.js) which is spawned by AI clients.
 *
 * Security model:
 *  - Binds to 127.0.0.1 only — never externally reachable.
 *  - All endpoints (except /health) require an Authorization: Bearer <token>
 *    header. The token is written to ~/.prateek-term.mcp-token (mode 0600)
 *    on first start and reused across restarts.
 *  - Only profiles tagged "ai" are visible / connectable via the bridge.
 */

const http   = require('http');
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const TOKEN_PATH = path.join(os.homedir(), '.prateek-term.mcp-token');
const OUTPUT_BUF_MAX = 64 * 1024; // 64 KB ring-buffer per session

// DONE marker injected around run_command to detect completion.
// Uses only printable ASCII — null/control bytes are stripped by the PTY layer.
const DONE_PREFIX = 'MTERM_DONE_';
const DONE_SUFFIX = '_MTERM_END';

// ── Token management ────────────────────────────────────────────────────────

function getOrCreateToken() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
    }
  } catch { /* fall through to create */ }
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(TOKEN_PATH, token, { encoding: 'utf8', mode: 0o600 });
  return token;
}

// ── Output ring-buffer per MCP-managed session ──────────────────────────────

// Map<sessionId, { buf: string, waiters: Array<{resolve, reject, marker}> }>
const outputBuffers = new Map();

function ensureBuf(id) {
  const key = String(id);
  if (!outputBuffers.has(key)) outputBuffers.set(key, { buf: '', waiters: [] });
  return outputBuffers.get(key);
}

function appendOutput(id, data) {
  const key = String(id);
  if (!outputBuffers.has(key)) return; // session not MCP-managed
  const entry = outputBuffers.get(key);
  entry.buf = (entry.buf + data).slice(-OUTPUT_BUF_MAX);

  // Notify any long-poll waiters looking for a DONE marker.
  // There may be multiple occurrences of the marker (echo + real output),
  // so search forward through all occurrences until we find one with a valid exit code.
  for (let i = entry.waiters.length - 1; i >= 0; i--) {
    const w = entry.waiters[i];
    let searchFrom = 0;
    let markerIdx;
    while ((markerIdx = entry.buf.indexOf(w.marker, searchFrom)) !== -1) {
      const after = entry.buf.slice(markerIdx + w.marker.length);
      const codeMatch = after.match(/^(\d+)_MTERM_END/);
      if (!codeMatch) {
        // Echo hit — advance past this occurrence and look for the next
        searchFrom = markerIdx + w.marker.length;
        continue;
      }
      const output = entry.buf.slice(0, markerIdx);
      const exitCode = parseInt(codeMatch[1], 10);
      const consumed = markerIdx + w.marker.length + codeMatch[0].length;
      entry.buf = entry.buf.slice(consumed);
      entry.waiters.splice(i, 1);
      w.resolve({ output: stripAnsi(output), exitCode });
      break;
    }
  }
}

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/[\x00-\x08\x0e-\x1f\x7f]/g, '');
}

// Wait until the session buffer contains a shell prompt ($, #, >) or timeout.
// Used after connect to ensure the shell is ready before run_command.
function waitForPrompt(id, timeoutMs) {
  return new Promise((resolve) => {
    const promptRe = /[$#>]\s*$/m;
    const entry = ensureBuf(id);
    if (promptRe.test(entry.buf)) return resolve();
    const interval = setInterval(() => {
      if (promptRe.test(entry.buf)) { clearInterval(interval); clearTimeout(timer); resolve(); }
    }, 200);
    const timer = setTimeout(() => { clearInterval(interval); resolve(); }, timeoutMs);
  });
}

function waitForDone(id, marker, timeoutMs) {
  return new Promise((resolve, reject) => {
    const entry = ensureBuf(id);
    // Already in buffer? Search through all occurrences — skip echo hits (no valid exit code).
    let searchFrom = 0;
    let idx;
    while ((idx = entry.buf.indexOf(marker, searchFrom)) !== -1) {
      const after = entry.buf.slice(idx + marker.length);
      const codeMatch = after.match(/^(\d+)_MTERM_END/);
      if (!codeMatch) { searchFrom = idx + marker.length; continue; }
      const output = entry.buf.slice(0, idx);
      const exitCode = parseInt(codeMatch[1], 10);
      const consumed = idx + marker.length + codeMatch[0].length;
      entry.buf = entry.buf.slice(consumed);
      resolve({ output: stripAnsi(output), exitCode });
      return;
    }
    const timer = setTimeout(() => {
      const pos = entry.waiters.indexOf(w);
      if (pos !== -1) entry.waiters.splice(pos, 1);
      reject(new Error('run_command timed out'));
    }, timeoutMs);
    const w = {
      marker,
      resolve: (val) => { clearTimeout(timer); resolve(val); },
      reject:  (err) => { clearTimeout(timer); reject(err); },
    };
    entry.waiters.push(w);
  });
}

// ── HTTP router helpers ─────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function route(method, pattern, url) {
  // pattern like '/sessions/:id/run' → match and extract params
  const patParts = pattern.split('/');
  const urlParts = url.split('/');
  if (patParts.length !== urlParts.length) return null;
  if (req_method !== method) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// ── Bridge state (injected from main.js) ───────────────────────────────────

let _terminals       = null; // Map<id, node-pty instance>
let _serialConns     = null; // Map<id, serialport instance>
let _loadProfiles    = null; // () => profile[]
let _connectProfile  = null; // (profile) => { command, args, env, _cleanupFiles }
let _spawnPty        = null; // (opts) => { id }
let _writeInput      = null; // (id, data) => void
let _killSession     = null; // (id) => void
let _listSerialPorts = null; // () => Promise<port[]>
let _serialConnect   = null; // (opts) => { id }
let _serialWrite     = null; // (id, data) => void
let _serialClose     = null; // (id) => void
let _getVersion      = null; // () => string

let _token  = null;
let _server = null;
let _port   = 29419;

// ── Route handler ──────────────────────────────────────────────────────────

let req_method = '';

async function handleRequest(req, res) {
  req_method = req.method;
  const url = req.url.split('?')[0].replace(/\/$/, '') || '/';

  // Health — no auth
  if (req.method === 'GET' && url === '/health') {
    return send(res, 200, { ok: true, version: _getVersion ? _getVersion() : '?' });
  }

  // Auth check
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${_token}`) {
    return send(res, 401, { error: 'Unauthorized' });
  }

  // ── GET /profiles ──────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/profiles') {
    const all = _loadProfiles();
    const aiProfiles = all
      .filter(p => Array.isArray(p.tags) && p.tags.some(t => (t.name || t) === 'ai'))
      .map(({ password, pemFile, pemText, ...safe }) => safe); // strip credentials
    return send(res, 200, aiProfiles);
  }

  // ── GET /serial-ports ─────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/serial-ports') {
    try {
      const ports = await _listSerialPorts();
      return send(res, 200, ports);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // ── GET /sessions ─────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/sessions') {
    const sessions = [];
    for (const [id] of outputBuffers) {
      sessions.push({ id, type: _terminals.has(Number(id)) ? 'pty' : 'serial' });
    }
    return send(res, 200, sessions);
  }

  // ── POST /sessions ────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/sessions') {
    const body = await readBody(req);
    try {
      let sessionId;
      if (body.protocol === 'serial') {
        // Serial connection
        const result = await _serialConnect({
          port: body.port, baudRate: body.baudRate || 115200,
          dataBits: body.dataBits || 8, stopBits: body.stopBits || 1,
          parity: body.parity || 'none',
        });
        sessionId = result.id;
        ensureBuf(sessionId);
      } else {
        // SSH / local PTY
        let profile;
        if (body.profileName) {
          const all = _loadProfiles();
          profile = all.find(p => p.name === body.profileName);
          if (!profile) return send(res, 404, { error: `Profile '${body.profileName}' not found` });
          // Security: only ai-tagged profiles
          const isAi = Array.isArray(profile.tags) && profile.tags.some(t => (t.name || t) === 'ai');
          if (!isAi) return send(res, 403, { error: 'Profile not tagged as ai-accessible' });
        } else {
          // Inline profile — no credentials accepted from MCP clients
          profile = { protocol: body.protocol || 'local', host: body.host, username: body.username, port: body.port };
        }
        const cmdInfo = await _connectProfile(profile);
        const result  = await _spawnPty({
          shell: cmdInfo.command,
          args:  cmdInfo.args,
          env:   cmdInfo.env || {},
          cols:  200,
          rows:  50,
          _cleanupFiles: cmdInfo._cleanupFiles || [],
          _pendingPassword: (profile.authType === 'password') ? profile.password : undefined,
        });
        sessionId = result.id;
        ensureBuf(sessionId);
        // Wait for shell prompt (up to 15s) so run_command works immediately after connect
        await waitForPrompt(sessionId, 15000);
      }
      return send(res, 201, { id: sessionId });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // ── POST /sessions/:id/run ────────────────────────────────────────────
  const runParams = matchRoute('POST', '/sessions/:id/run', url, req.method);
  if (runParams) {
    const { id } = runParams;
    if (!outputBuffers.has(id)) return send(res, 404, { error: 'Session not found' });
    const body = await readBody(req);
    const cmd  = body.command || '';
    const timeoutMs = Math.min(body.timeout_ms || 30000, 120000);
    // Unique marker so concurrent calls don't collide
    const marker = `${DONE_PREFIX}${crypto.randomBytes(4).toString('hex')}:`;
    const wrapped = `${cmd} ; printf '${marker}%d${DONE_SUFFIX}' $?\r`;
    _writeInput(id, wrapped);
    try {
      const result = await waitForDone(id, marker, timeoutMs);
      return send(res, 200, result);
    } catch (e) {
      return send(res, 408, { error: e.message });
    }
  }

  // ── POST /sessions/:id/input ─────────────────────────────────────────
  const inputParams = matchRoute('POST', '/sessions/:id/input', url, req.method);
  if (inputParams) {
    const { id } = inputParams;
    if (!outputBuffers.has(id)) return send(res, 404, { error: 'Session not found' });
    const body = await readBody(req);
    const data = body.data || '';
    if (_terminals.has(id)) _writeInput(id, data);
    else if (_serialConns.has(id)) _serialWrite(id, data);
    return send(res, 200, { ok: true });
  }

  // ── GET /sessions/:id/output ─────────────────────────────────────────
  const outParams = matchRoute('GET', '/sessions/:id/output', url, req.method);
  if (outParams) {
    const { id } = outParams;
    if (!outputBuffers.has(id)) return send(res, 404, { error: 'Session not found' });
    const entry = outputBuffers.get(id);
    const output = stripAnsi(entry.buf);
    entry.buf = '';
    return send(res, 200, { output });
  }

  // ── DELETE /sessions/:id ─────────────────────────────────────────────
  const delParams = matchRoute('DELETE', '/sessions/:id', url, req.method);
  if (delParams) {
    const { id } = delParams;
    if (!outputBuffers.has(id)) return send(res, 404, { error: 'Session not found' });
    if (_terminals.has(id)) _killSession(id);
    else if (_serialConns.has(id)) _serialClose(id);
    outputBuffers.delete(id);
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'Not found' });
}

function matchRoute(method, pattern, url, reqMethod) {
  if (reqMethod !== method) return null;
  const patParts = pattern.split('/');
  const urlParts = url.split('/');
  if (patParts.length !== urlParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Start the HTTP bridge.
 * @param {object} opts
 * @param {Map}    opts.terminals        - node-pty terminals Map from main.js
 * @param {Map}    opts.serialConns      - serial connections Map from main.js
 * @param {Function} opts.loadProfiles   - () => profile[]
 * @param {Function} opts.connectProfile - (profile) => Promise<cmdInfo>
 * @param {Function} opts.spawnPty       - (opts) => Promise<{id}>
 * @param {Function} opts.writeInput     - (id, data) => void
 * @param {Function} opts.killSession    - (id) => void
 * @param {Function} opts.listSerialPorts
 * @param {Function} opts.serialConnect
 * @param {Function} opts.serialWrite
 * @param {Function} opts.serialClose
 * @param {Function} opts.getVersion     - () => string
 * @param {number}   opts.port           - TCP port (default 29419)
 */
function start(opts) {
  if (_server) return; // already running

  _terminals       = opts.terminals;
  _serialConns     = opts.serialConns;
  _loadProfiles    = opts.loadProfiles;
  _connectProfile  = opts.connectProfile;
  _spawnPty        = opts.spawnPty;
  _writeInput      = opts.writeInput;
  _killSession     = opts.killSession;
  _listSerialPorts = opts.listSerialPorts;
  _serialConnect   = opts.serialConnect;
  _serialWrite     = opts.serialWrite;
  _serialClose     = opts.serialClose;
  _getVersion      = opts.getVersion;
  _port            = opts.port || 29419;
  _token           = getOrCreateToken();

  _server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      send(res, 500, { error: err.message });
    });
  });

  _server.listen(_port, '127.0.0.1', () => {
    console.log(`[MCP bridge] listening on 127.0.0.1:${_port}`);
  });

  _server.on('error', (err) => {
    console.error('[MCP bridge] server error:', err.message);
  });
}

function stop() {
  if (!_server) return;
  _server.close();
  _server = null;
  outputBuffers.clear();
  console.log('[MCP bridge] stopped');
}

function isRunning() {
  return _server !== null && _server.listening;
}

function getPort() { return _port; }
function getToken() { return _token; }

module.exports = { start, stop, isRunning, getPort, getToken, appendOutput, ensureBuf };
