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
    expect(body).toContain("Exec='/opt/Prateek-Term/prateek-term' %u");
    expect(body).toContain('x-scheme-handler/prateekterm');
    expect(body).toContain('Categories=Utility;TerminalEmulator;System;');
  });

  test('.desktop carries Icon= and the correct (lowercase) StartupWMClass', () => {
    // Regression: a user-level entry shadows the deb's; without Icon= and a
    // matching StartupWMClass the dash icon vanishes after "Register".
    linux.register('/opt/Prateek-Term/prateek-term');
    const body = fs.readFileSync(linux.desktopPath(), 'utf8');
    expect(body).toContain('Icon=prateek-term');
    expect(body).toContain('StartupWMClass=prateek-term');
    expect(body).not.toContain('StartupWMClass=Prateek-Term');
  });

  test('register installs the icon into the user hicolor theme when given one', () => {
    const iconSrc = path.join(tmp, 'src-icon.png');
    fs.writeFileSync(iconSrc, 'PNGDATA');
    linux.register('/opt/Prateek-Term/prateek-term', iconSrc);
    expect(fs.existsSync(linux.iconInstalledPath())).toBe(true);
    expect(linux.iconInstalledPath()).toBe(
      path.join(tmp, 'icons', 'hicolor', '512x512', 'apps', 'prateek-term.png'));
  });

  test('register installs an executable Nautilus "Open in Prateek-Term" script', () => {
    linux.register('/opt/Prateek-Term/prateek-term');
    const sp = linux.nautilusScriptPath();
    expect(sp).toBe(path.join(tmp, 'nautilus', 'scripts', 'Open in Prateek-Term'));
    expect(fs.existsSync(sp)).toBe(true);
    // POSIX-only: Windows filesystems have no executable bit. The Nautilus
    // script is a Linux feature; the bit is set via mode 0o755 on real installs.
    if (process.platform !== 'win32') {
      expect(fs.statSync(sp).mode & 0o111).toBeTruthy();
    }
    const body = fs.readFileSync(sp, 'utf8');
    expect(body).toContain("exe='/opt/Prateek-Term/prateek-term'");
    expect(body).toContain('NAUTILUS_SCRIPT_SELECTED_FILE_PATHS');
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
