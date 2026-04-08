/**
 * Unit tests for src/mcp/server.js
 *
 * The MCP server communicates over stdio with Claude Desktop/Code using the
 * @modelcontextprotocol/sdk. We can't easily test the full stdio transport
 * in unit tests, so we focus on:
 *   - The bridge HTTP client (bridgeRequest) error handling
 *   - Tool list completeness (all 11 expected tools are declared)
 *   - Source-contract: server.js references the correct bridge port env var
 *   - Source-contract: server.js reads the token from the expected path
 */

const fs   = require('fs');
const path = require('path');

const SERVER_SRC = path.join(__dirname, '../../src/mcp/server.js');

describe('mcp/server.js — source contracts', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(SERVER_SRC, 'utf8');
  });

  test('references PRATEEK_TERM_PORT env var for port', () => {
    expect(source).toContain('PRATEEK_TERM_PORT');
  });

  test('reads auth token from ~/.prateek-term.mcp-token', () => {
    expect(source).toContain('.prateek-term.mcp-token');
  });

  test('uses stdio transport (StdioServerTransport)', () => {
    expect(source).toContain('StdioServerTransport');
  });

  test('uses @modelcontextprotocol/sdk Server', () => {
    expect(source).toContain("@modelcontextprotocol/sdk/server");
  });

  test('handles ECONNREFUSED with a helpful message', () => {
    expect(source).toContain('ECONNREFUSED');
    expect(source).toContain('Make sure Prateek-Term is running');
  });

  test('declares all 11 required MCP tools', () => {
    const expectedTools = [
      'list_profiles',
      'list_sessions',
      'connect',
      'run_command',
      'send_input',
      'read_output',
      'disconnect',
      'get_status',
      'upload_file',
      'download_file',
      'list_serial_ports',
    ];
    for (const tool of expectedTools) {
      expect(source).toContain(`name: '${tool}'`);
    }
    // Verify the count matches — no extra/missing tools
    const toolMatches = source.match(/name: '[a-z_]+'/g);
    expect(toolMatches).toHaveLength(expectedTools.length);
  });

  test('session_id is validated with numeric regex to prevent path traversal', () => {
    expect(source).toContain('/^\\d+$/.test');
  });

  test('timeout_ms is clamped with Math.max and Math.min in run_command handler', () => {
    const runBlock = source.slice(
      source.indexOf("case 'run_command'"),
      source.indexOf("case 'send_input'")
    );
    expect(runBlock).toContain('Math.max');
    expect(runBlock).toContain('Math.min');
  });

  test('timeout_ms is clamped with Math.max and Math.min in upload_file handler', () => {
    const uploadBlock = source.slice(
      source.indexOf("case 'upload_file'"),
      source.indexOf("case 'download_file'")
    );
    expect(uploadBlock).toContain('Math.max');
    expect(uploadBlock).toContain('Math.min');
  });

  test('timeout_ms is clamped with Math.max and Math.min in download_file handler', () => {
    const downloadBlock = source.slice(
      source.indexOf("case 'download_file'"),
      source.indexOf("case 'list_serial_ports'")
    );
    expect(downloadBlock).toContain('Math.max');
    expect(downloadBlock).toContain('Math.min');
  });

  test('tools/list handler is registered via ListToolsRequestSchema', () => {
    expect(source).toContain('ListToolsRequestSchema');
  });

  test('tools/call handler is registered via CallToolRequestSchema', () => {
    expect(source).toContain('CallToolRequestSchema');
  });

  test('strips credentials from list_profiles — does not log passwords', () => {
    // The server only calls GET /profiles which strips passwords server-side
    // Verify the tool handler for list_profiles does not handle 'password' field
    const listProfilesBlock = source.slice(
      source.indexOf("case 'list_profiles'"),
      source.indexOf("case 'list_sessions'")
    );
    expect(listProfilesBlock).not.toContain('password');
  });

  test('run_command uses POST /sessions/:id/run endpoint', () => {
    expect(source).toContain('/sessions/${session_id}/run');
  });

  test('error handler sets isError: true', () => {
    expect(source).toContain('isError: true');
  });

  test('logs to stderr, not stdout (stdout reserved for JSON-RPC)', () => {
    // All process.write calls should go to stderr
    expect(source).toContain('process.stderr.write');
    // Should not write debug/log to stdout
    expect(source).not.toContain('process.stdout.write');
  });

  test('default port is 29419', () => {
    expect(source).toContain("'29419'");
  });
});

