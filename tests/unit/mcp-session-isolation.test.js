'use strict';
/**
 * tests/unit/mcp-session-isolation.test.js
 *
 * The MCP bridge must NOT hijack UI-spawned terminal sessions. A user's live
 * SSH tab is NOT the MCP's tab — sharing them causes the AI to write
 * sentinel markers (MTERM_DONE_<hash>) and inject commands into the user's
 * terminal mid-session.
 *
 * This suite pins the isolation contract:
 *   • main.js must NOT call bridge.ensureBuf on UI-spawned PTYs
 *   • main.js must NOT call bridge.appendOutput on UI-spawned PTYs
 *   • bridge.appendOutput, when called on an un-registered session, is a no-op
 *   • MCP spawns its own sessions via spawnPtyForBridge (separate entry point)
 */

const fs   = require('fs');
const path = require('path');

const MAIN_JS   = path.resolve(__dirname, '../../src/main/main.js');
const BRIDGE_JS = path.resolve(__dirname, '../../src/main/http-bridge.js');

let mainSource, bridgeSource;
beforeAll(() => {
  mainSource   = fs.readFileSync(MAIN_JS, 'utf8');
  bridgeSource = fs.readFileSync(BRIDGE_JS, 'utf8');
});

describe('UI-spawned PTYs are NOT exposed to MCP', () => {
  test('terminals.set(id, term) block does not call bridge.ensureBuf', () => {
    // Find the UI spawn block (after `terminals.set(id, term)`) and make sure
    // it does not eagerly register the session with the MCP bridge.
    const uiBlockMatch = mainSource.match(/terminals\.set\(id,\s*term\);[\s\S]{0,800}?term\.onData/);
    expect(uiBlockMatch).toBeTruthy();
    expect(uiBlockMatch[0]).not.toMatch(/bridge\.ensureBuf\(id\)/);
  });

  test('UI onData handler does not forward to bridge.appendOutput', () => {
    // Extract the FIRST term.onData block (the UI-spawn one, near terminals.set).
    // Use non-greedy up to the closing `});` of that specific onData block.
    const uiBlockMatch = mainSource.match(
      /terminals\.set\(id,\s*term\);[\s\S]*?term\.onData\(\(data\)\s*=>\s*\{[\s\S]*?\n\s{2}\}\);/
    );
    expect(uiBlockMatch).toBeTruthy();
    // Match actual call (open paren), not the word in a comment.
    expect(uiBlockMatch[0]).not.toMatch(/bridge\.appendOutput\(/);
  });

  test('main.js documents why UI PTYs are not bridged (preserves reason on grep)', () => {
    // Comment should explain the ownership model for future maintainers.
    expect(mainSource).toMatch(/NOT auto-registered with the MCP bridge/);
  });
});

describe('MCP-spawned PTYs DO register with the bridge (spawnPtyForBridge)', () => {
  test('spawnPtyForBridge calls bridge.ensureBuf and appendOutput', () => {
    const fnMatch = mainSource.match(/function spawnPtyForBridge[\s\S]{0,2000}/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch[0]).toMatch(/bridge\.ensureBuf\(id\)/);
    expect(fnMatch[0]).toMatch(/bridge\.appendOutput\(id,/);
  });
});

describe('bridge.appendOutput is no-op for unregistered sessions (defense in depth)', () => {
  test('appendOutput early-returns when outputBuffers does not have the key', () => {
    // Belt + suspenders: even if something calls appendOutput for a UI id,
    // the bridge drops it silently. This keeps the isolation even if a future
    // commit accidentally re-adds the call in main.js.
    expect(bridgeSource).toMatch(/if \(!outputBuffers\.has\(key\)\) return;/);
  });
});
