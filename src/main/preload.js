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

// webUtils was introduced in Electron 29; falls back gracefully on Electron ≤ 28
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('terminalAPI', {
  // Terminal operations
  createTerminal: (options) => ipcRenderer.invoke('terminal:create', options),
  sendInput: (id, data) => ipcRenderer.send('terminal:input', { id, data }),
  resizeTerminal: (id, cols, rows) =>
    ipcRenderer.send('terminal:resize', { id, cols, rows }),
  killTerminal: (id) => ipcRenderer.send('terminal:kill', { id }),
  onTerminalData: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', callback);
  },

  // Connection operations
  connect: (profile) => ipcRenderer.invoke('connection:connect', profile),

  // Profile operations
  loadProfiles: () => ipcRenderer.invoke('profiles:load'),
  saveProfiles: (profiles) => ipcRenderer.invoke('profiles:save', profiles),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseProfilesPath: () => ipcRenderer.invoke('settings:choose-path'),

  // Import / Export
  importSSHConfig: () => ipcRenderer.invoke('profiles:import-ssh-config'),
  importJSON: () => ipcRenderer.invoke('profiles:import-json'),
  exportSSHConfig: (profiles) => ipcRenderer.invoke('profiles:export-ssh-config', profiles),
  exportJSON: (profiles) => ipcRenderer.invoke('profiles:export-json', profiles),
  exportActions: (actions) => ipcRenderer.invoke('actions:export', actions),
  importActions: () => ipcRenderer.invoke('actions:import'),

  // Dialog operations
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  selectDirectoryDialog: (options) =>
    ipcRenderer.invoke('dialog:selectDirectory', options),

  // Key operations
  saveTempKey: (pemContent) => ipcRenderer.invoke('key:saveTempKey', pemContent),

  // Remote CWD detection
  getRemoteCwd: (id) => ipcRenderer.invoke('terminal:getCwd', { id }),

  // SCP file upload (drag-and-drop)
  scpUpload: (filePath, fileName, profile, remotePath) =>
    ipcRenderer.invoke('scp:upload', { filePath, fileName, profile, remotePath }),
  scpCancel: (transferId) =>
    ipcRenderer.send('scp:cancel', { transferId }),
  onScpProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('scp:progress', listener);
    return () => ipcRenderer.removeListener('scp:progress', listener);
  },
  onScpComplete: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('scp:complete', listener);
    return () => ipcRenderer.removeListener('scp:complete', listener);
  },

  // Get the real filesystem path for a dragged File object.
  // webUtils.getPathForFile is preferred (Electron 29+); file.path is the fallback for Electron ≤ 28.
  getPathForFile: (file) => webUtils?.getPathForFile(file) ?? file.path ?? '',

  // Session logging
  logStart: () => ipcRenderer.invoke('log:start'),
  logWrite: (logId, data) => ipcRenderer.send('log:write', { logId, data }),
  logStop: (logId) => ipcRenderer.send('log:stop', { logId }),

  // Serial port API
  listSerialPorts: () => ipcRenderer.invoke('serial:list-ports'),
  serialConnect: (opts) => ipcRenderer.invoke('serial:connect', opts),
  serialWrite: (id, data) => ipcRenderer.send('serial:write', { id, data }),
  serialClose: (id) => ipcRenderer.send('serial:close', { id }),
  onSerialData: (cb) => {
    const listener = (event, payload) => cb(payload);
    ipcRenderer.on('serial:data', listener);
    return () => ipcRenderer.removeListener('serial:data', listener);
  },
  onSerialExit: (cb) => {
    const listener = (event, payload) => cb(payload);
    ipcRenderer.on('serial:exit', listener);
    return () => ipcRenderer.removeListener('serial:exit', listener);
  },

  // Debug logging
  debugGetLog: () => ipcRenderer.invoke('debug:getLog'),
  debugClearLog: () => ipcRenderer.send('debug:clearLog'),
  debugOpenLogFolder: () => ipcRenderer.send('debug:openLogFolder'),

  // Signal main process that renderer init is complete
  rendererReady: () => ipcRenderer.send('renderer:ready'),

  // Help window
  openHelp: () => ipcRenderer.invoke('help:open'),

  // Multi-window: open a new app window (optionally with a profile to auto-connect)
  openNewWindow: (profile) => ipcRenderer.invoke('window:open-new', profile),
  onAutoConnect: (cb) => {
    const listener = (event, profile) => cb(profile);
    ipcRenderer.on('auto-connect', listener);
    return () => ipcRenderer.removeListener('auto-connect', listener);
  },

  // Finder Quick Action: "Open in Prateek-Term"
  onOpenFolder: (cb) => {
    const listener = (event, folderPath) => cb(folderPath);
    ipcRenderer.on('open-folder', listener);
    return () => ipcRenderer.removeListener('open-folder', listener);
  },

  // ── MCP bridge ───────────────────────────────────────────────────────────
  mcpStatus:   () => ipcRenderer.invoke('mcp:status'),
  mcpRegister: () => ipcRenderer.invoke('mcp:register'),

  // ── Auto-update ──────────────────────────────────────────────────────────
  // Check for updates (pass { includePrerelease: true } to include RC/beta)
  checkForUpdates: (opts) => ipcRenderer.invoke('update:check', opts),
  // Get current version info: { version, buildNum, channel }
  getVersionInfo:  ()     => ipcRenderer.invoke('update:get-version'),
  // Open the release URL in the default browser
  openUpdateUrl:   (url)  => ipcRenderer.send('update:open-url', url),
  // Subscribe to update notifications pushed from main (returns unsubscribe fn)
  onUpdateAvailable: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.removeListener('update:available', listener);
  },
});