describe('mcp/server.js — tool schema validation', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(SERVER_SRC, 'utf8');
  });

  test('run_command requires session_id and command', () => {
    // Find the run_command tool definition
    const startIdx = source.indexOf("name: 'run_command'");
    const endIdx   = source.indexOf("name: 'send_input'");
    const toolDef  = source.slice(startIdx, endIdx);
    expect(toolDef).toContain("'session_id'");
    expect(toolDef).toContain("'command'");
    expect(toolDef).toContain("required:");
  });

  test('connect accepts profileName as optional param', () => {
    const startIdx = source.indexOf("name: 'connect'");
    const endIdx   = source.indexOf("name: 'run_command'");
    const toolDef  = source.slice(startIdx, endIdx);
    expect(toolDef).toContain('profileName');
  });

  test('disconnect requires session_id', () => {
    const startIdx = source.indexOf("name: 'disconnect'");
    const endIdx   = source.indexOf("name: 'get_status'");
    const toolDef  = source.slice(startIdx, endIdx);
    expect(toolDef).toContain("'session_id'");
    expect(toolDef).toContain("required:");
  });

  test('get_status requires session_id', () => {
    const startIdx = source.indexOf("name: 'get_status'");
    const endIdx   = source.indexOf("name: 'upload_file'");
    const toolDef  = source.slice(startIdx, endIdx);
    expect(toolDef).toContain("'session_id'");
    expect(toolDef).toContain("required:");
  });

  test('upload_file requires profileName, localPath, remotePath', () => {
    const startIdx = source.indexOf("name: 'upload_file'");
    const endIdx   = source.indexOf("name: 'download_file'");
    const toolDef  = source.slice(startIdx, endIdx);
    expect(toolDef).toContain('profileName');
    expect(toolDef).toContain('localPath');
    expect(toolDef).toContain('remotePath');
    expect(toolDef).toContain("required:");
  });

  test('download_file requires profileName, remotePath, localPath', () => {
    const startIdx = source.indexOf("name: 'download_file'");
    const endIdx   = source.indexOf("name: 'list_serial_ports'");
    const toolDef  = source.slice(startIdx, endIdx);
    expect(toolDef).toContain('profileName');
    expect(toolDef).toContain('remotePath');
    expect(toolDef).toContain('localPath');
    expect(toolDef).toContain("required:");
  });

  test('run_command handler returns waiting_for_input status', () => {
    const runBlock = source.slice(
      source.indexOf("case 'run_command'"),
      source.indexOf("case 'send_input'")
    );
    expect(runBlock).toContain('waiting_for_input');
    expect(runBlock).toContain('send_input');
  });

  test('get_status handler reads session state from bridge', () => {
    const statusBlock = source.slice(
      source.indexOf("case 'get_status'"),
      source.indexOf("case 'upload_file'")
    );
    expect(statusBlock).toContain('/sessions/${session_id}/status');
    expect(statusBlock).toContain('state');
  });

  test('upload_file handler calls POST /upload on bridge', () => {
    const uploadBlock = source.slice(
      source.indexOf("case 'upload_file'"),
      source.indexOf("case 'download_file'")
    );
    expect(uploadBlock).toContain("'/upload'");
    expect(uploadBlock).toContain('profileName');
    expect(uploadBlock).toContain('localPath');
    expect(uploadBlock).toContain('remotePath');
  });

  test('download_file handler calls POST /download on bridge', () => {
    const downloadBlock = source.slice(
      source.indexOf("case 'download_file'"),
      source.indexOf("case 'list_serial_ports'")
    );
    expect(downloadBlock).toContain("'/download'");
    expect(downloadBlock).toContain('profileName');
    expect(downloadBlock).toContain('remotePath');
    expect(downloadBlock).toContain('localPath');
  });

  test('connect handler surfaces remote hostname', () => {
    const connectBlock = source.slice(
      source.indexOf("case 'connect'"),
      source.indexOf("case 'run_command'")
    );
    expect(connectBlock).toContain('remoteHostname');
    expect(connectBlock).toContain('Connected to');
  });
});
