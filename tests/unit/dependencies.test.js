'use strict';
/**
 * Startup dependency check — the app tests for the external CLI tools it shells
 * out to (ssh, sshpass, cloudflared, node, telnet) and reports which are
 * missing so the UI can highlight them.
 */

const fs   = require('fs');
const path = require('path');
const { dependencySpec, checkDependencies } = require('../../src/main/dependencies');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');

describe('dependencySpec', () => {
  test('ssh is the one required (core) dependency', () => {
    const spec = dependencySpec();
    const required = spec.filter((d) => d.required).map((d) => d.key);
    expect(required).toEqual(['ssh']);
  });

  test('covers the tools the app depends on', () => {
    const keys = dependencySpec().map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(['ssh', 'sshpass', 'cloudflared', 'node', 'telnet']));
  });

  test('every entry has a purpose and an install hint', () => {
    for (const d of dependencySpec()) {
      expect(typeof d.purpose).toBe('string');
      expect(d.purpose.length).toBeGreaterThan(0);
      expect(typeof d.install).toBe('string');
      expect(d.install.length).toBeGreaterThan(0);
    }
  });
});

describe('checkDependencies', () => {
  test('marks found/missing from the injected probe and passes candidates through', () => {
    const seen = {};
    const probe = (bin, candidates) => { seen[bin] = candidates; return bin.startsWith('ssh') && !bin.startsWith('sshpass') ? '/usr/bin/ssh' : null; };
    const report = checkDependencies(probe);

    const ssh = report.find((d) => d.key === 'ssh');
    expect(ssh.found).toBe(true);
    expect(ssh.path).toBe('/usr/bin/ssh');

    const sshpass = report.find((d) => d.key === 'sshpass');
    expect(sshpass.found).toBe(false);
    expect(sshpass.path).toBeNull();

    // candidates array is forwarded to the probe (so GUI-launched apps with a
    // minimal PATH still find Homebrew/user-local binaries).
    expect(Array.isArray(seen.ssh)).toBe(true);
  });

  test('a throwing probe degrades to "not found" (never crashes startup)', () => {
    const report = checkDependencies(() => { throw new Error('boom'); });
    expect(report.every((d) => d.found === false && d.path === null)).toBe(true);
  });

  test('report preserves required/purpose/install for the UI', () => {
    const d = checkDependencies(() => null).find((x) => x.key === 'sshpass');
    expect(d.required).toBe(false);
    expect(d.purpose).toMatch(/password/i);
    expect(d.install.length).toBeGreaterThan(0);
  });
});

describe('startup dependency-check wiring', () => {
  test('main exposes a deps:check IPC backed by checkDependencies', () => {
    const main = read('src/main/main.js');
    expect(main).toContain("ipcMain.handle('deps:check'");
    expect(main).toContain('checkDependencies');
  });

  test('preload bridges checkDependencies', () => {
    expect(read('src/main/preload.js')).toContain("ipcRenderer.invoke('deps:check')");
  });

  test('renderer runs the check at startup and renders a banner', () => {
    const app = read('src/renderer/js/app.js');
    expect(app).toContain('async function setupDependencyBanner');
    // init() must invoke it.
    const initFn = app.match(/async function init\(\)[\s\S]{0,1700}/);
    expect(initFn[0]).toContain('setupDependencyBanner()');
    // Only shows for missing deps and lists the install hint.
    const fn = app.match(/async function setupDependencyBanner[\s\S]{0,900}/);
    expect(fn[0]).toContain('checkDependencies');
    expect(fn[0]).toContain('dep-install');
  });

  test('index.html has the dependency banner element', () => {
    expect(read('src/renderer/index.html')).toContain('id="deps-banner"');
  });
});
