'use strict';
/**
 * dependencies.js — the external command-line tools Prateek-Term shells out to.
 *
 * The app bundles its own native modules (node-pty, serialport, xterm), but it
 * relies on a handful of system binaries for connections and integrations.
 * This module declares them and tests for their presence at startup so the app
 * can highlight anything missing (e.g. `sshpass`, which is needed for password
 * jump-hosts) instead of failing later with a cryptic "command not found".
 *
 * Electron-free / pure Node so it can be unit-tested; the probe is injectable.
 */

const platform = require('./platform');

// Absolute-path candidates worth checking first, because a GUI-launched app has
// a minimal PATH that often omits Homebrew (macOS) / user-local dirs.
const UNIX_BINDIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
const withDir = (name) => UNIX_BINDIRS.map((d) => `${d}/${name}`);

/**
 * The dependency catalogue, resolved for the current OS.
 * @returns {Array<{key,bin,required,purpose,install,candidates}>}
 */
function dependencySpec() {
  const win = platform.isWindows();
  const mac = platform.isMac();
  const exe = (n) => (win ? `${n}.exe` : n);

  return [
    {
      key: 'ssh', bin: exe('ssh'), required: true,
      purpose: 'SSH, SFTP and SCP connections (the core of the app)',
      candidates: win ? [`${process.env.SystemRoot || 'C:\\Windows'}\\System32\\OpenSSH\\ssh.exe`] : withDir('ssh'),
      install: win
        ? 'Windows: Settings → Apps → Optional Features → add "OpenSSH Client".'
        : 'Preinstalled with OpenSSH on macOS and Linux.',
    },
    {
      key: 'sshpass', bin: exe('sshpass'), required: false,
      purpose: 'Password auth for jump hosts and for SCP/SFTP over the MCP bridge',
      candidates: win ? [] : withDir('sshpass'),
      // `sshpass -V` → "sshpass 1.06". Report the version for diagnostics but
      // set no minimum: 1.06 is the newest release Homebrew ships and it works
      // correctly here (verified relaying a jump-host tunnel). An earlier
      // "1.06 hangs" theory turned out to be a wedged ssh-agent, not sshpass —
      // see health-checks.js. Don't warn about a tool that demonstrably works.
      versionArgs: ['-V'], versionRe: /sshpass\s+(\d+\.\d+)/i,
      install: win
        ? 'Not available on Windows — use key-based auth instead.'
        : mac
          ? 'brew install hudochenkov/sshpass/sshpass'
          : 'Debian/Ubuntu: sudo apt install sshpass',
    },
    {
      key: 'cloudflared', bin: exe('cloudflared'), required: false,
      purpose: 'Cloudflare Access (zero-trust) SSH tunnels',
      candidates: win ? [] : withDir('cloudflared'),
      // CalVer: "cloudflared version 2026.7.3 (built …)". Cloudflare's edge
      // rejects clients more than roughly a year old.
      versionArgs: ['--version'], versionRe: /version\s+(\d{4}\.\d+\.\d+)/i, minVersion: '2025.1.0',
      install: win
        ? 'winget install --id Cloudflare.cloudflared'
        : mac
          ? 'brew install cloudflared'
          : 'See developers.cloudflare.com/cloudflare-one for your distro.',
    },
    {
      key: 'node', bin: exe('node'), required: false,
      purpose: 'Runs the MCP server for AI (Claude) integration',
      candidates: win ? [`${process.env.ProgramFiles || 'C:\\Program Files'}\\nodejs\\node.exe`] : withDir('node'),
      versionArgs: ['--version'], versionRe: /v?(\d+\.\d+\.\d+)/, minVersion: '18.0.0',
      install: 'Install Node.js 18+ from nodejs.org.',
    },
    {
      key: 'telnet', bin: exe('telnet'), required: false,
      purpose: 'Telnet connections',
      candidates: win ? [] : withDir('telnet'),
      install: win
        ? 'Windows: Optional Features → add "Telnet Client".'
        : mac
          ? 'brew install telnet'
          : 'Debian/Ubuntu: sudo apt install telnet',
    },
  ];
}

/**
 * Which package manager this machine actually has. The install command a user
 * can run differs per distro, so it is resolved at runtime rather than guessed
 * in the catalogue.
 * @returns {'brew'|'apt'|'dnf'|'pacman'|'winget'|null}
 */
