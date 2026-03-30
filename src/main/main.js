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
  try {
    const res = await fetch(`${RELEASES_API}?per_page=10`, {
      headers: { 'User-Agent': 'prateek-term', Accept: 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const releases = await res.json();
    if (!Array.isArray(releases)) return null;

    // Find the newest release matching channel preference
    const candidate = releases.find(r => !r.draft && (includePrerelease || !r.prerelease));
    if (!candidate) return null;

    const remoteVersion = (candidate.tag_name || '').replace(/^v/, '');
    const localVersion  = app.getVersion();
    if (remoteVersion && isVersionNewer(remoteVersion, localVersion)) {
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
    return null;
  } catch {
    return null; // network errors are always silent
  }
}

const { SerialPort } = require('serialport');

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
// This is how the Automator Quick Action sends folders — no URL encoding needed.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (!filePath) return;
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('open-folder', filePath);
  } else {
    pendingFolderPaths.push(filePath);
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
    title: 'Prateek-Term',
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
  createWindow();

  // Check for updates on startup (5s delay so window is fully rendered first)
  // and then every 6 hours. Errors are silent.
  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
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
  const id = ++terminalIdCounter;
  const shell = options.shell || findShell();
  // Use -l (login shell) by default so ~/.bash_profile / ~/.zprofile are sourced
  // and the PTY inherits the user's full PATH (NVM, Homebrew, Go, etc.) — the same
  // environment iTerm2 and Terminal.app provide. Callers can pass args: [] explicitly
  // to opt out (e.g. SSH or custom shell connections that manage their own env).
  const args = options.args || ['-l'];

  let cwd = options.cwd || process.env.HOME || '/';
  try {
    fs.accessSync(cwd, fs.constants.R_OK);
  } catch {
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
  // Only delete SSH_ASKPASS/SSH_ASKPASS_REQUIRE if we haven't set them ourselves
  // for password injection (wrapWithAskpass sets them to our temp helper script).
  if (!options.env?.SSH_ASKPASS) {
    delete env.SSH_ASKPASS;
    delete env.SSH_ASKPASS_REQUIRE;
  }

  let term;
  try {
    term = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env,
    });
  } catch (err) {
    console.error(`Failed to spawn shell "${shell}" in "${cwd}":`, err.message);
    term = pty.spawn('/bin/sh', args, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: '/',
      env,
    });
  }

  terminals.set(id, term);

  term.onData((data) => {
    // term._cwdMute is set during getRemoteCwd probes to suppress the
    // probe command and its output from appearing in the terminal view.
    if (mainWindow && !mainWindow.isDestroyed() && !term._cwdMute) {
      mainWindow.webContents.send('terminal:data', { id, data });
    }
  });

  // Collect askpass temp scripts to delete when the PTY exits
  const cleanupFiles = options._cleanupFiles || [];

  term.onExit(({ exitCode, signal }) => {
    terminals.delete(id);
    // Clean up SSH_ASKPASS helper scripts written by wrapWithAskpass
    for (const f of cleanupFiles) {
      try { fs.unlinkSync(f); } catch { /* already gone */ }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:exit', { id, exitCode, signal });
    }
  });

  const debugCmd = [shell, ...args].join(' ');
  return { id, debugCmd };
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
    term.kill();
    terminals.delete(id);
  }
});

// ---------- Connection Protocol Handlers ----------
// All command-building functions are imported from ./ssh-utils.js

ipcMain.handle('connection:connect', (event, profile) => {
  if (profile.protocol === 'ssh') {
    const mode = profile.sshMode || 'terminal';
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
      throw new Error(`Unknown protocol: ${profile.protocol}`);
  }
});

// ---------- Connection Profile Storage ----------

function loadProfiles() {
  const p = getProfilesPath();
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (e) {
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
  } catch (e) {
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
  // Always surface the resolved path so renderer can display it
  s.profilesPath = getProfilesPath();
  return s;
});

