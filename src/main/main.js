/**
 * Prateek-Term — macOS Terminal Emulator & SSH Connection Manager
 *
 * Copyright (c) 2026 Prateek Tripathi
 * Contact  : tripathiprateek@gmail.com
 * License  : Polyform Noncommercial License 1.0.0
 *            Personal/non-commercial use only.
 *            Attribution required in About screen for any derivative work.
 *            Commercial use requires prior written permission from the author.
 *
 * See LICENSE file in the project root for full license terms.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');
const pty = require('node-pty');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

// MCP HTTP bridge — exposes running sessions to AI clients via localhost
const bridge = require('./http-bridge');

// Pure utility functions — kept in a separate module so they can be unit-tested
// without requiring Electron.
const {
  isSshpassAvailable,
  wrapWithSshpass,
  buildCommonSSHFlags,
  buildSSHCommand,
  buildSFTPCommand,
  buildSCPCommand,
  buildTelnetCommand,
  buildFTPCommand,
  parseSSHConfig,
  profilesToSSHConfig,
} = require('./ssh-utils');

function getBuildNumber() {
  try {
    const p = app.isPackaged
      ? path.join(process.resourcesPath, '.build-number')
      : path.join(__dirname, '../../.build-number');
    return fs.readFileSync(p, 'utf8').trim();
  } catch { return '0'; }
}

// ── Version info & auto-update ────────────────────────────────────────────

/**
 * Returns the current version, build number, and channel label.
 * Channel: Stable | Release Candidate | Beta | Pre-release | Local Dev
 */
function getVersionInfo() {
  const version  = app.getVersion();
  const buildNum = getBuildNumber();
  let channel = 'Stable';
  if (!buildNum || buildNum === '0') {
    channel = 'Local Dev';
  } else if (/-rc\.\d+/i.test(version)) {
    channel = 'Release Candidate';
  } else if (/-beta\.\d+/i.test(version)) {
    channel = 'Beta';
  } else if (/-/.test(version)) {
    channel = 'Pre-release';
  }
  return { version, buildNum: buildNum || 'dev', channel };
}

/**
 * Compare two semver strings (ignores pre-release suffixes for the numeric part).
 * Returns true if remote version number is strictly greater than local.
 */
function isVersionNewer(remote, local) {
  const nums = (v) => v.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const [rM, rm, rp] = nums(remote);
  const [lM, lm, lp] = nums(local);
  if (rM !== lM) return rM > lM;
  if (rm !== lm) return rm > lm;
  return rp > lp;
}

const RELEASES_API = 'https://api.github.com/repos/tripathiprateek/prateek-term/releases';
const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fetch the latest GitHub release and notify the renderer if a newer version
 * is available. Pass includePrerelease=true to surface RC/beta releases.
 */
async function checkForUpdates(includePrerelease = false) {
  dbgLog(`[update] checking releases includePrerelease=${includePrerelease}`);
  try {
    const res = await fetch(`${RELEASES_API}?per_page=10`, {
      headers: { 'User-Agent': 'prateek-term', Accept: 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      dbgLog(`[update] GitHub API returned ${res.status}`);
      return null;
    }
    const releases = await res.json();
    if (!Array.isArray(releases)) return null;

    // Find the newest release matching channel preference
    const candidate = releases.find(r => !r.draft && (includePrerelease || !r.prerelease));
    if (!candidate) {
      dbgLog('[update] no suitable release found');
      return null;
    }

    const remoteVersion = (candidate.tag_name || '').replace(/^v/, '');
    const localVersion  = app.getVersion();
    dbgLog(`[update] local=${localVersion} remote=${remoteVersion} prerelease=${candidate.prerelease}`);
    if (remoteVersion && isVersionNewer(remoteVersion, localVersion)) {
      dbgLog(`[update] update available: ${localVersion} → ${remoteVersion}`);
      const payload = {
        version:    remoteVersion,
        url:        candidate.html_url,
        prerelease: candidate.prerelease,
      };
      // Notify all open windows
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('update:available', payload);
      });
      return payload;
    }
    dbgLog('[update] already up to date');
    return null;
  } catch (e) {
    dbgLog(`[update] check failed: ${e.message}`);
    return null; // network errors are always silent
  }
}

const { SerialPort } = require('serialport');

// ── Default Terminal Native Addon (optional — built separately) ───────────
let defaultTerminalAddon = null;
try {
  defaultTerminalAddon = require('../native/index.js');
  dbgLog('[default-terminal] native addon loaded');
} catch (e) {
  dbgLog(`[default-terminal] native addon not available: ${e.message}`);
}

// Multiple instances are allowed — each window is independent.
// URL scheme (prateekterm://) is handled via app.on('open-url') on macOS.

// ===== URL Scheme: prateekterm:// =====

if (process.defaultApp) {
  app.setAsDefaultProtocolClient('prateekterm', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('prateekterm');
}

// Buffer URLs that arrive before the renderer is ready
let pendingFolderPaths = [];
let rendererReady = false;

function flushPendingFolderPaths() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const paths = pendingFolderPaths.splice(0);
  dbgLog(`flushPendingFolderPaths: ${paths.length} paths`);
  paths.forEach((p) => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('open-folder', p);
    dbgLog(`flushed open-folder: ${p}`);
  });
}

const DEBUG_LOG_PATH = path.join(app.getPath('userData'), 'debug.log');
const DEBUG_LOG_MAX = 500 * 1024; // 500 KB — rotate when exceeded

function dbgLog(msg) {
  try {
    const settings = loadSettings();
    if (!settings.debugLogging) return;
    const line = `${new Date().toISOString()} ${msg}\n`;
    // Rotate log if too large
    try {
      if (fs.existsSync(DEBUG_LOG_PATH) && fs.statSync(DEBUG_LOG_PATH).size > DEBUG_LOG_MAX) {
        const content = fs.readFileSync(DEBUG_LOG_PATH, 'utf8');
        const half = content.slice(Math.floor(content.length / 2));
        fs.writeFileSync(DEBUG_LOG_PATH, '--- log rotated ---\n' + half, 'utf8');
      }
    } catch {}
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch {}
}

function handlePrateekTermUrl(url) {
  dbgLog(`handlePrateekTermUrl: ${url}`);
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'open') {
      const folderPath = parsed.searchParams.get('path') || '';
      dbgLog(`folderPath="${folderPath}" rendererReady=${rendererReady} mainWindow=${!!mainWindow}`);
      if (!folderPath) return;
      if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('open-folder', folderPath);
        dbgLog('sent open-folder IPC');
      } else {
        pendingFolderPaths.push(folderPath);
        dbgLog('buffered path, waiting for renderer:ready');
      }
    }
  } catch (e) {
    dbgLog(`ERROR: ${e.message}`);
  }
}

