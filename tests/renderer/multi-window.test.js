'use strict';
/**
 * tests/renderer/multi-window.test.js
 *
 * Regression tests for multi-window and tab tear-off behaviour.
 *
 * BUG-008: Tab drag out lost its connection — mouseup event was swallowed by
 *   xterm's canvas stopPropagation(), so the bubble-phase document listener
 *   never fired.  Fix: capture-phase listeners ({ capture: true }).
 *
 * BUG-009: Activating the app (clicking dock icon) opened a new window instead
 *   of focusing the existing one.  Fix: check getAllWindows().length > 0.
 *
 * BUG-010: Right-click dock menu had no "New Window" option.
 *   Fix: app.dock.setMenu() with a "New Window" item.
 *
 * BUG-011: double-clicking the app binary opened a new instance instead of
 *   bringing the existing window to front (LSMultipleInstancesProhibited was
 *   removed to allow tear-off windows but broke the activate handler).
 */

const fs   = require('fs');
const path = require('path');

const MAIN_JS = path.resolve(__dirname, '../../src/main/main.js');
const APP_JS  = path.resolve(__dirname, '../../src/renderer/js/app.js');
let mainSource, appSource;

beforeAll(() => {
  mainSource = fs.readFileSync(MAIN_JS, 'utf8');
  appSource  = fs.readFileSync(APP_JS,  'utf8');
});

// ---------------------------------------------------------------------------
// BUG-009 — activate: focus existing window, don't open a new one
// ---------------------------------------------------------------------------

describe('App activate behaviour (BUG-009)', () => {
  test('activate handler checks getAllWindows().length before creating a new window', () => {
    // Must branch on whether windows exist
    expect(mainSource).toMatch(/getAllWindows\(\)[\s\S]{0,100}length/);
  });

  test('activate handler calls show() and focus() on existing window', () => {
    const activateBlock = mainSource.match(/app\.on\('activate'[\s\S]{0,400}}\)/);
    expect(activateBlock).not.toBeNull();
    expect(activateBlock[0]).toContain('.show()');
    expect(activateBlock[0]).toContain('.focus()');
  });
});

// ---------------------------------------------------------------------------
// BUG-010 — Dock right-click menu has "New Window"
// ---------------------------------------------------------------------------

describe('Dock menu (BUG-010)', () => {
  test('calls app.dock.setMenu()', () => {
    expect(mainSource).toContain('app.dock.setMenu(');
  });

  test('dock menu contains a "New Window" item', () => {
    const dockBlock = mainSource.match(/dock\.setMenu[\s\S]{0,300}/);
    expect(dockBlock).not.toBeNull();
    expect(dockBlock[0]).toContain('New Window');
  });
});

// ---------------------------------------------------------------------------
// BUG-008 — Tab tear-off uses capture-phase listeners
// ---------------------------------------------------------------------------

