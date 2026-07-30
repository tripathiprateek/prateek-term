/**
 * Regression: the app icon must appear in the Linux dash/taskbar.
 *
 * Two failure modes this locks down:
 *  1. The BrowserWindow icon path pointed at build/icon.png inside the asar,
 *     which isn't packaged — so the running window had no icon. It must now be
 *     bundled via extraResources and loaded from resources/ when packaged.
 *  2. GNOME ties a running window to its installed .desktop (and thus its icon)
 *     via StartupWMClass, which must match Electron's WM_CLASS. Electron derives
 *     that from app.getName() — the lowercase package "name" — so StartupWMClass
 *     must be the lowercase "prateek-term", not "Prateek-Term".
 */

const fs   = require('fs');
const path = require('path');

const pkg      = require('../../package.json');
const MAIN_SRC = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

describe('Linux app icon', () => {
  test('icon.png is bundled via extraResources so it exists at runtime', () => {
    const res = pkg.build.extraResources || [];
    const hit = res.find((r) => r && r.from === 'build/icon.png');
    expect(hit).toBeTruthy();
    expect(hit.to).toBe('icon.png');
  });

  test('StartupWMClass matches Electron WM_CLASS (lowercase app name)', () => {
    expect(pkg.build.linux.desktop.StartupWMClass).toBe('prateek-term');
    // Electron uses package "name" for app.getName() → the WM_CLASS instance.
    expect(pkg.name).toBe('prateek-term');
  });

  test('runtime icon path resolves from resources/ when packaged', () => {
    const fn = MAIN_SRC.match(/function appIconPath\(\)[\s\S]{0,300}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('app.isPackaged');
    expect(fn[0]).toContain('process.resourcesPath');
  });

  test('the window icon no longer reads build/icon.png from inside the asar', () => {
    // createNewWindow must use appIconPath(), not the hardcoded source path.
    const block = MAIN_SRC.match(/function createNewWindow\(opts = \{\}\)[\s\S]{0,400}/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain('appIconPath()');
    expect(block[0]).not.toMatch(/'build', 'icon\.png'/);
  });
});