// macOS: URL opened while app is already running OR cold-launch
app.on('open-url', (event, url) => {
  event.preventDefault();
  handlePrateekTermUrl(url);
});

// macOS: folder/file opened via `open -b com.prateek.prateekterm <path>`
// Covers: Automator Quick Action, Finder "Open in Terminal" (default terminal),
// drag-onto-dock, `open -b com.prateek.prateekterm /some/folder`.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (!filePath) return;

  // Resolve to a directory — if a file was passed, use its parent folder.
  let resolvedPath = filePath;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isDirectory()) {
      resolvedPath = path.dirname(filePath);
      dbgLog(`[open-file] received file path, resolved to dir: ${resolvedPath}`);
    }
  } catch (e) {
    dbgLog(`[open-file] stat failed for "${filePath}": ${e.message}`);
  }

  dbgLog(`[open-file] filePath="${filePath}" resolved="${resolvedPath}" rendererReady=${rendererReady}`);

  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('open-folder', resolvedPath);
  } else {
    pendingFolderPaths.push(resolvedPath);
  }
});

// Auto-connect profiles queued for new windows (keyed by webContents id)
const pendingAutoConnect = new Map();

// Renderer signals it has finished init() and registered all IPC listeners
ipcMain.on('renderer:ready', (event) => {
  rendererReady = true;
  dbgLog('renderer:ready received');
  flushPendingFolderPaths();

  // If this webContents belongs to a tear-off window, send the profile now
  const profile = pendingAutoConnect.get(event.sender.id);
  if (profile) {
    pendingAutoConnect.delete(event.sender.id);
    event.sender.send('auto-connect', profile);
  }
});

// Open a new independent window, optionally auto-connecting to a profile
ipcMain.handle('window:open-new', (event, profile) => {
  dbgLog(`[window] open-new${profile ? ` profile="${profile.name}" protocol=${profile.protocol}` : ' (no profile)'}`);
  const win = createNewWindow();
  if (profile) pendingAutoConnect.set(win.webContents.id, profile);
  return { success: true };
});

// ===== Finder Quick Action Auto-Install =====

function installQuickActionIfNeeded() {
  try {
    const servicesDir = path.join(os.homedir(), 'Library', 'Services');
    const dest = path.join(servicesDir, 'OpenInPrateekTerm.workflow');
    if (fs.existsSync(dest)) return;
    const src = path.join(
      process.resourcesPath || path.join(__dirname, '../../..'),
      'OpenInPrateekTerm.workflow'
    );
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(servicesDir)) fs.mkdirSync(servicesDir, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    // Strip macOS quarantine flag so Finder runs the unsigned workflow
    // (quarantine travels from the DMG onto everything the app copies)
    exec(`xattr -rd com.apple.quarantine "${dest}"`, () => {});
    // Notify macOS to refresh the Services menu
    exec('/System/Library/CoreServices/pbs -update', () => {});
  } catch (e) {
    console.warn('Quick Action install skipped:', e.message);
  }
}

let mainWindow;
const terminals = new Map();
const terminalOwners = new Map(); // ptyId -> webContents
let terminalIdCounter = 0;
const scpTransfers = new Map();
let scpTransferId = 0;
const serialConnections = new Map();

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return {};
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function getProfilesPath() {
  const settings = loadSettings();
  return settings.profilesPath || path.join(app.getPath('userData'), 'connection-profiles.json');
}

// Creates a new independent app window (shared by initial launch, Cmd+N, dock menu, tear-off)
function createNewWindow() {
  const { nativeImage } = require('electron');
  const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: `Prateek-Term v${app.getVersion()} (${getBuildNumber()})`,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e',
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Force native title bar to show version after page load overrides it
  const versionTitle = `Prateek-Term v${app.getVersion()} (${getBuildNumber()})`;
  win.webContents.on('did-finish-load', () => win.setTitle(versionTitle));
  // Block Cmd+R — reloading kills all open terminal sessions
  win.webContents.on('before-input-event', (event, input) => {
    if (input.meta && input.key === 'r') event.preventDefault();
  });
  return win;
}

function createWindow() {
  mainWindow = createNewWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const [_id, term] of terminals) term.kill();
    terminals.clear();
    for (const [_id, proc] of scpTransfers) proc.kill();
    scpTransfers.clear();
  });
}

