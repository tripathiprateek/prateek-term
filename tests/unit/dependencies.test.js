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
    // Bin names carry a .exe suffix on Windows, so key off the spec's own bin
    // rather than hardcoding "ssh" — this test must pass on every OS.
    const seen = {};
    const sshBin = dependencySpec().find((d) => d.key === 'ssh').bin;
    const probe = (bin, candidates) => {
      seen[bin] = candidates;
      return bin === sshBin ? '/usr/bin/ssh' : null;
    };
    const report = checkDependencies(probe, () => '');   // no version output

    const ssh = report.find((d) => d.key === 'ssh');
    expect(ssh.found).toBe(true);
    expect(ssh.path).toBe('/usr/bin/ssh');

    const sshpass = report.find((d) => d.key === 'sshpass');
    expect(sshpass.found).toBe(false);
    expect(sshpass.path).toBeNull();

    // candidates array is forwarded to the probe (so GUI-launched apps with a
    // minimal PATH still find Homebrew/user-local binaries).
    expect(Array.isArray(seen[sshBin])).toBe(true);
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
  test('main exposes a deps:check IPC returning dependencies AND health issues', () => {
    const main = read('src/main/main.js');
    expect(main).toContain("ipcMain.handle('deps:check'");
    expect(main).toContain('checkDependencies');
    expect(main).toContain('runHealthChecks');
  });

  test('renderer surfaces outdated versions and health issues, not just missing', () => {
    const app = read('src/renderer/js/app.js');
    const fn = app.match(/async function setupDependencyBanner[\s\S]{0,1800}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("versionState === 'outdated'");
    expect(fn[0]).toContain('issues');
  });

  test('preload bridges checkDependencies', () => {
    expect(read('src/main/preload.js')).toContain("ipcRenderer.invoke('deps:check')");
  });

  test('renderer runs the check at startup and renders a banner', () => {
    const app = read('src/renderer/js/app.js');
    expect(app).toContain('async function setupDependencyBanner');
    // init() must invoke it.
    const initFn = app.match(/async function init\(\)[\s\S]{0,2400}/);
    expect(initFn[0]).toContain('setupDependencyBanner()');
    // Only shows for missing deps and lists the install hint.
    const fn = app.match(/async function setupDependencyBanner[\s\S]{0,2200}/);
    expect(fn[0]).toContain('checkDependencies');
    expect(fn[0]).toContain('dep-install');
  });

  test('index.html has the dependency banner element', () => {
    expect(read('src/renderer/index.html')).toContain('id="deps-banner"');
  });
});

// ---------------------------------------------------------------------------
// Runnable install commands + the banner's Install button
// ---------------------------------------------------------------------------
describe('installCommand', () => {
  const { packageManager, installCommand } = require('../../src/main/dependencies');

  test('maps each tool to its package manager', () => {
    expect(installCommand('sshpass', 'apt')).toBe('sudo apt install -y sshpass');
    expect(installCommand('sshpass', 'brew')).toContain('hudochenkov/sshpass');
    expect(installCommand('node', 'winget')).toContain('OpenJS.NodeJS');
    expect(installCommand('telnet', 'pacman')).toContain('inetutils');
  });

  test('cloudflared is not in distro repos — apt/dnf fetch it from Cloudflare', () => {
    expect(installCommand('cloudflared', 'apt')).toContain('cloudflare/cloudflared/releases');
    expect(installCommand('cloudflared', 'dnf')).toContain('cloudflare/cloudflared/releases');
    expect(installCommand('cloudflared', 'brew')).toBe('brew install cloudflared');
  });

  test('no package manager, or no one-liner for that tool → null', () => {
    expect(installCommand('sshpass', null)).toBeNull();
    expect(installCommand('sshpass', 'winget')).toBeNull();   // not available on Windows
    expect(installCommand('nonsense', 'apt')).toBeNull();
  });

  test('packageManager detects from the injected probe', () => {
    const only = (want) => (bin) => (bin.startsWith(want) ? `/usr/bin/${bin}` : null);
    if (process.platform === 'linux') {
      expect(packageManager(only('apt-get'))).toBe('apt');
      expect(packageManager(() => null)).toBeNull();
    } else {
      expect(['brew', 'winget', null]).toContain(packageManager(() => null));
    }
  });

  test('checkDependencies exposes installCmd on every row', () => {
    const { checkDependencies } = require('../../src/main/dependencies');
    const report = checkDependencies(() => null, () => '');
    expect(report.length).toBeGreaterThan(0);
    for (const r of report) expect(r).toHaveProperty('installCmd');
  });
});

describe('banner Install button', () => {
  const fs = require('fs');
  const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '../../src/renderer/js/app.js'), 'utf8');

  test('renders a button only when a runnable command exists', () => {
    expect(app).toContain('dep-install-btn');
    expect(app).toMatch(/r\.cmd \?/);
  });

  test('opens a local tab and types the command WITHOUT executing it', () => {
    const fn = app.match(/dep-install-btn'\)\.forEach[\s\S]{0,900}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("protocol: 'local'");
    expect(fn[0]).toContain('sendInput(tab.ptyId, row.cmd)');
    // No trailing newline/carriage return — the user must press Enter.
    expect(fn[0]).not.toMatch(/row\.cmd \+ ['"`]\\[rn]/);
  });
});
