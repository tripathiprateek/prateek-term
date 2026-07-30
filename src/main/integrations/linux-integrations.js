/**
 * linux-integrations.js — Linux desktop integration for Prateek-Term.
 *
 * Installs, per-user (no root):
 *   1. A freedesktop `.desktop` entry in ~/.local/share/applications so the app
 *      shows in menus, owns the prateekterm:// scheme, and carries an Icon so
 *      GNOME shows it in the dash. NOTE: a user-level entry SHADOWS the deb's
 *      /usr/share entry (same basename), so this one MUST include Icon= and the
 *      correct StartupWMClass or the dash icon disappears.
 *   2. The app icon into the user hicolor theme, so Icon=prateek-term resolves
 *      even for the AppImage (which installs no system icons).
 *   3. A Nautilus script ("Open in Prateek-Term") so folders get a right-click
 *      entry (GNOME Files surfaces it under the Scripts submenu — the only
 *      dependency-free way; a top-level item needs python3-nautilus).
 *
 * Everything is best-effort. The caller passes the current executable path
 * (the real .AppImage path for AppImage builds) and the app icon PNG path.
 */

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_ID       = 'prateek-term';
const DESKTOP      = `${APP_ID}.desktop`;
const ICON_NAME    = APP_ID;
const SCRIPT_LABEL = 'Open in Prateek-Term';

function dataDir() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}
function appsDir()             { return path.join(dataDir(), 'applications'); }
function iconDir()             { return path.join(dataDir(), 'icons', 'hicolor', '512x512', 'apps'); }
function nautilusScriptsDir()  { return path.join(dataDir(), 'nautilus', 'scripts'); }

function desktopPath()         { return path.join(appsDir(), DESKTOP); }
function iconInstalledPath()   { return path.join(iconDir(), `${ICON_NAME}.png`); }
function nautilusScriptPath()  { return path.join(nautilusScriptsDir(), SCRIPT_LABEL); }

/** True when the .desktop entry has been installed. */
function isRegistered() {
  return fs.existsSync(desktopPath());
}

// Single-quote a string for safe embedding in a POSIX shell script.
// Each embedded ' becomes '\'' (close quote, escaped quote, reopen quote).
function shQuote(s) {
  const q = String.fromCharCode(39); // single quote
  return q + String(s).split(q).join(q + '\\' + q + q) + q;
}

/**
 * Install the .desktop entry, the user-theme icon, the prateekterm:// handler,
 * and the Nautilus "Open in Prateek-Term" script.
 * @param {string} exePath absolute path to the launchable binary/AppImage
 * @param {string} [iconPath] absolute path to a PNG to install into the icon theme
 */
function register(exePath, iconPath) {
  if (!exePath) throw new Error('register: exePath required');
  fs.mkdirSync(appsDir(), { recursive: true });

  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Prateek-Term',
    'GenericName=Terminal',
    'Comment=Terminal emulator & SSH/serial connection manager',
    // %u passes a prateekterm:// URL or a file/folder path to the app.
    `Exec=${shQuote(exePath)} %u`,
    'Terminal=false',
    `Icon=${ICON_NAME}`,
    'Categories=Utility;TerminalEmulator;System;',
    'MimeType=x-scheme-handler/prateekterm;inode/directory;',
    'StartupNotify=true',
    // Must match Electron's WM_CLASS (app.getName() → lowercase) or GNOME can't
    // bind the running window to this entry's icon.
    'StartupWMClass=prateek-term',
    'Actions=NewWindow;',
    '',
    '[Desktop Action NewWindow]',
    'Name=New Window',
    `Exec=${shQuote(exePath)}`,
    '',
  ].join('\n');
  fs.writeFileSync(desktopPath(), entry, 'utf8');

  // Install the icon into the user hicolor theme so Icon=prateek-term resolves
  // even for the AppImage (deb already ships a system icon — harmless overlap).
  if (iconPath && fs.existsSync(iconPath)) {
    try {
      fs.mkdirSync(iconDir(), { recursive: true });
      fs.copyFileSync(iconPath, iconInstalledPath());
      execFileSync('gtk-update-icon-cache', ['-f', '-t', path.join(dataDir(), 'icons', 'hicolor')], { stdio: 'ignore' });
    } catch { /* optional — Icon= still resolves via the deb's system icon */ }
  }

  // Nautilus right-click script (GNOME Files → right-click → Scripts).
  try {
    fs.mkdirSync(nautilusScriptsDir(), { recursive: true });
    const script = [
      '#!/bin/sh',
      '# Open the selected folder (or the current folder) in Prateek-Term.',
      `exe=${shQuote(exePath)}`,
      'target=""',
      'if [ -n "$NAUTILUS_SCRIPT_SELECTED_FILE_PATHS" ]; then',
      "  target=$(printf '%s\\n' \"$NAUTILUS_SCRIPT_SELECTED_FILE_PATHS\" | head -n1)",
      'fi',
      'if [ -z "$target" ] && [ -n "$NAUTILUS_SCRIPT_CURRENT_URI" ]; then',
      '  uri="$NAUTILUS_SCRIPT_CURRENT_URI"',
      '  case "$uri" in',
      '    file://*)',
      '      target=$(python3 -c "import sys,urllib.parse;print(urllib.parse.unquote(sys.argv[1][7:]))" "$uri" 2>/dev/null || printf "%s" "${uri#file://}") ;;',
      '  esac',
      'fi',
      '[ -z "$target" ] && target="$PWD"',
      'exec "$exe" "$target"',
      '',
    ].join('\n');
    fs.writeFileSync(nautilusScriptPath(), script, { mode: 0o755 });
    fs.chmodSync(nautilusScriptPath(), 0o755);
  } catch { /* optional — Nautilus may not be installed */ }

  // Best-effort: refresh the desktop database and claim the scheme.
  try { execFileSync('update-desktop-database', [appsDir()], { stdio: 'ignore' }); } catch { /* optional */ }
  try { execFileSync('xdg-mime', ['default', DESKTOP, 'x-scheme-handler/prateekterm'], { stdio: 'ignore' }); } catch { /* optional */ }
}

/** Remove everything register() installed (best-effort). */
function unregister() {
  for (const p of [desktopPath(), iconInstalledPath(), nautilusScriptPath()]) {
    try { fs.unlinkSync(p); } catch { /* already gone */ }
  }
  try { execFileSync('update-desktop-database', [appsDir()], { stdio: 'ignore' }); } catch { /* optional */ }
}

module.exports = { isRegistered, register, unregister, desktopPath, nautilusScriptPath, iconInstalledPath };