app.whenReady().then(() => {
  // Set dock icon in dev mode (macOS ignores BrowserWindow icon)
  const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');
  try {
    const { nativeImage } = require('electron');
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (app.dock && !dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  } catch (e) {
    // icon not found in dev, not critical
  }

  const { version, buildNum, channel } = getVersionInfo();
  // Startup banner — logged once so support logs are self-describing
  dbgLog(`=== Prateek-Term ${version} (build ${buildNum}) starting ===`);
  dbgLog(`platform=${process.platform} arch=${process.arch} node=${process.version} electron=${process.versions.electron}`);
  dbgLog(`os=${os.type()} ${os.release()} | cpus=${os.cpus().length} | mem=${Math.round(os.totalmem()/1024/1024)}MB`);
  dbgLog(`userData=${app.getPath('userData')} home=${os.homedir()}`);

  app.setAboutPanelOptions({
    applicationName: 'Prateek-Term',
    applicationVersion: `${version} — ${channel}`,
    version: `Build ${buildNum}`,
    credits: 'Developed by Prateek Tripathi\ntripathiprateek@gmail.com\n\nLicensed under the Polyform Noncommercial License 1.0.0.\nNon-commercial use only. Attribution required for derivative works.\nFor commercial use, contact: tripathiprateek@gmail.com',
    copyright: '© 2026 Prateek Tripathi. All rights reserved.',
  });

  // Set application menu with "Prateek-Term" name
  const menuTemplate = [
    {
      label: 'Prateek-Term',
      submenu: [
        { label: 'About Prateek-Term', role: 'about' },
        { type: 'separator' },
        { label: 'Settings...', accelerator: 'Cmd+,', click: () => mainWindow && mainWindow.webContents.send('open-settings') },
        { type: 'separator' },
        { label: 'Hide Prateek-Term', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit Prateek-Term', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'New Window', accelerator: 'Cmd+N', click: () => createNewWindow() },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'User Guide',
          click: () => openUserGuide(),
        },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates(),
        },
        { type: 'separator' },
        {
          label: 'Visit GitHub Repository',
          click: () => shell.openExternal('https://github.com/tripathiprateek/prateek-term'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  // Dock right-click menu (macOS)
  if (app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: 'New Window', click: () => createNewWindow() },
    ]));
  }

  installQuickActionIfNeeded();

  // Check process.argv for a folder path passed by macOS when launching as the
  // default terminal (e.g. Finder "Open in Terminal" cold-launch).
  // macOS may pass the folder as argv[1] alongside Electron internals.
  // We check AFTER the app is ready (open-file fires earlier, but argv is always available).
  const argvFolderPath = (() => {
    // Skip Electron/app internals — look for the first absolute path to an existing directory.
    const args = process.argv.slice(1);
    dbgLog(`[argv] checking for folder: [${args.join(', ')}]`);
    for (const arg of args) {
      if (!arg.startsWith('-') && path.isAbsolute(arg)) {
        try {
          if (fs.statSync(arg).isDirectory()) {
            return arg;
          }
        } catch { /* not a valid path */ }
      }
    }
    return null;
  })();

  if (argvFolderPath) {
    dbgLog(`[argv] found folder path: ${argvFolderPath}`);
    pendingFolderPaths.push(argvFolderPath);
  }

  createWindow();

  // Start MCP bridge if user has enabled it in settings
  startBridgeIfEnabled();

  // Check for updates on startup (5s delay so window is fully rendered first)
  // and then every 6 hours. Errors are silent.
  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (!app.isReady()) return; // guard against early activate before app is ready
  const wins = BrowserWindow.getAllWindows();
  if (wins.length === 0) {
    createWindow();
  } else {
    // Focus the most recently active window
    wins[0].show();
    wins[0].focus();
  }
});

// ---------- Terminal Management ----------

function findShell() {
  const candidates = [
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
  ].filter(Boolean);

  for (const sh of candidates) {
    try {
      fs.accessSync(sh, fs.constants.X_OK);
      return sh;
    } catch {
      // try next
    }
  }
  return '/bin/sh';
}

ipcMain.handle('terminal:create', (event, options = {}) => {
  // Capture the webContents that created this terminal so data is routed to
  // the correct window — torn-off windows must NOT have data sent to mainWindow.
  const ownerContents = event.sender;
  const id = ++terminalIdCounter;
  const shell = options.shell || findShell();
  dbgLog(`[pty:${id}] create shell="${shell}" args=[${(options.args||['-l']).join(',')}] cwd="${options.cwd||'(default)'}" cols=${options.cols||80} rows=${options.rows||24} customCmd=${!!options.shell}`);
  // Use -l (login shell) by default so ~/.bash_profile / ~/.zprofile are sourced
  // and the PTY inherits the user's full PATH (NVM, Homebrew, Go, etc.) — the same
  // environment iTerm2 and Terminal.app provide. Callers can pass args: [] explicitly
  // to opt out (e.g. SSH or custom shell connections that manage their own env).
  const args = options.args || ['-l'];

  let cwd = options.cwd || process.env.HOME || '/';
  // Ensure cwd is a readable DIRECTORY (not a file path).
  try {
    const st = fs.statSync(cwd);
    if (!st.isDirectory()) {
      // Received a file path — use its parent directory instead.
      dbgLog(`[pty] cwd "${cwd}" is a file, using dirname`);
      cwd = path.dirname(cwd);
    }
    fs.accessSync(cwd, fs.constants.R_OK);
  } catch {
    dbgLog(`[pty] cwd "${cwd}" not accessible, falling back to HOME`);
    cwd = process.env.HOME || '/';
    try {
      fs.accessSync(cwd, fs.constants.R_OK);
    } catch {
      cwd = '/';
    }
  }

  const env = { ...process.env, ...(options.env || {}) };
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  // Ensure UTF-8 locale so vim/less/man render Unicode (box-drawing chars etc.)
  // correctly. Without this, apps launched from the macOS Dock may inherit no
  // locale and fall back to Latin-1, garbling multi-byte characters.
  if (!env.LANG)    env.LANG    = 'en_US.UTF-8';
  if (!env.LC_ALL)  env.LC_ALL  = 'en_US.UTF-8';
  if (!env.PATH) {
    env.PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  }
  // Prevent SSH from opening a GUI password dialog.
  // Password injection for SSH is handled by the renderer auto-type (see app.js).
  delete env.SSH_ASKPASS;
  delete env.SSH_ASKPASS_REQUIRE;

  let term;
  try {
    term = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env,
    });
    dbgLog(`[pty:${id}] spawned pid=${term.pid} shell="${shell}" cwd="${cwd}"`);
  } catch (err) {
    dbgLog(`[pty:${id}] spawn failed shell="${shell}" cwd="${cwd}" err="${err.message}" — falling back to /bin/sh`);
    console.error(`Failed to spawn shell "${shell}" in "${cwd}":`, err.message);
    term = pty.spawn('/bin/sh', args, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: '/',
      env,
    });
    dbgLog(`[pty:${id}] fallback spawned pid=${term.pid}`);
  }

  terminals.set(id, term);
  terminalOwners.set(id, ownerContents);
  // Register with the MCP bridge so UI-opened sessions are visible to AI agents
  // via list_sessions, and can be adopted with run_command / send_input.
  bridge.ensureBuf(id);

  term.onData((data) => {
    const owner = terminalOwners.get(id);
    if (owner && !owner.isDestroyed()) {
      owner.send('terminal:data', { id, data });
    }
    // Feed MCP output buffer so AI agents can read output / detect prompts
    bridge.appendOutput(id, data);
  });

  // Collect askpass temp scripts to delete when the PTY exits
  const cleanupFiles = options._cleanupFiles || [];

  term.onExit(({ exitCode, signal }) => {
    dbgLog(`[pty:${id}] exit code=${exitCode} signal=${signal||'none'} pid=${term.pid}`);
    const owner = terminalOwners.get(id);
    terminals.delete(id);
    terminalOwners.delete(id);
    // Clean up SSH_ASKPASS helper scripts written by wrapWithAskpass
    for (const f of cleanupFiles) {
      try { fs.unlinkSync(f); } catch { /* already gone */ }
    }
    if (owner && !owner.isDestroyed()) {
      owner.send('terminal:exit', { id, exitCode, signal });
    }
  });

  const debugCmd = [shell, ...args].join(' ');
  return { id, debugCmd };
});

// Re-route terminal data to the new owner window (used by tab tear-off)
ipcMain.handle('terminal:adopt', (event, id) => {
  if (!terminals.has(id)) {
    dbgLog(`[pty:${id}] adopt FAILED — terminal not found`);
    return { success: false };
  }
  terminalOwners.set(id, event.sender);
  dbgLog(`[pty:${id}] adopted by new window`);
  return { success: true };
});

ipcMain.on('terminal:input', (event, { id, data }) => {
  const term = terminals.get(id);
  if (term) {
    term.write(data);
  }
});

