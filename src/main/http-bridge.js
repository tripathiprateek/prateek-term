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
 *    header. The token is written to ~/Library/Application Support/prateek-term/mcp-token
 *    (mode 0600) on first start and reused across restarts.
 *  - Only profiles with AI/MCP access toggled on are visible / connectable via the bridge.
 */

const http   = require('http');
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { buildCloudflareProxyFlags, buildJumpHostProxyCommand, buildCommonSSHFlags } = require('./ssh-utils');
const platform = require('./platform');

// Cross-platform token path — mirrors Electron's app.getPath('userData')
function _getTokenPath() {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'prateek-term', 'mcp-token');
    case 'win32':
      return path.join(process.env.APPDATA || os.homedir(), 'prateek-term', 'mcp-token');
    default: // linux + others
      return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'prateek-term', 'mcp-token');
  }
}
const TOKEN_PATH        = _getTokenPath();
const TOKEN_PATH_LEGACY = path.join(os.homedir(), '.prateek-term.mcp-token');
const OUTPUT_BUF_MAX = 64 * 1024; // 64 KB ring-buffer per session

// DONE marker injected around run_command to detect completion.
// Uses only printable ASCII — null/control bytes are stripped by the PTY layer.
const DONE_PREFIX = 'MTERM_DONE_';
const DONE_SUFFIX = '_MTERM_END';

// ── Token management ────────────────────────────────────────────────────────

function getOrCreateToken() {
  // Migrate legacy token from home dir on first run
  try {
    if (!fs.existsSync(TOKEN_PATH) && fs.existsSync(TOKEN_PATH_LEGACY)) {
      const dir = path.dirname(TOKEN_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.renameSync(TOKEN_PATH_LEGACY, TOKEN_PATH);
    }
  } catch { /* ignore migration errors */ }
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
    }
  } catch { /* fall through to create */ }
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
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
  return str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')  // CSI sequences (includes ?2004h/l bracket paste)
    .replace(/\x1b\][^\x07]*\x07/g, '')               // OSC sequences
    .replace(/\x1b[()][0-9A-B]/g, '')                  // character set sequences
    .replace(/[\x00-\x08\x0e-\x1f\x7f]/g, '');        // control characters
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
      // Check if the process is waiting for input (password, confirmation, etc.)
      const inputPromptRe = /(?:password|passphrase|yes\/no|continue connecting|Enter|confirm).*[:?]\s*$/im;
      const bufTail = entry.buf.slice(-512);
      if (inputPromptRe.test(bufTail)) {
        resolve({ output: stripAnsi(entry.buf), exitCode: -1, status: 'waiting_for_input', prompt: bufTail.match(inputPromptRe)[0].trim() });
      } else {
        reject(new Error('run_command timed out'));
      }
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

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
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

function validateLocalPath(localPath) {
  const resolved = path.resolve(localPath);
  const home = os.homedir();
  if (!resolved.startsWith(home) && !resolved.startsWith(os.tmpdir())) {
    return 'localPath must be within home directory or temp directory';
  }
  return null;
}

function resolveAiProfile(profileName) {
  const all = _loadProfiles();
  const profile = all.find(p => p.name === profileName);
  if (!profile) return { status: 404, error: `Profile '${profileName}' not found` };
  if (!profile.aiEnabled) return { status: 403, error: 'Profile does not have AI/MCP access enabled' };
  if (profile.protocol !== 'ssh') return { status: 400, error: 'File transfer only supports SSH profiles' };
  return { profile };
}

