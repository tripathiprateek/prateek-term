/**
 * Unit tests for src/mcp/server.js
 *
 * The MCP server communicates over stdio with Claude Desktop/Code using the
 * @modelcontextprotocol/sdk. We can't easily test the full stdio transport
 * in unit tests, so we focus on:
 *   - The bridge HTTP client (bridgeRequest) error handling
 *   - Tool list completeness (all 8 expected tools are declared)
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
    expect(source).toContain("require('@modelcontextprotocol/sdk/server/index.js')");
  });

  test('handles ECONNREFUSED with a helpful message', () => {
    expect(source).toContain('ECONNREFUSED');
    expect(source).toContain('Make sure Prateek-Term is running');
  });

  test('declares all 8 required MCP tools', () => {
    const expectedTools = [
      'list_profiles',
      'list_sessions',
      'connect',
      'run_command',
      'send_input',
      'read_output',
      'disconnect',
      'list_serial_ports',
    ];
    for (const tool of expectedTools) {
      expect(source).toContain(`name: '${tool}'`);
    }
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
    const endIdx   = source.indexOf("name: 'list_serial_ports'");
    const toolDef  = source.slice(startIdx, endIdx);
    expect(toolDef).toContain("'session_id'");
    expect(toolDef).toContain("required:");
  });
});
