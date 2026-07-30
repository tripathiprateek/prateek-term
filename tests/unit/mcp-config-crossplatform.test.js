/**
 * Regression: the "Copy Config JSON" MCP snippet must be cross-platform.
 *
 * It previously hardcoded a macOS-only path
 * (/Applications/Prateek-Term.app/Contents/Resources/app/src/mcp/server.js),
 * which produced a broken config on Linux and Windows. The snippet now asks the
 * main process to resolve the command + server path for the current OS.
 */

const fs   = require('fs');
const path = require('path');

const APP_SRC     = path.join(__dirname, '../../src/renderer/js/app.js');
const MAIN_SRC    = path.join(__dirname, '../../src/main/main.js');
const PRELOAD_SRC = path.join(__dirname, '../../src/main/preload.js');

describe('MCP config snippet — cross-platform', () => {
  const app     = fs.readFileSync(APP_SRC, 'utf8');
  const main    = fs.readFileSync(MAIN_SRC, 'utf8');
  const preload = fs.readFileSync(PRELOAD_SRC, 'utf8');

  test('renderer no longer hardcodes a macOS /Applications path anywhere', () => {
    expect(app).not.toMatch(/\/Applications\//);
  });

  test('copyMcpConfig resolves the config from the main process', () => {
    const block = app.match(/function copyMcpConfig\(\)[\s\S]{0,600}/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain('mcpGetConfig');
  });

  test('preload exposes mcpGetConfig bound to mcp:get-config', () => {
    expect(preload).toMatch(/mcpGetConfig:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('mcp:get-config'\)/);
  });

  test('main registers a side-effect-free mcp:get-config handler', () => {
    expect(main).toContain("ipcMain.handle('mcp:get-config'");
  });

  test('server path + node resolution branch per OS (isWindows)', () => {
    const serverFn = main.match(/function mcpServerPath\(\)[\s\S]{0,300}/);
    expect(serverFn).not.toBeNull();
    expect(serverFn[0]).toContain('app.isPackaged');
    expect(serverFn[0]).toContain('.prateek-term');

    const nodeFn = main.match(/function mcpNodePath\(\)[\s\S]{0,300}/);
    expect(nodeFn).not.toBeNull();
    expect(nodeFn[0]).toContain('isWindows');
  });
});