async function runScpTransfer(profile, scpTargets, timeout_ms) {
  // -O forces the legacy SCP protocol (dropbear/BusyBox devices have no sftp
  // subsystem). StrictHostKeyChecking=no + UserKnownHostsFile=/dev/null keep the
  // headless transfer from hanging on an unknown-host prompt. SSH honours the
  // first value seen for an -o option, so these win over the accept-new that
  // buildCommonSSHFlags appends below.
  const scpArgs = ['-O', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];
  const cleanupFiles = [];

  try {
    // Resolve pasted PEM text to a temp key file so buildCommonSSHFlags can use it.
    let effectiveProfile = profile;
    if (!profile.pemFile && profile.pemText) {
      const keysDir = path.join(os.tmpdir(), 'prateek-term-keys');
      if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
      const hash = crypto.createHash('sha256').update(profile.pemText).digest('hex').slice(0, 12);
      const keyPath = path.join(keysDir, `scp-key-${hash}`);
      fs.writeFileSync(keyPath, profile.pemText, { mode: 0o600 });
      cleanupFiles.push(keyPath);
      effectiveProfile = { ...profile, pemFile: keyPath };
    }

    // Reuse the same auth/algorithm flags as the SSH terminal and UI drag-drop
    // SCP: HostKeyAlgorithms=+ssh-rsa (needed by dropbear devices like the
    // Lantronix E210), PubkeyAcceptedAlgorithms=+ssh-rsa, ConnectTimeout,
    // -i / IdentitiesOnly, PreferredAuthentications, compression, etc.
    scpArgs.push(...buildCommonSSHFlags(effectiveProfile));

    // ProxyCommand — same mutual-exclusion rule as SSH terminal
    if (effectiveProfile.cloudflareAccess) {
      scpArgs.push(...buildCloudflareProxyFlags(effectiveProfile.cloudflaredPath || null));
    } else if (effectiveProfile.proxyEnabled) {
      scpArgs.push(...buildJumpHostProxyCommand(effectiveProfile));
    }

    if (profile.port && profile.port !== 22) scpArgs.push('-P', String(profile.port));
    scpArgs.push(...scpTargets);

    // Spawn the binary directly via argv (no shell) so there's zero quoting to
    // get wrong — works identically on macOS, Linux, and Windows (scp.exe).
    let binCmd, binArgs;
    if (profile.password && !profile.pemFile && !profile.pemText) {
      // sshpass doesn't exist on Windows; if it's not found, password-based
      // transfer can't work — return a clear message instead of hanging.
      const sshpassBin = platform.whichBin('sshpass',
        ['/opt/homebrew/bin/sshpass', '/usr/local/bin/sshpass', '/usr/bin/sshpass']);
      if (!sshpassBin) {
        return { output: 'ERROR: password-based file transfer requires sshpass, which is not available on this platform. Use key-based authentication for SCP/SFTP instead.' };
      }
      const pwPath = path.join(os.tmpdir(), `prateek-term-pw-${crypto.randomBytes(4).toString('hex')}`);
      fs.writeFileSync(pwPath, profile.password, { mode: 0o600 });
      cleanupFiles.push(pwPath);
      binCmd = sshpassBin;
      binArgs = ['-f', pwPath, 'scp', ...scpArgs];
    } else {
      binCmd = 'scp';
      binArgs = scpArgs;
    }

    const result = await _spawnPty({ shell: binCmd, args: binArgs, cols: 200, rows: 50, _cleanupFiles: [] });
    const scpSessionId = result.id;
    ensureBuf(scpSessionId);

    const timeoutMs = Math.min(timeout_ms || 120000, 300000);
    await new Promise(resolve => setTimeout(resolve, 2000));

    const startTime = Date.now();
    let scpOutput = '';
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const entry = outputBuffers.get(scpSessionId);
      if (entry) scpOutput = entry.buf;
      if (!_terminals.has(Number(scpSessionId))) break;
    }

    const entry = outputBuffers.get(scpSessionId);
    if (entry) scpOutput = stripAnsi(entry.buf);
    if (_terminals.has(Number(scpSessionId))) _killSession(scpSessionId);
    outputBuffers.delete(scpSessionId);

    return { output: scpOutput };
  } finally {
    for (const f of cleanupFiles) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
  }
}

// ── Bridge state (injected from main.js) ───────────────────────────────────

let _terminals       = null; // Map<id, node-pty instance>
let _serialConns     = null; // Map<id, serialport instance>
let _loadProfiles    = null; // () => profile[]
let _saveProfiles    = null; // (profiles) => void
let _connectProfile  = null; // (profile) => { command, args, env, _cleanupFiles }
let _spawnPty        = null; // (opts) => { id }
let _writeInput      = null; // (id, data) => void
let _killSession     = null; // (id) => void
let _listSerialPorts = null; // () => Promise<port[]>
let _serialConnect   = null; // (opts) => { id }
let _serialWrite     = null; // (id, data) => void
let _serialClose     = null; // (id) => void
let _getVersion      = null; // () => string
let _broadcastProfilesChanged = null; // () => void  — notify renderer windows