ipcMain.handle('settings:save', (event, settings) => {
  // If the user picked a new path, migrate the profiles file there
  const oldPath = getProfilesPath();
  saveSettings(settings);
  const newPath = getProfilesPath();
  if (oldPath !== newPath && fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    try {
      const dir = path.dirname(newPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(oldPath, newPath);
    } catch (e) {
      console.error('Failed to migrate profiles file:', e);
    }
  }
  return true;
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
  helpWindow.loadFile(path.join(__dirname, '..', 'renderer', 'help.html'));
  helpWindow.on('closed', () => { helpWindow = null; });
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
  return new Promise((resolve) => {
    const term = terminals.get(id);
    if (!term) return resolve(null);

    const marker = `__SANKET_CWD_${Date.now()}__`;
    let buffer = '';
    let resolved = false;

    const dispose = term.onData((data) => {
      if (resolved) return;
      buffer += data;
      // Skip past the echo of the command (first \r\n) to avoid matching
      // the marker strings that appear literally in the echoed command text
      const echoEnd = buffer.indexOf('\r\n');
      const searchFrom = echoEnd !== -1 ? echoEnd + 2 : 0;
      const start = buffer.indexOf(marker + 'S', searchFrom);
      const end = buffer.indexOf(marker + 'E', searchFrom);
      if (start !== -1 && end !== -1) {
        resolved = true;
        dispose.dispose();
        term._cwdMute = false;
        const cwd = buffer
          .substring(start + marker.length + 1, end)
          .replace(/\r?\n/g, '')
          .trim();
        resolve(cwd || null);
      }
    });

    // Mute terminal output to the renderer while the probe runs so the
    // printf command and its response are never visible to the user.
    term._cwdMute = true;

    // Use printf to emit markers around pwd output.
    // The marker is split across two shell string literals so the echo of
    // this command does NOT contain the full markerS / markerE tokens,
    // preventing false-positive detection from the echoed input line.
    const half = Math.ceil(marker.length / 2);
    const m1 = marker.slice(0, half);
    const m2 = marker.slice(half);
    term.write(`printf '${m1}''${m2}S%s${m1}''${m2}E' "$(pwd)"\n`);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        dispose.dispose();
        term._cwdMute = false;
        resolve(null);
      }
    }, 3000);
  });
});

// ---------- SCP Drag-and-Drop Upload ----------

ipcMain.handle('scp:upload', (event, { filePath, fileName, profile, remotePath }) => {
  const transferId = ++scpTransferId;
  const senderContents = event.sender; // send events back to originating window

  const flags = [];

  // Recursive flag for directories
  let isDirectory = false;
  try { isDirectory = fs.statSync(filePath).isDirectory(); } catch { /* let scp report the error */ }
  if (isDirectory) flags.push('-r');

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

  if (result.canceled || !result.filePath) return null;

  const logId = `log-${Date.now()}`;
  const stream = fs.createWriteStream(result.filePath, { flags: 'a', encoding: 'utf8' });
  logStreams.set(logId, stream);
  return { logId, filePath: result.filePath };
});

ipcMain.on('log:write', (event, { logId, data }) => {
  const stream = logStreams.get(logId);
  if (stream) stream.write(stripAnsi(data));
});

ipcMain.on('log:stop', (event, { logId }) => {
  const stream = logStreams.get(logId);
  if (stream) { stream.end(); logStreams.delete(logId); }
});

// ===== Serial Port Handlers =====

ipcMain.handle('serial:list-ports', async () => {
  return await SerialPort.list();
});

ipcMain.handle('serial:connect', (event, { port, baudRate, dataBits, stopBits, parity, rtscts, xon }) => {
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
        reject(new Error(err.message));
        return;
      }

      sp.on('data', (data) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('serial:data', { id, data: data.toString('binary') });
        }
      });

      sp.on('close', () => {
        serialConnections.delete(id);
        if (!event.sender.isDestroyed()) {
          event.sender.send('serial:exit', { id });
        }
      });

      sp.on('error', (spErr) => {
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
