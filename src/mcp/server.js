#!/usr/bin/env node
/**
 * Prateek-Term — MCP Server
 *
 * Stdio MCP server launched by AI clients (Claude Desktop, Claude Code, etc.)
 * Communicates with the running Prateek-Term Electron app via the HTTP bridge
 * on localhost:29419.
 *
 * Setup: After enabling MCP in Prateek-Term Settings, copy the config snippet
 * shown there into your AI client config.
 *
 * Claude Desktop:  ~/.claude/claude_desktop_config.json
 * Claude Code:     .mcp.json (project) or ~/.claude/mcp.json (global)
 */

// Use direct CJS paths — the SDK exports map doesn't reliably resolve with
// require() across all Node versions (esp. when running outside the asar).
const sdkBase = require.resolve('@modelcontextprotocol/sdk/server').replace(/server[/\\]index\.js$/, '');
const { Server }                = require(sdkBase + 'server/index.js');
const { StdioServerTransport }  = require(sdkBase + 'server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require(sdkBase + 'types.js');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const PORT             = parseInt(process.env.PRATEEK_TERM_PORT || '29419', 10);
const TOKEN_PATH       = path.join(os.homedir(), 'Library', 'Application Support', 'prateek-term', 'mcp-token');
const TOKEN_PATH_LEGACY = path.join(os.homedir(), '.prateek-term.mcp-token');

// ── Bridge HTTP client ───────────────────────────────────────────────────────

function readToken() {
  // Try new path first, fall back to legacy for older installs
  const p = fs.existsSync(TOKEN_PATH) ? TOKEN_PATH
          : fs.existsSync(TOKEN_PATH_LEGACY) ? TOKEN_PATH_LEGACY
          : null;
  if (!p) {
    throw new Error(
      'Prateek-Term auth token not found. ' +
      'Make sure Prateek-Term is running and MCP is enabled in Settings.'
    );
  }
  return fs.readFileSync(p, 'utf8').trim();
}

function bridgeRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    let token;
    try { token = readToken(); } catch (e) { return reject(e); }

    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Invalid JSON from bridge: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error(
          `Cannot connect to Prateek-Term on port ${PORT}. ` +
          'Make sure Prateek-Term is running and MCP is enabled in Settings.'
        ));
      } else {
        reject(e);
      }
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ── Tool helpers ─────────────────────────────────────────────────────────────

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function jsonResult(obj) {
  return textResult(JSON.stringify(obj, null, 2));
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'prateek-term', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_profiles',
      description: 'List SSH and serial connection profiles saved in Prateek-Term that are tagged as AI-accessible (tagged "ai").',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_sessions',
      description: 'List active terminal sessions currently open in Prateek-Term.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'connect',
      description: 'Open a new terminal session. Use profileName to connect via a saved profile, or specify protocol="local" for a local shell.',
      inputSchema: {
        type: 'object',
        properties: {
          profileName: { type: 'string', description: 'Name of a saved AI-accessible profile (from list_profiles).' },
          protocol:    { type: 'string', enum: ['local', 'ssh', 'serial'], description: 'Protocol for inline connections (default: local).' },
          host:        { type: 'string', description: 'Hostname for inline SSH (no credentials accepted — use a saved profile instead).' },
          port:        { type: 'number', description: 'Serial port path (e.g. /dev/tty.usbserial-0001) or SSH port.' },
          baudRate:    { type: 'number', description: 'Baud rate for serial connections (default: 115200).' },
        },
        required: [],
      },
    },
    {
      name: 'run_command',
      description: 'Run a shell command in an active session and return its output and exit code. The session must be at a shell prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID from connect or list_sessions.' },
          command:    { type: 'string', description: 'Shell command to run (e.g. "uname -a" or "cat /etc/os-release").' },
          timeout_ms: { type: 'number', description: 'Max wait time in ms (default: 30000, max: 120000).' },
        },
        required: ['session_id', 'command'],
      },
    },
    {
      name: 'send_input',
      description: 'Send raw input to a session (useful for interactive prompts, Ctrl+C, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID.' },
          data:       { type: 'string', description: 'Text to send. Use \\r for Enter, \\x03 for Ctrl+C.' },
        },
        required: ['session_id', 'data'],
      },
    },
    {
      name: 'read_output',
      description: 'Read and clear buffered output from a session since the last read (or since connect). Useful for monitoring interactive sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID.' },
        },
        required: ['session_id'],
      },
    },
    {
      name: 'disconnect',
      description: 'Close a terminal session.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID to close.' },
        },
        required: ['session_id'],
      },
    },
    {
      name: 'get_status',
      description: 'Get the current state of a session: idle (at shell prompt), running_command, waiting_for_input (password/confirmation prompt), busy, or disconnected.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID.' },
        },
        required: ['session_id'],
      },
    },
    {
      name: 'upload_file',
      description: 'Upload a local file to a remote device via SCP. Uses the saved profile credentials (password or key). The file is transferred from the Mac to the remote host.',
      inputSchema: {
        type: 'object',
        properties: {
          profileName: { type: 'string', description: 'Name of a saved AI-accessible SSH profile.' },
          localPath:   { type: 'string', description: 'Absolute path to the local file on the Mac.' },
          remotePath:  { type: 'string', description: 'Destination path on the remote device (e.g. /tmp/file.ipk).' },
          timeout_ms:  { type: 'number', description: 'Max wait time in ms (default: 120000, max: 300000).' },
        },
        required: ['profileName', 'localPath', 'remotePath'],
      },
    },
    {
      name: 'download_file',
      description: 'Download a file from a remote device to the local Mac via SCP. Uses the saved profile credentials.',
      inputSchema: {
        type: 'object',
        properties: {
          profileName: { type: 'string', description: 'Name of a saved AI-accessible SSH profile.' },
          remotePath:  { type: 'string', description: 'Path to the file on the remote device.' },
          localPath:   { type: 'string', description: 'Destination path on the local Mac.' },
          timeout_ms:  { type: 'number', description: 'Max wait time in ms (default: 120000, max: 300000).' },
        },
        required: ['profileName', 'remotePath', 'localPath'],
      },
    },
    {
      name: 'list_serial_ports',
      description: 'List available serial ports on the machine.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],
}));