let _token  = null;
let _server = null;
let _port   = 29419;
let _log    = (msg) => console.log('[MCP bridge]', msg);
let _logErr = (msg) => console.error('[MCP bridge]', msg);

// ── Route handler ──────────────────────────────────────────────────────────

async function handleRequest(req, res) {
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
      .filter(p => p.aiEnabled)
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
          // Security: only AI-enabled profiles
          if (!profile.aiEnabled) return send(res, 403, { error: 'Profile does not have AI/MCP access enabled' });
        } else {
          // Inline profile — no credentials accepted from MCP clients
          profile = { protocol: body.protocol || 'local', host: body.host, username: body.username, port: body.port };
        }
        const cmdInfo = await _connectProfile(profile);
        const result  = await _spawnPty({
          shell: cmdInfo.command,
          args:  cmdInfo.args,
          env:   { ...cmdInfo.env, PAGER: 'cat', SYSTEMD_PAGER: 'cat', GIT_PAGER: 'cat', LESS: '' },
          cols:  200,
          rows:  50,
          _cleanupFiles: cmdInfo._cleanupFiles || [],
          _pendingPassword: (profile.authType === 'password') ? profile.password : undefined,
          profileName: body.profileName || null,
        });
        sessionId = result.id;
        ensureBuf(sessionId);
        // Wait for shell prompt (up to 15s) so run_command works immediately after connect
        await waitForPrompt(sessionId, 15000);

        // Log the PTY output after prompt wait — helps diagnose auth failures
        const postConnectBuf = ensureBuf(sessionId).buf;
        if (profile && profile.protocol === 'ssh') {
          const authFailed = /permission denied|authentication fail|no more authentication|connection refused|connection closed|connection reset/i.test(postConnectBuf);
          if (authFailed) {
            _logErr(`SSH auth failed for ${profile.host}: ${postConnectBuf.slice(-500)}`);
            return send(res, 500, { error: `SSH authentication failed for ${profile.host}. Check profile credentials and key configuration.` });
          }
          _log(`SSH connect to ${profile.host} — buffer (last 200): ${postConnectBuf.slice(-200).replace(/\n/g, '\\n')}`);
        }

        // For SSH profiles, verify we landed on the remote by running hostname
        if (profile && profile.protocol === 'ssh' && profile.host) {
          try {
            const marker = `${DONE_PREFIX}${crypto.randomBytes(4).toString('hex')}:`;
            const wrapped = `hostname ; printf '${marker}%d${DONE_SUFFIX}' $?\r`;
            _writeInput(sessionId, wrapped);
            const hostResult = await waitForDone(sessionId, marker, 5000);
            const remoteHost = hostResult.output.trim().split('\n').pop().trim();
            // Detect if we're still on the local machine (SSH may have failed silently)
            const localHostname = os.hostname();
            if (remoteHost === localHostname || remoteHost.startsWith(localHostname.split('.')[0])) {
              return send(res, 500, {
                error: `SSH connection failed — session landed on local machine (${remoteHost}) instead of ${profile.host}. Check the profile credentials.`,
                id: sessionId,
              });
            }
            return send(res, 201, {
              id: sessionId,
              host: profile.host,
              remoteHostname: remoteHost,
              protocol: profile.protocol,
            });
          } catch {
            // Hostname check failed — still return session but warn
            return send(res, 201, { id: sessionId, host: profile.host, protocol: profile.protocol, warning: 'Could not verify remote hostname' });
          }
        }
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
    if (_terminals.has(Number(id))) _writeInput(id, data);
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
    if (_terminals.has(Number(id))) _killSession(id);
    else if (_serialConns.has(id)) _serialClose(id);
    outputBuffers.delete(id);
    return send(res, 200, { ok: true });
  }

  // ── GET /sessions/:id/status ──────────────────────────────────────────
  const statusParams = matchRoute('GET', '/sessions/:id/status', url, req.method);
  if (statusParams) {
    const { id } = statusParams;
    if (!outputBuffers.has(id)) return send(res, 404, { error: 'Session not found' });
    const entry = outputBuffers.get(id);
    const alive = _terminals.has(Number(id)) || _serialConns.has(id);
    const bufTail = entry.buf.slice(-512);
    const inputPromptRe = /(?:password|passphrase|yes\/no|continue connecting|Enter|confirm).*[:?]\s*$/im;
    const shellPromptRe = /[$#>]\s*$/m;
    let state = 'unknown';
    let prompt = null;
    if (!alive) {
      state = 'disconnected';
    } else if (inputPromptRe.test(bufTail)) {
      state = 'waiting_for_input';
      prompt = bufTail.match(inputPromptRe)[0].trim();
    } else if (entry.waiters.length > 0) {
      state = 'running_command';
    } else if (shellPromptRe.test(bufTail)) {
      state = 'idle';
    } else {
      state = 'busy';
    }
    return send(res, 200, { id, state, alive, prompt, pendingCommands: entry.waiters.length });
  }

  // ── POST /upload ──────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/upload') {
    const body = await readBody(req);
    const { profileName, localPath, remotePath, timeout_ms } = body;
    if (!localPath || !remotePath) return send(res, 400, { error: 'localPath and remotePath are required' });
    if (!profileName) return send(res, 400, { error: 'profileName is required' });
    const profileErr = resolveAiProfile(profileName);
    if (profileErr.error) return send(res, profileErr.status, { error: profileErr.error });
    const pathErr = validateLocalPath(localPath);
    if (pathErr) return send(res, 403, { error: pathErr });
    if (!fs.existsSync(localPath)) return send(res, 400, { error: `Local file not found: ${localPath}` });
    const profile = profileErr.profile;
    const userHost = profile.username ? `${profile.username}@${profile.host}` : profile.host;
    const result = await runScpTransfer(profile, [localPath, `${userHost}:${remotePath}`], timeout_ms);
    const failed = /permission denied|no such file|connection refused|lost connection/i.test(result.output);
    return send(res, failed ? 500 : 200, { ok: !failed, output: result.output });
  }

  // ── POST /download ────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/download') {
    const body = await readBody(req);
    const { profileName, remotePath, localPath, timeout_ms } = body;
    if (!remotePath || !localPath) return send(res, 400, { error: 'remotePath and localPath are required' });
    if (!profileName) return send(res, 400, { error: 'profileName is required' });
    const pathErr = validateLocalPath(localPath);
    if (pathErr) return send(res, 403, { error: pathErr });
    const profileErr = resolveAiProfile(profileName);
    if (profileErr.error) return send(res, profileErr.status, { error: profileErr.error });
    const profile = profileErr.profile;
    const userHost = profile.username ? `${profile.username}@${profile.host}` : profile.host;
    const result = await runScpTransfer(profile, [`${userHost}:${remotePath}`, localPath], timeout_ms);
    const failed = /permission denied|no such file|connection refused|lost connection/i.test(result.output);
    const fileExists = !failed && fs.existsSync(localPath);
    return send(res, failed ? 500 : 200, { ok: fileExists, output: result.output });
  }

  // ── POST /profiles ────────────────────────────────────────────────────
  // Add a new device profile. Returns 201 + the created profile on success.
  if (req.method === 'POST' && url === '/profiles') {
    const body = await readBody(req);
    const { name, protocol = 'ssh', host, port, username, authType, password, pemFile, tags, aiEnabled = false } = body;

    // Validate required fields
    if (!name || !String(name).trim()) return send(res, 400, { error: 'name is required' });
    const PROTOCOLS = ['ssh', 'serial', 'local', 'telnet', 'ftp'];
    if (!PROTOCOLS.includes(protocol)) return send(res, 400, { error: `protocol must be one of: ${PROTOCOLS.join(', ')}` });
    if (protocol !== 'local' && protocol !== 'serial' && !host) return send(res, 400, { error: `host is required for protocol "${protocol}"` });

    const all = _loadProfiles();
    const trimmedName = String(name).trim();
    if (all.find(p => p.name === trimmedName)) return send(res, 409, { error: `Profile '${trimmedName}' already exists` });

    const newProfile = {
      id:        crypto.randomBytes(8).toString('hex'),
      name:      trimmedName,
      protocol,
      host:      host || '',
      port:      port != null ? Number(port) : (protocol === 'ssh' ? 22 : null),
      username:  username || '',
      authType:  authType || 'password',
      password:  password || null,
      pemFile:   pemFile  || null,
      tags:      Array.isArray(tags) ? tags : (tags ? [tags] : []),
      aiEnabled: Boolean(aiEnabled),
    };

    all.push(newProfile);
    _saveProfiles(all);
    if (_broadcastProfilesChanged) _broadcastProfilesChanged();
    return send(res, 201, { ok: true, profile: newProfile });
  }

  // ── DELETE /profiles/:name ────────────────────────────────────────────
  // Remove a profile by name. If active sessions use it and force!=true, returns 409.
  const delProfileParams = matchRoute('DELETE', '/profiles/:name', url, req.method);
  if (delProfileParams) {
    const targetName = delProfileParams.name;
    const body = await readBody(req).catch(() => ({}));
    const force = body.force === true || body.force === 'true';

    const all = _loadProfiles();
    const idx = all.findIndex(p => p.name === targetName);
    if (idx === -1) return send(res, 404, { error: `Profile '${targetName}' not found` });

    // Guard: check for active sessions using this profile
    const activeSessions = [];
    if (_terminals) {
      for (const [id, t] of _terminals.entries()) {
        if (t._profileName === targetName) activeSessions.push(id);
      }
    }
    if (activeSessions.length > 0 && !force) {
      return send(res, 409, {
        error: `Profile '${targetName}' has ${activeSessions.length} active session(s). Pass force:true to remove anyway.`,
        activeSessions,
      });
    }

    // Kill active sessions if forced
    if (force && activeSessions.length > 0 && _killSession) {
      activeSessions.forEach(id => _killSession(id));
    }

    const removed = all.splice(idx, 1)[0];
    _saveProfiles(all);
    if (_broadcastProfilesChanged) _broadcastProfilesChanged();
    return send(res, 200, { ok: true, removed: { name: removed.name, id: removed.id } });
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
 * @param {Function} opts.getVersion              - () => string
 * @param {Function} opts.saveProfiles            - (profiles) => void
 * @param {Function} opts.broadcastProfilesChanged - () => void — push IPC event to renderer windows
 * @param {number}   opts.port                    - TCP port (default 29419)
 */
function start(opts) {
  if (_server) return; // already running

  _terminals                = opts.terminals;
  _serialConns              = opts.serialConns;
  _loadProfiles             = opts.loadProfiles;
  _saveProfiles             = opts.saveProfiles;
  _broadcastProfilesChanged = opts.broadcastProfilesChanged || null;
  _connectProfile           = opts.connectProfile;
  _spawnPty                 = opts.spawnPty;
  _writeInput               = opts.writeInput;
  _killSession              = opts.killSession;
  _listSerialPorts          = opts.listSerialPorts;
  _serialConnect            = opts.serialConnect;
  _serialWrite              = opts.serialWrite;
  _serialClose              = opts.serialClose;
  _getVersion               = opts.getVersion;
  _port            = opts.port != null ? opts.port : 29419;
  if (opts.log)    _log    = opts.log;
  if (opts.logErr) _logErr = opts.logErr;
  _token           = getOrCreateToken();

  _server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      send(res, 500, { error: err.message });
    });
  });

  _server.listen(_port, '127.0.0.1', () => {
    _port = _server.address().port; // update to actual bound port (needed when port is 0)
    _log(`listening on 127.0.0.1:${_port}`);
  });

  _server.on('error', (err) => {
    _logErr(`server error: ${err.message}`);
  });
}

function stop() {
  if (!_server) return;
  _server.close();
  _server = null;
  outputBuffers.clear();
  _log('stopped');
}

function isRunning() {
  return _server !== null && _server.listening;
}

function getPort() { return _port; }
function getToken() { return _token; }

module.exports = { start, stop, isRunning, getPort, getToken, appendOutput, ensureBuf };
