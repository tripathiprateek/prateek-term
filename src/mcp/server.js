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

const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport }  = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const PORT       = parseInt(process.env.PRATEEK_TERM_PORT || '29419', 10);
const TOKEN_PATH = path.join(os.homedir(), '.prateek-term.mcp-token');

// ── Bridge HTTP client ───────────────────────────────────────────────────────

function readToken() {
  try {
    return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  } catch {
    throw new Error(
      'Prateek-Term auth token not found. ' +
      'Make sure Prateek-Term is running and MCP is enabled in Settings.'
    );
  }
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
      name: 'list_serial_ports',
      description: 'List available serial ports on the machine.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],
}));

// ── Tool call handler ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

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
        return textResult(`Session opened. ID: ${result.id}\nUse run_command with session_id="${result.id}" to execute commands.`);
      }

      case 'run_command': {
        const { session_id, command, timeout_ms } = args;
        const body = { command };
        if (timeout_ms) body.timeout_ms = timeout_ms;
        const result = await bridgeRequest('POST', `/sessions/${session_id}/run`, body);
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