describe('Tab tear-off drag (BUG-008)', () => {
  test('uses capture: true on document mousemove listener to bypass xterm stopPropagation', () => {
    // The fix stores { capture: true } as a variable (e.g. OPTS/CAPTURE) then passes it to
    // addEventListener. The variable definition and the call may be ~15 lines apart.
    // Accept either inline or variable-based pattern.
    const hasInline   = /addEventListener\('mousemove'[\s\S]{0,200}capture:\s*true/.test(appSource);
    const hasVariable = /capture:\s*true[\s\S]{0,4000}addEventListener\('mousemove'/.test(appSource);
    expect(hasInline || hasVariable).toBe(true);
  });

  test('uses capture: true on document mouseup listener', () => {
    const hasInline   = /addEventListener\('mouseup'[\s\S]{0,200}capture:\s*true/.test(appSource);
    const hasVariable = /capture:\s*true[\s\S]{0,4000}addEventListener\('mouseup'/.test(appSource);
    expect(hasInline || hasVariable).toBe(true);
  });

  test('removes capture listeners on mouseup to avoid leaks', () => {
    expect(appSource).toMatch(/removeEventListener\('mousemove'[\s\S]{0,50}OPTS/);
    expect(appSource).toMatch(/removeEventListener\('mouseup'[\s\S]{0,50}OPTS/);
  });

  test('calls openNewWindow with tear-off data (including ptyId) on tear-off', () => {
    // Tear-off now passes a tearOffData object with _tearOff flag and ptyId
    // so the new window can adopt the live PTY instead of reconnecting.
    expect(appSource).toContain('openNewWindow(tearOffData)');
    // Local tabs get a fallback profile so new window opens a terminal
    expect(appSource).toContain("tab.connectionProfile || { protocol: 'local'");
  });

  test('detaches (not closes) the source tab after tearing off', () => {
    // detachTab removes the tab UI without killing the PTY; new window adopts it
    const tearOffBlock = appSource.match(/openNewWindow[\s\S]{0,200}detachTab/);
    expect(tearOffBlock).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Auto-connect profile delivery to new windows
// ---------------------------------------------------------------------------

describe('pendingAutoConnect — profile delivery to new windows', () => {
  test('pendingAutoConnect map declared in main process', () => {
    expect(mainSource).toContain('pendingAutoConnect');
  });

  test('renderer:ready handler flushes pending profile to renderer', () => {
    // When the new window is ready it receives the auto-connect profile
    const readyBlock = mainSource.match(/renderer:ready[\s\S]{0,400}auto-connect/);
    expect(readyBlock).not.toBeNull();
  });

  test('renderer registers onAutoConnect handler in init()', () => {
    expect(appSource).toContain('onAutoConnect');
  });
});

// ---------------------------------------------------------------------------
// Multiple instances allowed on macOS; Windows/Linux use a single-instance
// lock so protocol/"open in" argv is forwarded to the running app.
// ---------------------------------------------------------------------------

describe('Multiple instances', () => {
  test('single-instance lock is guarded to non-macOS (mac keeps multi-window)', () => {
    // The lock must only be acquired when NOT on macOS, so macOS still allows
    // multiple independent windows/instances.
    expect(mainSource).toMatch(/!platform\.isMac\(\)[\s\S]{0,200}requestSingleInstanceLock/);
  });

  test('does NOT set LSMultipleInstancesProhibited in package.json', () => {
    const pkgJson = fs.readFileSync(
      path.resolve(__dirname, '../../package.json'), 'utf8'
    );
    expect(pkgJson).not.toContain('LSMultipleInstancesProhibited');
  });
});

// ---------------------------------------------------------------------------
// Security fixes
// ---------------------------------------------------------------------------

describe('Security hardening', () => {
  test('update:open-url validates https scheme and github.com host before openExternal', () => {
    // Must parse URL and check protocol + hostname before calling shell.openExternal
    const block = mainSource.match(/update:open-url[\s\S]{0,300}/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain('parsed.protocol');
    expect(block[0]).toContain('https:');
    expect(block[0]).toContain('github.com');
  });

  test('no duplicate escapeHTML function — only escapeHtml (lowercase h)', () => {
    expect(appSource).not.toContain('function escapeHTML(');
    expect(appSource).toContain('function escapeHtml(');
  });

  test('DEFAULT_MCP_PORT constant defined — no magic 29419 in app.js', () => {
    expect(appSource).toContain('const DEFAULT_MCP_PORT = 29419');
    // Raw magic number should not appear outside the constant definition
    const withoutDef = appSource.replace('const DEFAULT_MCP_PORT = 29419', '');
    expect(withoutDef).not.toContain('29419');
  });

  test('no console.log/warn/error in app.js production code', () => {
    expect(appSource).not.toMatch(/console\.(log|warn|error)\s*\(/);
  });

  test('no console.log/warn/error in main.js production code', () => {
    expect(mainSource).not.toMatch(/console\.(log|warn|error)\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// Tear-off / secondary windows must NOT restore the whole session
//   Bug: dragging a tab out opened a new window that restored EVERY tab from
//   the saved session, then adopted the torn-off tab on top.
// ---------------------------------------------------------------------------
describe('Secondary windows skip session restore', () => {
  test('createNewWindow tags secondary windows with ?secondary=1', () => {
    const fn = mainSource.match(/function createNewWindow\(opts = \{\}\)[\s\S]{0,1600}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("query: { secondary: '1' }");
    expect(fn[0]).toContain('opts.secondary');
  });

  test('the initial window is the ONLY non-secondary createNewWindow caller', () => {
    // createWindow() opens the main window and must NOT pass secondary.
    expect(mainSource).toMatch(/mainWindow = createNewWindow\(\);/);
    // Tear-off / New Window / dock / open-url windows all pass secondary:true.
    expect(mainSource).toContain('createNewWindow({ secondary: true })');
    // No bare createNewWindow() call other than the main window + definition.
    const bareCalls = (mainSource.match(/createNewWindow\(\)/g) || []).length;
    expect(bareCalls).toBe(1); // only `mainWindow = createNewWindow();`
  });

  test('renderer restores the session only in the main (non-secondary) window', () => {
    const initFn = appSource.match(/async function init\(\)[\s\S]{0,1400}/);
    expect(initFn).not.toBeNull();
    expect(initFn[0]).toMatch(/secondary[\s\S]{0,120}restoreSession\(\)/);
    // restoreSession must be guarded, not called unconditionally.
    expect(initFn[0]).not.toMatch(/\n\s*await restoreSession\(\);/);
  });
});

// ---------------------------------------------------------------------------
// OSC-7 cwd injection must not corrupt/hang on concurrent user input
// ---------------------------------------------------------------------------
describe('OSC cwd injection input-gating', () => {
  test('user input is held while the injection window is open', () => {
    expect(appSource).toMatch(/_oscInjecting[\s\S]{0,120}_oscHeldInput/);
    // term.onData buffers instead of sending while injecting.
    expect(appSource).toMatch(/if \(tab\._oscInjecting\)\s*\{\s*tab\._oscHeldInput/);
  });

  test('a safety timer guarantees held input is flushed (never a real hang)', () => {
    expect(appSource).toContain('_oscSafetyTimer');
    const fire = appSource.match(/function fireOscInjection\(tab\)[\s\S]{0,1600}/);
    expect(fire).not.toBeNull();
    expect(fire[0]).toContain('finishInjection');
    expect(fire[0]).toMatch(/setTimeout\(finishInjection, 2000\)/);
  });

  test('phase 2 always restores echo (stty sane fallback)', () => {
    const p2 = appSource.match(/function sendOscPhase2\(tab\)[\s\S]{0,2200}/);
    expect(p2).not.toBeNull();
    expect(p2[0]).toContain('stty sane');
  });

  test('phase 2 carries NO Ctrl-U — it would line-kill an unconsumed phase 1', () => {
    // A leading \x15 destroyed the still-buffered phase-1 line on slow links
    // (jump host → embedded device), producing a visible shell syntax error.
    expect(appSource).not.toContain('\\x15');
  });

  test('phase 2 waits for the shell prompt, not a fixed delay', () => {
    // A blind setTimeout let the two lines interleave in the tty input buffer.
    expect(appSource).toContain('_oscPhase2Pending');
    const watcher = appSource.match(/if \(tab\._oscPhase2Pending\)[\s\S]{0,400}/);
    expect(watcher).not.toBeNull();
    expect(watcher[0]).toContain('sendOscPhase2(tab)');
    // …with a fallback so a shell we cannot parse still gets set up.
    expect(appSource).toMatch(/_oscPhase2Timer = setTimeout\(\(\) => sendOscPhase2\(tab\), \d+\)/);
  });
});