ipcMain.on('terminal:resize', (event, { id, cols, rows }) => {
  const term = terminals.get(id);
  if (term) {
    try {
      term.resize(cols, rows);
    } catch (e) {
      // ignore resize errors
    }
  }
});

ipcMain.on('terminal:kill', (event, { id }) => {
  const term = terminals.get(id);
  if (term) {
    dbgLog(`[pty:${id}] kill requested pid=${term.pid}`);
    term.kill();
    terminals.delete(id);
  } else {
    dbgLog(`[pty:${id}] kill requested but terminal not found (already exited?)`);
  }
});

// ---------- Connection Protocol Handlers ----------
// All command-building functions are imported from ./ssh-utils.js

ipcMain.handle('connection:connect', (event, profile) => {
  const authDesc = profile.authType === 'password' ? 'password' : (profile.pemFile ? 'key-file' : profile.pemText ? 'key-pasted' : 'agent');
  dbgLog(`[connect] protocol=${profile.protocol} host=${profile.host} port=${profile.port||'default'} user=${profile.username||'(none)'} auth=${authDesc} strictHost=${!!profile.strictHostOff}`);
  if (profile.protocol === 'ssh') {
    const mode = profile.sshMode || 'terminal';
    dbgLog(`[connect] ssh mode=${mode} compression=${!!profile.compression}`);
    switch (mode) {
      case 'sftp':
        return buildSFTPCommand(profile);
      case 'scp':
        return buildSCPCommand(profile);
      default:
        return buildSSHCommand(profile);
    }
  }

  switch (profile.protocol) {
    case 'telnet':
      return buildTelnetCommand(profile);
    case 'ftp':
      return buildFTPCommand(profile);
    default:
      dbgLog(`[connect] ERROR unknown protocol: ${profile.protocol}`);
      throw new Error(`Unknown protocol: ${profile.protocol}`);
  }
});

// ---------- Connection Profile Storage ----------

function loadProfiles() {
  const p = getProfilesPath();
  try {
    if (fs.existsSync(p)) {
      const profiles = JSON.parse(fs.readFileSync(p, 'utf-8'));
      dbgLog(`[profiles] loaded ${profiles.length} profiles from "${p}"`);
      return profiles;
    }
    dbgLog(`[profiles] no file at "${p}" — returning empty list`);
  } catch (e) {
    dbgLog(`[profiles] ERROR loading from "${p}": ${e.message}`);
    console.error('Failed to load profiles:', e);
  }
  return [];
}

function saveProfiles(profiles) {
  const p = getProfilesPath();
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(profiles, null, 2), 'utf-8');
    dbgLog(`[profiles] saved ${profiles.length} profiles to "${p}"`);
  } catch (e) {
    dbgLog(`[profiles] ERROR saving to "${p}": ${e.message}`);
    console.error('Failed to save profiles:', e);
  }
}

ipcMain.handle('profiles:load', () => loadProfiles());

ipcMain.handle('profiles:save', (event, profiles) => {
  saveProfiles(profiles);
  return true;
});

// ---------- Settings ----------

ipcMain.handle('settings:load', () => {
  const s = loadSettings();
  s.profilesPath = getProfilesPath();
  dbgLog(`[settings] loaded mcpEnabled=${s.mcpEnabled} mcpPort=${s.mcpPort||'default'} debugLogging=${s.debugLogging} profilesPath="${s.profilesPath}"`);
  return s;
});

ipcMain.handle('settings:save', (event, settings) => {
  const oldPath = getProfilesPath();
  saveSettings(settings);
  const newPath = getProfilesPath();
  dbgLog(`[settings] saved mcpEnabled=${settings.mcpEnabled} mcpPort=${settings.mcpPort||'default'} debugLogging=${settings.debugLogging}`);
  if (oldPath !== newPath) {
    dbgLog(`[settings] profiles path changed "${oldPath}" → "${newPath}"`);
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      try {
        const dir = path.dirname(newPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(oldPath, newPath);
        dbgLog(`[settings] migrated profiles file to "${newPath}"`);
      } catch (e) {
        dbgLog(`[settings] ERROR migrating profiles file: ${e.message}`);
        console.error('Failed to migrate profiles file:', e);
      }
    }
  }
  if (settings.mcpEnabled) {
    if (!bridge.isRunning()) startBridgeIfEnabled();
  } else {
    if (bridge.isRunning()) dbgLog('[settings] mcpEnabled=false — stopping bridge');
    bridge.stop();
  }
  return true;
});

ipcMain.handle('mcp:status', () => ({
  running: bridge.isRunning(),
  port:    bridge.getPort(),
}));

// ── MCP auto-registration ────────────────────────────────────────────────────
// Finds an executable by trying `which` first, then a list of fallback paths.
function findExec(name, fallbacks = []) {
  return new Promise((resolve) => {
    require('child_process').execFile('/usr/bin/which', [name], (err, stdout) => {
      if (!err && stdout.trim()) return resolve(stdout.trim());
      for (const p of fallbacks) {
        if (fs.existsSync(p)) return resolve(p);
      }
      resolve(null);
    });
  });
}

