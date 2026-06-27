'use strict';
/**
 * tests/unit/integrations.test.js
 *
 * Tests for the per-OS shell-integration modules. The Linux module is
 * filesystem-based and fully testable by pointing XDG_DATA_HOME at a temp dir.
 * The Windows module shells out to reg.exe (absent on the CI mac/linux runners),
 * so we only assert its API surface + graceful isRegistered() fallback there.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// Linux integration — .desktop entry
// ---------------------------------------------------------------------------

describe('linux-integrations', () => {
  const linux = require('../../src/main/integrations/linux-integrations');
  let tmp, prevXdg;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-xdg-'));
    prevXdg = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = tmp;
  });
  afterEach(() => {
    if (prevXdg === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = prevXdg;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('isRegistered is false before register', () => {
    expect(linux.isRegistered()).toBe(false);
  });

  test('register writes a valid .desktop entry for the given exe', () => {
    linux.register('/opt/Prateek-Term/prateek-term');
    expect(linux.isRegistered()).toBe(true);
    const body = fs.readFileSync(linux.desktopPath(), 'utf8');
    expect(body).toContain('[Desktop Entry]');
    expect(body).toContain('Exec="/opt/Prateek-Term/prateek-term" %u');
    expect(body).toContain('x-scheme-handler/prateekterm');
    expect(body).toContain('Categories=Utility;TerminalEmulator;System;');
  });

  test('register throws without an exe path', () => {
    expect(() => linux.register()).toThrow();
  });

  test('unregister removes the entry', () => {
    linux.register('/opt/Prateek-Term/prateek-term');
    expect(linux.isRegistered()).toBe(true);
    linux.unregister();
    expect(linux.isRegistered()).toBe(false);
  });

  test('.desktop lands under XDG_DATA_HOME/applications', () => {
    expect(linux.desktopPath()).toBe(path.join(tmp, 'applications', 'prateek-term.desktop'));
  });
});

// ---------------------------------------------------------------------------
// Windows integration — API surface
// ---------------------------------------------------------------------------

describe('win-integrations', () => {
  const win = require('../../src/main/integrations/win-integrations');

  test('exports register / unregister / isRegistered', () => {
    expect(typeof win.register).toBe('function');
    expect(typeof win.unregister).toBe('function');
    expect(typeof win.isRegistered).toBe('function');
  });

  test('isRegistered returns false when reg.exe is unavailable (non-Windows)', () => {
    // On a mac/linux runner reg.exe doesn't exist → the query throws → false.
    expect(win.isRegistered()).toBe(false);
  });

  test('register throws without an exe path', () => {
    expect(() => win.register()).toThrow();
  });
});
