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
    const hasVariable = /capture:\s*true[\s\S]{0,1200}addEventListener\('mousemove'/.test(appSource);
    expect(hasInline || hasVariable).toBe(true);
  });

  test('uses capture: true on document mouseup listener', () => {
    const hasInline   = /addEventListener\('mouseup'[\s\S]{0,200}capture:\s*true/.test(appSource);
    const hasVariable = /capture:\s*true[\s\S]{0,1200}addEventListener\('mouseup'/.test(appSource);
    expect(hasInline || hasVariable).toBe(true);
  });

  test('removes capture listeners on mouseup to avoid leaks', () => {
    expect(appSource).toMatch(/removeEventListener\('mousemove'[\s\S]{0,50}OPTS/);
    expect(appSource).toMatch(/removeEventListener\('mouseup'[\s\S]{0,50}OPTS/);
  });

  test('calls openNewWindow with the connection profile on tear-off', () => {
    expect(appSource).toContain('openNewWindow(tab.connectionProfile)');
  });

  test('closes the source tab after tearing off', () => {
    const tearOffBlock = appSource.match(/openNewWindow[\s\S]{0,200}closeTab/);
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
// Multiple instances allowed (no requestSingleInstanceLock)
// ---------------------------------------------------------------------------

describe('Multiple instances', () => {
  test('does NOT call requestSingleInstanceLock (allows multiple windows)', () => {
    expect(mainSource).not.toContain('requestSingleInstanceLock');
  });

  test('does NOT set LSMultipleInstancesProhibited in package.json', () => {
    const pkgJson = fs.readFileSync(
      path.resolve(__dirname, '../../package.json'), 'utf8'
    );
    expect(pkgJson).not.toContain('LSMultipleInstancesProhibited');
  });
});