ipcMain.handle('mcp:register', async () => {
  // When packaged, node_modules are inside the asar and can't be loaded by external Node.
  // Solution: copy server.js to ~/.prateek-term/mcp/ and install its deps there.
  let serverPath;
  if (app.isPackaged) {
    const mcpDir = path.join(os.homedir(), '.prateek-term', 'mcp');
    if (!fs.existsSync(mcpDir)) fs.mkdirSync(mcpDir, { recursive: true });
    const srcServer = path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'src', 'mcp', 'server.js');
    const destServer = path.join(mcpDir, 'server.js');
    fs.copyFileSync(srcServer, destServer);
    // Install MCP SDK if not present
    const destPkg = path.join(mcpDir, 'package.json');
    if (!fs.existsSync(destPkg)) {
      fs.writeFileSync(destPkg, JSON.stringify({ name: 'prateek-term-mcp', private: true, dependencies: { '@modelcontextprotocol/sdk': '*' } }));
    }
    const nodeModules = path.join(mcpDir, 'node_modules', '@modelcontextprotocol');
    if (!fs.existsSync(nodeModules)) {
      const { execSync } = require('child_process');
      // Electron packaged apps have a minimal PATH that often excludes
      // /opt/homebrew/bin and /usr/local/bin where npm/node live.
      // Extend PATH so npm can be found regardless of install location.
      const extraPaths = [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        path.join(os.homedir(), '.npm-global', 'bin'),
      ];
      const envPATH = (process.env.PATH || '') + ':' + extraPaths.join(':');
      try {
        dbgLog(`[MCP] npm install in ${mcpDir}`);
        execSync('npm install --omit=dev', { cwd: mcpDir, timeout: 60000, stdio: 'pipe', env: { ...process.env, PATH: envPATH } });
        dbgLog('[MCP] npm install succeeded');
      } catch (e) {
        dbgLog(`[MCP ERROR] npm install failed: ${e.message}`);
      }
    }
    serverPath = destServer;
  } else {
    serverPath = path.join(app.getAppPath(), 'src', 'mcp', 'server.js');
  }
  const results = {};

  const [nodePath, claudePath] = await Promise.all([
    findExec('node', [
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      '/usr/bin/node',
    ]),
    findExec('claude', [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
      path.join(os.homedir(), '.local', 'bin', 'claude'),
    ]),
  ]);

  // ── Claude Code ──────────────────────────────────────────────────────────
  if (!claudePath) {
    results.claudeCode = { ok: false, message: 'claude CLI not found — install Claude Code first.' };
  } else if (!nodePath) {
    results.claudeCode = { ok: false, message: 'node not found — install Node.js first.' };
  } else {
    await new Promise((resolve) => {
      const cmd = `"${claudePath}" mcp add --scope user --transport stdio prateek-term -- "${nodePath}" "${serverPath}"`;
      exec(cmd, (err, stdout, stderr) => {
        if (!err) {
          results.claudeCode = { ok: true, message: 'Registered with Claude Code.' };
        } else {
          const msg = (stderr || err.message || '').toLowerCase();
          if (msg.includes('already') || msg.includes('exists')) {
            results.claudeCode = { ok: true, message: 'Already registered with Claude Code.' };
          } else {
            results.claudeCode = { ok: false, message: stderr || err.message };
          }
        }
        resolve();
      });
    });
  }

  // ── Claude Desktop ───────────────────────────────────────────────────────
  const desktopCfgPath = path.join(
    os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'
  );
  try {
    let cfg = {};
    if (fs.existsSync(desktopCfgPath)) {
      cfg = JSON.parse(fs.readFileSync(desktopCfgPath, 'utf8'));
    }
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers['prateek-term'] = {
      command: nodePath || 'node',
      args: [serverPath],
    };
    const dir = path.dirname(desktopCfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(desktopCfgPath, JSON.stringify(cfg, null, 2), 'utf8');
    results.claudeDesktop = { ok: true, message: 'Registered with Claude Desktop.' };
  } catch (e) {
    results.claudeDesktop = { ok: false, message: e.message };
  }

  return results;
});

ipcMain.handle('settings:choose-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose hosts file location',
    properties: ['openDirectory'],
    message: 'Select the folder where Prateek-Term will store connection-profiles.json',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return path.join(result.filePaths[0], 'connection-profiles.json');
});

// ===== Session Persistence =====

const SESSION_PATH = path.join(app.getPath('userData'), 'session.json');

// Synchronous save so beforeunload can block until written
ipcMain.on('session:save-sync', (event, data) => {
  try {
    fs.writeFileSync(SESSION_PATH, JSON.stringify(data, null, 2), 'utf8');
    dbgLog(`[session] saved ${(data.tabs||[]).length} tabs to "${SESSION_PATH}"`);
  } catch (e) {
    dbgLog(`[session] save error: ${e.message}`);
  }
  event.returnValue = true;
});

ipcMain.handle('session:load', () => {
  try {
    if (!fs.existsSync(SESSION_PATH)) return null;
    const raw = fs.readFileSync(SESSION_PATH, 'utf8');
    const data = JSON.parse(raw);
    dbgLog(`[session] loaded ${(data.tabs||[]).length} tabs saved at ${data.savedAt}`);
    return data;
  } catch (e) {
    dbgLog(`[session] load error: ${e.message}`);
    return null;
  }
});

ipcMain.on('session:clear', () => {
  try {
    if (fs.existsSync(SESSION_PATH)) fs.unlinkSync(SESSION_PATH);
    dbgLog('[session] cleared');
  } catch (e) {
    dbgLog(`[session] clear error: ${e.message}`);
  }
});

// ===== Debug Log IPC =====

ipcMain.handle('debug:getLog', () => {
  try {
    if (!fs.existsSync(DEBUG_LOG_PATH)) return { content: '', path: DEBUG_LOG_PATH, size: 0 };
    const content = fs.readFileSync(DEBUG_LOG_PATH, 'utf8');
    const size = fs.statSync(DEBUG_LOG_PATH).size;
    return { content, path: DEBUG_LOG_PATH, size };
  } catch (e) {
    return { content: `Error reading log: ${e.message}`, path: DEBUG_LOG_PATH, size: 0 };
  }
});

ipcMain.on('debug:clearLog', () => {
  try { if (fs.existsSync(DEBUG_LOG_PATH)) fs.writeFileSync(DEBUG_LOG_PATH, ''); } catch {}
});

ipcMain.on('debug:openLogFolder', () => {
  const { shell } = require('electron');
  // Ensure file exists so Finder can highlight it
  if (!fs.existsSync(DEBUG_LOG_PATH)) {
    try { fs.writeFileSync(DEBUG_LOG_PATH, ''); } catch {}
  }
  shell.showItemInFolder(DEBUG_LOG_PATH);
});

// ---------- SSH Config Import / Export ----------
// parseSSHConfig and profilesToSSHConfig are imported from ./ssh-utils.js

ipcMain.handle('profiles:import-ssh-config', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import SSH Config',
    message: 'Select an OpenSSH config file (e.g. ~/.ssh/config)',
    properties: ['openFile'],
    filters: [
      { name: 'SSH Config', extensions: ['config', 'conf', 'cfg', '*'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return null;
  try {
    const text = fs.readFileSync(res.filePaths[0], 'utf-8');
    return parseSSHConfig(text);
  } catch (e) {
    console.error('SSH config import failed:', e);
    return null;
  }
});

ipcMain.handle('profiles:import-json', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Prateek-Term JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf-8'));
    return Array.isArray(data) ? data : null;
  } catch (e) {
    return null;
  }
});

