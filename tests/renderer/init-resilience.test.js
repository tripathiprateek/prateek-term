'use strict';
/**
 * tests/renderer/init-resilience.test.js
 *
 * Source-contract tests for init() crash resilience and the renderer error
 * bridge.
 *
 * New feature: init() and setupEventListeners() now have outer try-catch
 * blocks that forward any crash to the main-process debug log via
 * window.terminalAPI.logRendererError. This means that silent crashes
 * (which previously prevented rendererReady() from being called) are now
 * surfaced in Settings → Developer → Debug Log.
 *
 * The inner version-title fetch is wrapped in its own try-catch so a
 * network/IPC error in that non-critical path does not abort the entire
 * init() function.
 */

const fs   = require('fs');
const path = require('path');

const APP_JS = path.resolve(__dirname, '../../src/renderer/js/app.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(APP_JS, 'utf8');
});

// ---------------------------------------------------------------------------
// init() — outer try-catch
// ---------------------------------------------------------------------------

describe('init() — outer try-catch', () => {
  test('init() has an outer try-catch block', () => {
    // async function init() { try { ... } catch (err) { ... }
    const initBlock = source.match(/async function init\s*\(\)\s*\{[\s\S]{0,2000}/);
    expect(initBlock).not.toBeNull();
    expect(initBlock[0]).toMatch(/catch\s*\(err\)/);
  });

  test('logRendererError is called in the init() catch block', () => {
    // catch block must forward the error to main process
    const catchBlock = source.match(/catch\s*\(err\)\s*\{[\s\S]{0,300}logRendererError/);
    expect(catchBlock).not.toBeNull();
    expect(catchBlock[0]).toContain('logRendererError');
  });
});

// ---------------------------------------------------------------------------
// setupEventListeners — crash forwarding
// ---------------------------------------------------------------------------

describe('setupEventListeners — crash is caught and forwarded', () => {
  test('setupEventListeners call in init() is wrapped in its own try-catch', () => {
    // The inner try around setupEventListeners():
    //   try { setupEventListeners(); } catch (e) { logRendererError(...); throw e; }
    const setupTryCatch = source.match(
      /try\s*\{\s*setupEventListeners\(\)[\s\S]{0,200}catch\s*\(e\)/
    );
    expect(setupTryCatch).not.toBeNull();
  });

  test('setupEventListeners crash is forwarded to logRendererError before re-throw', () => {
    const setupBlock = source.match(
      /setupEventListeners\(\)[\s\S]{0,300}logRendererError[\s\S]{0,100}throw/
    );
    expect(setupBlock).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Version-title fetch — non-critical inner try-catch
// ---------------------------------------------------------------------------

describe('version-title fetch — non-critical try-catch', () => {
  test('getVersionInfo call is wrapped in its own try-catch', () => {
    // The version fetch must be in a try { ... } catch { /* non-critical */ } block.
    // The renderer calls window.terminalAPI.getVersionInfo().
    const versionBlock = source.match(/terminalAPI\.getVersionInfo\(\)[\s\S]{0,300}catch/);
    expect(versionBlock).not.toBeNull();
  });

  test('version-title catch block is a no-op (non-critical path)', () => {
    // The catch must be empty or contain only a comment — not rethrow or logRendererError
    // Pattern: catch { /* non-critical */ }
    expect(source).toMatch(/catch\s*\{[^}]*non-critical[^}]*\}/);
  });
});
