'use strict';
/**
 * external-links.js — decide whether a URL may be handed to shell.openExternal.
 *
 * Web links in the terminal used to run xterm's default handler, `window.open`,
 * which Electron turned into a new in-app BrowserWindow. Routing them to the
 * OS browser instead means calling shell.openExternal — and that is only safe
 * behind an allowlist.
 *
 * The terminal renders output from remote devices, so a "link" is text an
 * attacker may have chosen. shell.openExternal hands the URL to the OS, which
 * launches whatever application claims the scheme:
 *   • file://   opens the target with its registered app
 *   • smb://    can leak NTLM credentials on Windows
 *   • ms-msdt:, search-ms: and friends have been used for code execution
 * So the rule is an allowlist of the three schemes a user would actually click,
 * not a denylist of the ones we happen to have thought of.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

// Generous for real links, far below anything that would upset the OS handler.
const MAX_URL_LENGTH = 2048;

function isSafeExternalUrl(value) {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url || url.length > MAX_URL_LENGTH) return false;

  // A terminal can emit any byte. Control characters have been used to confuse
  // downstream URL handling, and no legitimate link needs them.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(url)) return false;

  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;

  // http(s) must name a host; "https://" alone parses but goes nowhere.
  if (parsed.protocol !== 'mailto:' && !parsed.hostname) return false;

  return true;
}

module.exports = { isSafeExternalUrl, ALLOWED_PROTOCOLS, MAX_URL_LENGTH };