ipcMain.handle('profiles:export-ssh-config', async (event, profiles) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export as SSH Config',
    defaultPath: path.join(process.env.HOME || '', 'prateek-term-hosts.ssh'),
    filters: [
      { name: 'SSH Config', extensions: ['ssh', 'config', 'conf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePath) return false;
  try {
    fs.writeFileSync(res.filePath, profilesToSSHConfig(profiles), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('profiles:export-json', async (event, profiles) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export as JSON',
    defaultPath: path.join(process.env.HOME || '', 'prateek-term-hosts.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return false;
  try {
    fs.writeFileSync(res.filePath, JSON.stringify(profiles, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
});

// ── Actions export ────────────────────────────────────────────────────────
ipcMain.handle('actions:export', async (_, actions) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Actions',
    defaultPath: path.join(process.env.HOME || '', 'actions-export.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return false;
  try {
    // Strip IDs — they are regenerated on import
    const payload = actions.map(({ name, script }) => ({ name, script }));
    fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
});

// ── Actions import ────────────────────────────────────────────────────────
ipcMain.handle('actions:import', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Actions',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf-8'));
    if (!Array.isArray(data)) return null;
    // Accept objects that have at least a non-empty name string
    return data.filter(a => a && typeof a.name === 'string' && a.name.trim());
  } catch (e) {
    return null;
  }
});

// ── User Guide window ────────────────────────────────────────────────────
let userGuideWindow = null;
function openUserGuide() {
  if (userGuideWindow && !userGuideWindow.isDestroyed()) {
    userGuideWindow.focus();
    return;
  }
  userGuideWindow = new BrowserWindow({
    width: 1020,
    height: 860,
    minWidth: 700,
    minHeight: 500,
    title: 'Prateek-Term — User Guide',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // In dev: docs/ is at project root. When packaged: extraResources puts it in Resources/docs/
  const guidePath = app.isPackaged
    ? path.join(process.resourcesPath, 'docs', 'user-guide.html')
    : path.join(__dirname, '../../docs/user-guide.html');
  userGuideWindow.loadFile(guidePath, { query: { v: app.getVersion() } });
  userGuideWindow.on('closed', () => { userGuideWindow = null; });
}

// ── Help window ──────────────────────────────────────────────────────────
let helpWindow = null;
ipcMain.handle('help:open', () => {
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.focus();
    return;
  }
  helpWindow = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 700,
    minHeight: 500,
    title: 'Prateek-Term — Help',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Use the canonical user-guide.html — single source of truth for all docs.
  const guidePath = app.isPackaged
    ? path.join(process.resourcesPath, 'docs', 'user-guide.html')
    : path.join(__dirname, '../../docs/user-guide.html');
  helpWindow.loadFile(guidePath, { query: { v: app.getVersion() } });
  helpWindow.on('closed', () => { helpWindow = null; });
});

// ── Renderer error bridge ────────────────────────────────────────────────
ipcMain.on('debug:rendererError', (_, msg) => {
  dbgLog(`[renderer-error] ${msg}`);
});

// ── Default Terminal IPC ─────────────────────────────────────────────────

ipcMain.handle('defaultTerminal:isDefault', () => {
  dbgLog('[default-terminal] isDefault query');
  if (!defaultTerminalAddon) return { isDefault: false, nativeAvailable: false };
  return {
    isDefault: defaultTerminalAddon.isDefaultTerminal(),
    nativeAvailable: defaultTerminalAddon.nativeAvailable,
    currentBundleId: defaultTerminalAddon.getDefaultTerminalBundleId(),
  };
});

ipcMain.handle('defaultTerminal:set', () => {
  dbgLog('[default-terminal] set as default requested');
  if (!defaultTerminalAddon || !defaultTerminalAddon.nativeAvailable) {
    return { ok: false, error: 'Native addon not compiled. Run: npm run rebuild:native' };
  }
  try {
    defaultTerminalAddon.setDefaultTerminal();
    dbgLog('[default-terminal] setDefaultTerminal() called');
    return { ok: true };
  } catch (e) {
    dbgLog(`[default-terminal] setDefaultTerminal failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ── Update IPC ───────────────────────────────────────────────────────────
ipcMain.handle('update:check',       (_, opts) => checkForUpdates(opts?.includePrerelease));
ipcMain.handle('update:get-version', ()        => getVersionInfo());
ipcMain.on(   'update:open-url',     (_, url)  => shell.openExternal(url));

ipcMain.handle('dialog:openFile', async (event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Select File',
    properties: ['openFile'],
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('dialog:selectDirectory', async (event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Select Directory',
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// ---------- Remote CWD Detection ----------

ipcMain.handle('terminal:getCwd', (event, { id }) => {
  const term = terminals.get(id);
  if (!term || !term.pid) {
    dbgLog(`[pty:${id}] getCwd — terminal not found or no pid`);
    return null;
  }
  try {
    // Read CWD directly from the shell process — no commands injected into the terminal.
    // lsof -p <pid> -a -d cwd -Fn emits lines like "fcwd" then "n/path/to/dir".
    const output = require('child_process').execFileSync(
      'lsof', ['-p', String(term.pid), '-a', '-d', 'cwd', '-Fn'],
      { timeout: 2000, encoding: 'utf8' }
    );
    const line = output.split('\n').find(l => l.startsWith('n'));
    const cwd = line ? line.slice(1).trim() : null;
    dbgLog(`[pty:${id}] getCwd pid=${term.pid} → "${cwd||'(null)'}"`);
    return cwd;
  } catch (e) {
    dbgLog(`[pty:${id}] getCwd lsof failed pid=${term.pid} err="${e.message}"`);
    return null;
  }
});

// ---------- SCP Drag-and-Drop Upload ----------

ipcMain.handle('scp:upload', (event, { filePath, fileName, profile, remotePath }) => {
  const transferId = ++scpTransferId;
  const senderContents = event.sender; // send events back to originating window

  const flags = ['-O']; // Force legacy SCP protocol — many embedded devices lack SFTP subsystem

  // Recursive flag for directories
  let isDirectory = false;
  try { isDirectory = fs.statSync(filePath).isDirectory(); } catch { /* let scp report the error */ }
  if (isDirectory) flags.push('-r');
  dbgLog(`[scp:${transferId}] upload "${fileName}" → ${profile.username||''}@${profile.host}:${remotePath||'~/'} isDir=${isDirectory} pemFile=${!!profile.pemFile}`);

  if (profile.pemFile) {
    flags.push('-i', profile.pemFile);
  }

  if (profile.strictHostOff) {
    flags.push('-o', 'StrictHostKeyChecking=no');
    flags.push('-o', 'UserKnownHostsFile=/dev/null');
  }

  if (profile.compression) flags.push('-C');

  if (profile.port && profile.port !== 22) {
    flags.push('-P', String(profile.port));
  }

  const userHost = profile.username
    ? `${profile.username}@${profile.host}`
    : profile.host;

  const dest = remotePath ? `${remotePath}/` : '~/';
  flags.push(filePath, `${userHost}:${dest}`);

  const wrapped = wrapWithSshpass('scp', flags, profile);
  const env = { ...process.env, ...(wrapped.env || {}) };
  env.TERM = 'xterm-256color';

  let proc;
  try {
    proc = pty.spawn(wrapped.command, wrapped.args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 10,
      cwd: process.env.HOME || '/',
      env,
    });
  } catch (err) {
    return { transferId, error: err.message };
  }

  scpTransfers.set(transferId, proc);

  const progressRegex = /(\d+)%/;
  proc.onData((data) => {
    const match = data.match(progressRegex);
    if (match && !senderContents.isDestroyed()) {
      senderContents.send('scp:progress', {
        transferId,
        fileName,
        percent: parseInt(match[1], 10),
      });
    }
  });

  proc.onExit(({ exitCode }) => {
    scpTransfers.delete(transferId);
    dbgLog(`[scp:${transferId}] exit code=${exitCode} file="${fileName}"`);
    if (!senderContents.isDestroyed()) {
      senderContents.send('scp:complete', {
        transferId,
        fileName,
        success: exitCode === 0,
        error: exitCode !== 0 ? `SCP exited with code ${exitCode}` : null,
      });
    }
  });

  return { transferId };
});

ipcMain.on('scp:cancel', (event, { transferId }) => {
  const proc = scpTransfers.get(transferId);
  if (proc) {
    dbgLog(`[scp:${transferId}] cancelled by user`);
    proc.kill();
    scpTransfers.delete(transferId);
  }
});

// Save pasted PEM key to a temp file with 0600 permissions and return its path
ipcMain.handle('key:saveTempKey', (event, pemContent) => {
  const keysDir = path.join(app.getPath('userData'), 'temp-keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  }

  const hash = crypto.createHash('sha256').update(pemContent).digest('hex').slice(0, 12);
  const keyPath = path.join(keysDir, `pasted-key-${hash}`);

  fs.writeFileSync(keyPath, pemContent, { mode: 0o600 });
  dbgLog(`[key] saved pasted PEM to "${keyPath}" (hash=${hash})`);
  return keyPath;
});

// ===== Session Logging =====

const logStreams = new Map(); // logId → fs.WriteStream

/**
 * Strip all ANSI/VT escape sequences from a string so log files contain
 * only printable text.  Handles:
 *   • CSI sequences  ESC [ ... final      (colours, cursor, erase, etc.)
 *   • OSC sequences  ESC ] ... BEL/ST     (window title, hyperlinks)
 *   • DCS / PM / APC / SOS               (device control / paste mode)
 *   • Simple 2-char ESC sequences         (ESC c, ESC =, ESC >, …)
 *   • Lone CR (\r) not followed by LF     (terminal carriage returns)
 *   • C0 control chars except \t \n \r
 */
function stripAnsi(raw) {
  return raw
    // OSC:  ESC ] ... (BEL or ESC \)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // DCS / PM / APC / SOS:  ESC [P X ^ _] ... ST
    .replace(/\x1b[PX\^_][^\x1b]*(?:\x1b\\|$)/g, '')
    // CSI:  ESC [ [param bytes] [intermediate bytes] final byte
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    // Other 2-char ESC sequences  ESC <char>
    .replace(/\x1b[\x20-\x7e]/g, '')
    // Bare ESC (shouldn't be left but clean up)
    .replace(/\x1b/g, '')
    // C0 controls except TAB (\x09), LF (\x0a), CR (\x0d)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Lone CR → newline so lines don't overwrite each other in text editors
    .replace(/\r(?!\n)/g, '\n');
}

ipcMain.handle('log:start', async () => {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const defaultName = `session_${stamp}.log`;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Session Log',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }, { name: 'All Files', extensions: ['*'] }],
  });

  if (result.canceled || !result.filePath) {
    dbgLog('[log] session log dialog cancelled');
    return null;
  }

  const logId = `log-${Date.now()}`;
  const stream = fs.createWriteStream(result.filePath, { flags: 'a', encoding: 'utf8' });
  logStreams.set(logId, stream);
  dbgLog(`[log:${logId}] started → "${result.filePath}"`);
  return { logId, filePath: result.filePath };
});

ipcMain.on('log:write', (event, { logId, data }) => {
  const stream = logStreams.get(logId);
  if (stream) stream.write(stripAnsi(data));
});

ipcMain.on('log:stop', (event, { logId }) => {
  const stream = logStreams.get(logId);
  if (stream) {
    dbgLog(`[log:${logId}] stopped`);
    stream.end();
    logStreams.delete(logId);
  }
});

// ===== Serial Port Handlers =====

ipcMain.handle('serial:list-ports', async () => {
  const ports = await SerialPort.list();
  dbgLog(`[serial] list-ports found ${ports.length}: ${ports.map(p=>p.path).join(', ')||'(none)'}`);
  return ports;
});

ipcMain.handle('serial:connect', (event, { port, baudRate, dataBits, stopBits, parity, rtscts, xon }) => {
  dbgLog(`[serial] connect port="${port}" baud=${baudRate} data=${dataBits} stop=${stopBits} parity=${parity} rtscts=${!!rtscts} xon=${!!xon}`);
  return new Promise((resolve, reject) => {
    const id = `serial-${Date.now()}`;
    const sp = new SerialPort({
      path: port,
      baudRate: parseInt(baudRate, 10),
      dataBits: parseInt(dataBits, 10),
      stopBits: parseFloat(stopBits),
      parity,
      rtscts: !!rtscts,
      xon: !!xon,
      autoOpen: false,
    });

    sp.open((err) => {
      if (err) {
        dbgLog(`[serial] open FAILED port="${port}" err="${err.message}"`);
        reject(new Error(err.message));
        return;
      }
      dbgLog(`[serial:${id}] opened port="${port}"`);

      sp.on('data', (data) => {
        const str = data.toString('binary');
        if (!event.sender.isDestroyed()) {
          event.sender.send('serial:data', { id, data: str });
        }
        // Feed MCP output buffer (no-op if session is not MCP-managed)
        bridge.appendOutput(id, str);
      });

      sp.on('close', () => {
        dbgLog(`[serial:${id}] closed port="${port}"`);
        serialConnections.delete(id);
        if (!event.sender.isDestroyed()) {
          event.sender.send('serial:exit', { id });
        }
      });

      sp.on('error', (spErr) => {
        dbgLog(`[serial:${id}] error: "${spErr.message}"`);
        if (!event.sender.isDestroyed()) {
          event.sender.send('serial:exit', { id, error: spErr.message });
        }
      });

      serialConnections.set(id, sp);
      resolve({ id });
    });
  });
});

ipcMain.on('serial:write', (event, { id, data }) => {
  const sp = serialConnections.get(id);
  if (sp?.isOpen) sp.write(Buffer.from(data, 'binary'));
});

ipcMain.on('serial:close', (event, { id }) => {
  const sp = serialConnections.get(id);
  if (sp?.isOpen) sp.close();
  serialConnections.delete(id);
});

// ── MCP Bridge lifecycle helpers ──────────────────────────────────────────────

function buildSSHCommandForProfile(profile) {
  // If the profile uses a pasted PEM key, write it to a temp file so SSH can use it
  let resolvedProfile = profile;
  const cleanupFiles = [];
  if (profile.pemText && !profile.pemFile) {
    const keysDir = path.join(app.getPath('userData'), 'temp-keys');
    if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
    const hash = crypto.createHash('sha256').update(profile.pemText).digest('hex').slice(0, 12);
    const keyPath = path.join(keysDir, `pasted-key-${hash}`);
    fs.writeFileSync(keyPath, profile.pemText, { mode: 0o600 });
    resolvedProfile = { ...profile, pemFile: keyPath };
    cleanupFiles.push(keyPath);
  }

  if (resolvedProfile.protocol === 'ssh') {
    const result = buildSSHCommand(resolvedProfile);
    const cmd = { ...result, _cleanupFiles: [...(result._cleanupFiles || []), ...cleanupFiles] };
    dbgLog(`[MCP bridge] SSH command: ${cmd.command} ${cmd.args.join(' ')}`);
    return cmd;
  }
  switch ((resolvedProfile.protocol || '').toLowerCase()) {
    case 'telnet': return buildTelnetCommand(resolvedProfile);
    case 'ftp':    return buildFTPCommand(resolvedProfile);
    default:
      dbgLog(`[MCP] non-SSH protocol "${resolvedProfile.protocol}" — falling back to local shell`);
      return { command: findShell(), args: ['-l'], env: {}, _cleanupFiles: cleanupFiles };
  }
}

function spawnPtyForBridge(options) {
  const shell    = options.shell || findShell();
  const args     = options.args  || ['-l'];
  let   cwd      = process.env.HOME || '/';
  const env      = { ...process.env, ...(options.env || {}) };
  env.TERM       = 'xterm-256color';
  env.COLORTERM  = 'truecolor';
  if (!env.LANG)   env.LANG   = 'en_US.UTF-8';
  if (!env.LC_ALL) env.LC_ALL = 'en_US.UTF-8';
  // Ensure SSH can find the agent socket (Electron launched from Dock may strip it)
  if (!env.SSH_AUTH_SOCK) {
    try {
      const tmpDir = '/private/tmp';
      const launchdDirs = fs.readdirSync(tmpDir).filter(d => d.startsWith('com.apple.launchd.'));
      for (const d of launchdDirs) {
        const sock = path.join(tmpDir, d, 'Listeners');
        if (fs.existsSync(sock)) { env.SSH_AUTH_SOCK = sock; break; }
      }
    } catch { /* no agent — IdentitiesOnly=yes on key profiles will handle this */ }
  }
  delete env.SSH_ASKPASS;
  delete env.SSH_ASKPASS_REQUIRE;
  dbgLog(`[MCP bridge] spawnPtyForBridge: shell=${shell} args=[${args.join(', ')}] SSH_AUTH_SOCK=${env.SSH_AUTH_SOCK || 'unset'}`);

  const id   = ++terminalIdCounter;
  // Register the output buffer BEFORE spawning so no early PTY data is lost
  bridge.ensureBuf(id);
  const term = pty.spawn(shell, args, { name: 'xterm-256color', cols: options.cols || 200, rows: options.rows || 50, cwd, env });
  terminals.set(id, term);

  term.onData((data) => {
    bridge.appendOutput(id, data);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:data', { id, data });
    }
  });

  // Auto-type password for password-auth SSH sessions created via MCP
  let pwdBuf = '';
  const pendingPwd = options._pendingPassword || null;
  if (pendingPwd) {
    term.onData((data) => {
      pwdBuf = (pwdBuf + data).slice(-256);
      if (/password/i.test(pwdBuf)) {
        pwdBuf = '';
        setTimeout(() => term.write(pendingPwd + '\r'), 300);
      }
    });
  }

  const cleanupFiles = options._cleanupFiles || [];
  term.onExit(() => {
    terminals.delete(id);
    for (const f of cleanupFiles) { try { fs.unlinkSync(f); } catch { /* gone */ } }
  });

  return Promise.resolve({ id: String(id) });
}

function serialConnectForBridge(opts) {
  return new Promise((resolve, reject) => {
    const id = `serial-mcp-${Date.now()}`;
    const sp = new SerialPort({
      path: opts.port, baudRate: parseInt(opts.baudRate, 10) || 115200,
      dataBits: parseInt(opts.dataBits, 10) || 8, stopBits: parseFloat(opts.stopBits) || 1,
      parity: opts.parity || 'none', autoOpen: false,
    });
    sp.open((err) => {
      if (err) return reject(new Error(err.message));
      sp.on('data', (data) => { bridge.appendOutput(id, data.toString('binary')); });
      sp.on('close', () => { serialConnections.delete(id); });
      serialConnections.set(id, sp);
      resolve({ id });
    });
  });
}

function startBridgeIfEnabled() {
  const settings = loadSettings();
  if (!settings.mcpEnabled) { dbgLog('[MCP] disabled in settings — bridge not started'); return; }
  if (bridge.isRunning()) { dbgLog('[MCP] bridge already running'); return; }
  dbgLog(`[MCP] starting bridge on port ${settings.mcpPort || 29419}`);
  bridge.start({
    terminals,
    serialConns:     serialConnections,
    loadProfiles:    () => loadProfiles(),
    connectProfile:  (p) => Promise.resolve(buildSSHCommandForProfile(p)),
    spawnPty:        spawnPtyForBridge,
    writeInput:      (id, data) => { const t = terminals.get(Number(id)); if (t) t.write(data); },
    killSession:     (id) => { const t = terminals.get(Number(id)); if (t) { t.kill(); terminals.delete(Number(id)); } },
    listSerialPorts: () => SerialPort.list(),
    serialConnect:   serialConnectForBridge,
    serialWrite:     (id, data) => { const sp = serialConnections.get(id); if (sp?.isOpen) sp.write(Buffer.from(data, 'binary')); },
    serialClose:     (id) => { const sp = serialConnections.get(id); if (sp?.isOpen) sp.close(); serialConnections.delete(id); },
    getVersion:      () => app.getVersion(),
    port:            settings.mcpPort || 29419,
    log:             (msg) => dbgLog(`[MCP] ${msg}`),
    logErr:          (msg) => dbgLog(`[MCP ERROR] ${msg}`),
  });
}