// ── Tool call handler ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  // Validate session_id for tools that use it — prevent path traversal in URL construction
  const SESSION_TOOLS = ['run_command', 'send_input', 'read_output', 'disconnect', 'get_status'];
  if (SESSION_TOOLS.includes(name) && args.session_id) {
    if (!/^\d+$/.test(String(args.session_id))) {
      return { content: [{ type: 'text', text: 'Error: session_id must be a numeric string' }], isError: true };
    }
  }

  try {
    switch (name) {

      case 'list_profiles': {
        const profiles = await bridgeRequest('GET', '/profiles');
        if (profiles.length === 0) {
          return textResult('No AI-accessible profiles found. Tag a profile with "ai" in Prateek-Term to make it accessible.');
        }
        const summary = profiles.map(p =>
          `• ${p.name} [${p.protocol}] ${p.host ? `→ ${p.username ? p.username + '@' : ''}${p.host}${p.port && p.port !== 22 ? ':' + p.port : ''}` : ''}`
        ).join('\n');
        return textResult(`AI-accessible profiles:\n${summary}`);
      }

      case 'list_sessions': {
        const sessions = await bridgeRequest('GET', '/sessions');
        if (sessions.length === 0) return textResult('No active MCP sessions.');
        return jsonResult(sessions);
      }

      case 'connect': {
        const body = {};
        if (args.profileName) body.profileName = args.profileName;
        if (args.protocol)    body.protocol    = args.protocol;
        if (args.host)        body.host        = args.host;
        if (args.port)        body.port        = args.port;
        if (args.baudRate)    body.baudRate    = args.baudRate;
        const result = await bridgeRequest('POST', '/sessions', body);
        let msg = `Session opened. ID: ${result.id}`;
        if (result.remoteHostname) msg += `\nConnected to: ${result.remoteHostname} (${result.host})`;
        else if (result.host) msg += `\nTarget: ${result.host}`;
        if (result.warning) msg += `\nWarning: ${result.warning}`;
        msg += `\nUse run_command with session_id="${result.id}" to execute commands.`;
        return textResult(msg);
      }

      case 'run_command': {
        const { session_id, command, timeout_ms } = args;
        const body = { command };
        if (timeout_ms) body.timeout_ms = Math.max(1000, Math.min(Number(timeout_ms) || 30000, 120000));
        const result = await bridgeRequest('POST', `/sessions/${session_id}/run`, body);
        if (result.status === 'waiting_for_input') {
          return textResult(`Status: waiting_for_input\nPrompt: ${result.prompt}\n\nThe command is blocked waiting for input. Use send_input to provide a response.\n\nOutput so far:\n${result.output || '(no output)'}`);
        }
        const out = result.output || '(no output)';
        return textResult(`Exit code: ${result.exitCode}\n\nOutput:\n${out}`);
      }

      case 'send_input': {
        const { session_id, data } = args;
        await bridgeRequest('POST', `/sessions/${session_id}/input`, { data });
        return textResult('Input sent.');
      }

      case 'read_output': {
        const { session_id } = args;
        const result = await bridgeRequest('GET', `/sessions/${session_id}/output`);
        return textResult(result.output || '(no buffered output)');
      }

      case 'disconnect': {
        const { session_id } = args;
        await bridgeRequest('DELETE', `/sessions/${session_id}`);
        return textResult(`Session ${session_id} closed.`);
      }

      case 'get_status': {
        const { session_id } = args;
        const result = await bridgeRequest('GET', `/sessions/${session_id}/status`);
        let msg = `Session ${session_id}: ${result.state}`;
        if (result.prompt) msg += `\nPrompt: ${result.prompt}`;
        if (result.pendingCommands > 0) msg += `\nPending commands: ${result.pendingCommands}`;
        if (!result.alive) msg += '\n(Session process has exited)';
        return textResult(msg);
      }

      case 'upload_file': {
        const { profileName, localPath, remotePath, timeout_ms } = args;
        const clampedTimeout = timeout_ms ? Math.max(5000, Math.min(Number(timeout_ms) || 120000, 300000)) : undefined;
        const result = await bridgeRequest('POST', '/upload', { profileName, localPath, remotePath, timeout_ms: clampedTimeout });
        if (result.ok) {
          return textResult(`File uploaded successfully.\n${localPath} → ${profileName}:${remotePath}\n\nOutput:\n${result.output || '(no output)'}`);
        }
        return textResult(`Upload failed.\n\nOutput:\n${result.output || '(no output)'}`);
      }

      case 'download_file': {
        const { profileName, remotePath, localPath, timeout_ms } = args;
        const clampedTimeout = timeout_ms ? Math.max(5000, Math.min(Number(timeout_ms) || 120000, 300000)) : undefined;
        const result = await bridgeRequest('POST', '/download', { profileName, remotePath, localPath, timeout_ms: clampedTimeout });
        if (result.ok) {
          return textResult(`File downloaded successfully.\n${profileName}:${remotePath} → ${localPath}\n\nOutput:\n${result.output || '(no output)'}`);
        }
        return textResult(`Download failed.\n\nOutput:\n${result.output || '(no output)'}`);
      }

      case 'list_serial_ports': {
        const ports = await bridgeRequest('GET', '/serial-ports');
        if (ports.length === 0) return textResult('No serial ports found.');
        const summary = ports.map(p => `• ${p.path}${p.manufacturer ? ` (${p.manufacturer})` : ''}`).join('\n');
        return textResult(`Available serial ports:\n${summary}`);
      }

      default:
        return textResult(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr (stdout is reserved for MCP JSON-RPC)
  process.stderr.write('[prateek-term MCP] ready\n');
}

main().catch((err) => {
  process.stderr.write(`[prateek-term MCP] fatal: ${err.message}\n`);
  process.exit(1);
});
