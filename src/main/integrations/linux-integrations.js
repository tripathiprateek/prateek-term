/**
 * linux-integrations.js — Linux desktop integration for Prateek-Term.
 *
 * Installs a freedesktop `.desktop` entry into ~/.local/share/applications so
 * Prateek-Term appears in app menus and can own the prateekterm:// scheme. The
 * entry includes a "Open folder" action; file managers (Nautilus/Nemo/Dolphin)
 * surface app actions differently per desktop environment, so we register the
 * MIME/scheme handler via xdg-mime and document the rest in the user guide.
 *
 * Everything is best-effort and per-user (no root). On AppImage/deb the exec
 * path differs, so the caller passes the current executable path.
 */

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_ID  = 'prateek-term';
const DESKTOP = `${APP_ID}.desktop`;

function appsDir() {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'applications');
}
function desktopPath() {
  return path.join(appsDir(), DESKTOP);
}

/** True when the .desktop entry has been installed. */
function isRegistered() {
  return fs.existsSync(desktopPath());
}

/**
 * Write the .desktop entry and register the prateekterm:// scheme handler.
 * `exePath` is the absolute path to the running executable (AppImage or
 * installed binary).
 */
function register(exePath) {
  if (!exePath) throw new Error('register: exePath required');
  const dir = appsDir();
  fs.mkdirSync(dir, { recursive: true });

  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Prateek-Term',
    'GenericName=Terminal',
    'Comment=Terminal emulator & SSH/serial connection manager',
    // %u passes a prateekterm:// URL or a file/folder path to the app.
    `Exec="${exePath}" %u`,
    'Terminal=false',
    'Categories=Utility;TerminalEmulator;System;',
    'MimeType=x-scheme-handler/prateekterm;inode/directory;',
    'StartupNotify=true',
    'StartupWMClass=Prateek-Term',
    'Actions=NewWindow;',
    '',
    '[Desktop Action NewWindow]',
    'Name=New Window',
    `Exec="${exePath}"`,
    '',
  ].join('\n');

  fs.writeFileSync(desktopPath(), entry, 'utf8');

  // Best-effort: refresh the desktop database and claim the scheme.
  try { execFileSync('update-desktop-database', [dir], { stdio: 'ignore' }); } catch { /* optional */ }
  try { execFileSync('xdg-mime', ['default', DESKTOP, 'x-scheme-handler/prateekterm'], { stdio: 'ignore' }); } catch { /* optional */ }
}

/** Remove the .desktop entry (best-effort). */
function unregister() {
  try { fs.unlinkSync(desktopPath()); } catch { /* already gone */ }
  try { execFileSync('update-desktop-database', [appsDir()], { stdio: 'ignore' }); } catch { /* optional */ }
}

module.exports = { isRegistered, register, unregister, desktopPath };
