'use strict';
/**
 * tests/renderer/sidebar-collapse.test.js
 *
 * Source-contract tests for the collapsible Hosts sidebar.
 *
 * Feature:
 *   - A collapse chevron in the sidebar header (btn-sidebar-collapse) and a
 *     floating expand rail (btn-sidebar-expand, shown only when collapsed)
 *     toggle the sidebar, alongside the existing titlebar button and ⌘B.
 *   - toggleSidebar() animates #hosts-sidebar (.collapsed) and mirrors the
 *     state on #main-area (.sidebar-collapsed) so the expand rail can show.
 *   - The collapsed flag is persisted to settings and restored on launch.
 */

const fs   = require('fs');
const path = require('path');

const APP_JS    = path.resolve(__dirname, '../../src/renderer/js/app.js');
const INDEX_HTML = path.resolve(__dirname, '../../src/renderer/index.html');
const STYLE_CSS = path.resolve(__dirname, '../../src/renderer/css/style.css');

let app, html, css;
beforeAll(() => {
  app  = fs.readFileSync(APP_JS, 'utf8');
  html = fs.readFileSync(INDEX_HTML, 'utf8');
  css  = fs.readFileSync(STYLE_CSS, 'utf8');
});

// ---------------------------------------------------------------------------
// HTML structure
// ---------------------------------------------------------------------------

describe('sidebar collapse — HTML structure', () => {
  test('in-sidebar collapse chevron button exists', () => {
    expect(html).toContain('id="btn-sidebar-collapse"');
  });

  test('floating expand rail button exists', () => {
    expect(html).toContain('id="btn-sidebar-expand"');
  });

  test('collapse button advertises the ⌘B shortcut in its title', () => {
    expect(html).toMatch(/id="btn-sidebar-collapse"[^>]*title="[^"]*⌘B/);
  });

  test('expand rail is placed inside #main-area (sibling of the sidebar)', () => {
    const mainIdx     = html.indexOf('id="main-area"');
    const expandIdx   = html.indexOf('id="btn-sidebar-expand"');
    const sidebarIdx  = html.indexOf('id="hosts-sidebar"');
    expect(mainIdx).toBeGreaterThan(-1);
    expect(expandIdx).toBeGreaterThan(mainIdx);
    expect(expandIdx).toBeLessThan(sidebarIdx);
  });

  test('header actions are grouped (New Device + Collapse)', () => {
    expect(html).toContain('class="sidebar-header-actions"');
  });
});

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

describe('sidebar collapse — CSS', () => {
  test('#main-area is a positioning context for the floating rail', () => {
    const block = css.slice(css.indexOf('#main-area {'), css.indexOf('#main-area {') + 120);
    expect(block).toContain('position: relative');
  });

  test('expand rail is hidden by default', () => {
    const block = css.slice(css.indexOf('.sidebar-expand-btn {'), css.indexOf('.sidebar-expand-btn {') + 200);
    expect(block).toContain('display: none');
  });

  test('expand rail becomes visible only when #main-area is collapsed', () => {
    expect(css).toMatch(/#main-area\.sidebar-collapsed \.sidebar-expand-btn\s*\{\s*display:\s*flex/);
  });

  test('collapsed sidebar animates to zero width', () => {
    const block = css.slice(css.indexOf('#hosts-sidebar.collapsed {'), css.indexOf('#hosts-sidebar.collapsed {') + 160);
    expect(block).toContain('width: 0');
  });
});

// ---------------------------------------------------------------------------
// JS wiring
// ---------------------------------------------------------------------------

describe('sidebar collapse — JS wiring', () => {
  test('DOM refs for collapse + expand buttons and #main-area are queried', () => {
    expect(app).toContain("getElementById('btn-sidebar-collapse')");
    expect(app).toContain("getElementById('btn-sidebar-expand')");
    expect(app).toContain("getElementById('main-area')");
  });

  test('both new buttons are wired to toggleSidebar', () => {
    expect(app).toContain("dom.btnSidebarCollapse.addEventListener('click', toggleSidebar)");
    expect(app).toContain("dom.btnSidebarExpand.addEventListener('click', toggleSidebar)");
  });

  test('applySidebarCollapsed mirrors state on #main-area for the expand rail', () => {
    const block = app.slice(
      app.indexOf('function applySidebarCollapsed'),
      app.indexOf('function applySidebarCollapsed') + 400
    );
    expect(block).toContain("classList.toggle('collapsed'");
    expect(block).toContain("classList.toggle('sidebar-collapsed'");
  });

  test('toggleSidebar still refits the active terminal after the transition', () => {
    const block = app.slice(
      app.indexOf('function toggleSidebar'),
      app.indexOf('function toggleSidebar') + 500
    );
    expect(block).toContain('fitAddon.fit()');
    expect(block).toContain('resizeTerminal');
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('sidebar collapse — persistence', () => {
  test('toggleSidebar persists the new collapsed state', () => {
    const block = app.slice(
      app.indexOf('function toggleSidebar'),
      app.indexOf('function toggleSidebar') + 300
    );
    expect(block).toContain('persistSidebarCollapsed(state.sidebarCollapsed)');
  });

  test('persistSidebarCollapsed does a read-modify-write (no clobber of other settings)', () => {
    const block = app.slice(
      app.indexOf('async function persistSidebarCollapsed'),
      app.indexOf('async function persistSidebarCollapsed') + 400
    );
    expect(block).toContain('loadSettings()');
    expect(block).toContain('s.sidebarCollapsed = collapsed');
    expect(block).toContain('saveSettings(s)');
  });

  test('init restores the persisted collapsed state', () => {
    expect(app).toContain('if (savedSettings.sidebarCollapsed) applySidebarCollapsed(true)');
  });

  test('settings populate defaults include sidebarCollapsed', () => {
    expect(app).toContain('sidebarCollapsed: false');
  });
});