function packageManager(probe = platform.whichBin) {
  const has = (bin, candidates) => {
    try { return !!probe(bin, candidates || []); } catch { return false; }
  };
  if (platform.isWindows()) return has('winget.exe', []) ? 'winget' : null;
  if (platform.isMac())     return has('brew', ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']) ? 'brew' : null;
  if (has('apt-get', ['/usr/bin/apt-get'])) return 'apt';
  if (has('dnf',     ['/usr/bin/dnf']))     return 'dnf';
  if (has('pacman',  ['/usr/bin/pacman']))  return 'pacman';
  return null;
}

// A command the user can actually run, per tool per package manager. Anything
// absent here has no one-liner (e.g. sshpass on Windows) and falls back to the
// prose hint. cloudflared is deliberately missing from apt/dnf/pacman: it is
// not in distro repos, so it gets a dedicated download command below.
const INSTALL_COMMANDS = {
  sshpass: {
    brew:   'brew install hudochenkov/sshpass/sshpass',
    apt:    'sudo apt install -y sshpass',
    dnf:    'sudo dnf install -y sshpass',
    pacman: 'sudo pacman -S --noconfirm sshpass',
  },
  node: {
    brew:   'brew install node',
    apt:    'sudo apt install -y nodejs',
    dnf:    'sudo dnf install -y nodejs',
    pacman: 'sudo pacman -S --noconfirm nodejs',
    winget: 'winget install --id OpenJS.NodeJS',
  },
  telnet: {
    brew:   'brew install telnet',
    apt:    'sudo apt install -y telnet',
    dnf:    'sudo dnf install -y telnet',
    pacman: 'sudo pacman -S --noconfirm inetutils',
  },
  cloudflared: {
    brew:   'brew install cloudflared',
    winget: 'winget install --id Cloudflare.cloudflared',
    // Not packaged by any distro — fetch Cloudflare's own .deb/.rpm.
    apt: 'curl -fsSL -o /tmp/cloudflared.deb '
       + 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb '
       + '&& sudo dpkg -i /tmp/cloudflared.deb',
    dnf: 'sudo dnf install -y '
       + 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(uname -m).rpm',
  },
};

/** The runnable install command for a tool, or null when there is no one-liner. */
function installCommand(key, pm) {
  if (!pm) return null;
  return (INSTALL_COMMANDS[key] && INSTALL_COMMANDS[key][pm]) || null;
}

/**
 * Compare dotted numeric versions. Returns <0, 0 or >0 like a sort comparator.
 * Handles CalVer (2026.7.3) and SemVer (1.09, 18.0.0) alike.
 */
function compareVersions(a, b) {
  const partsA = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Default version reader: run `<bin> <args>` and return its combined output.
// Tools vary — sshpass prints to stdout, ssh -V prints to stderr — so merge both.
function defaultRunVersion(binPath, args) {
  const { execFileSync } = require('child_process');
  return execFileSync(binPath, args, { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Probe every dependency: is it installed, and is the version new enough?
 * Presence alone is not sufficient — an ancient sshpass or cloudflared is
 * installed yet still fails, which is why `versionState` exists.
 *
 * @param {Function} [probe] (bin, candidates) → absolute path | null
 * @param {Function} [runVersion] (path, args) → raw version output
 * @returns {Array<{key,bin,required,purpose,install,found,path,version,minVersion,versionState}>}
 *          versionState: 'ok' | 'outdated' | 'unknown' | null (no version rule)
 */
function checkDependencies(probe = platform.whichBin, runVersion = defaultRunVersion) {
  const pm = packageManager(probe);
  return dependencySpec().map((d) => {
    let found = null;
    try { found = probe(d.bin, d.candidates || []); } catch { found = null; }

    let version = null;
    let versionState = d.minVersion ? 'unknown' : null;
    if (found && d.versionArgs && d.versionRe) {
      try {
        const raw = String(runVersion(found, d.versionArgs) || '');
        const m = raw.match(d.versionRe);
        if (m) {
          version = m[1];
          versionState = compareVersions(version, d.minVersion) < 0 ? 'outdated' : 'ok';
        }
      } catch { /* some tools exit non-zero on --version; leave as unknown */ }
    }

    return {
      key: d.key, bin: d.bin, required: d.required, purpose: d.purpose,
      install: d.install, found: !!found, path: found || null,
      installCmd: installCommand(d.key, pm),
      version, minVersion: d.minVersion || null, versionState,
    };
  });
}

module.exports = {
  dependencySpec, checkDependencies, compareVersions, packageManager, installCommand,
};
