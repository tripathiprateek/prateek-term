'use strict';
/**
 * redact.js — strip credentials from text bound for the debug log.
 *
 * Debug logging exists so a user can hand us a log for a bug report, and the
 * Settings panel offers Copy / reveal-in-file-manager to make that easy. Four
 * dbgLog() call sites print a full argv (pty create, scp cmd, the MCP bridge
 * SSH command, spawnPtyForBridge), and a password jump host carries its secret
 * inside that argv as `sshpass -p <password>` within the ProxyCommand. So the
 * log we invite users to share contained their device passwords in plaintext.
 *
 * Applied inside dbgLog rather than at each call site: one chokepoint, so a
 * log line added later cannot quietly reintroduce the leak.
 */

const MASK = '<redacted>';

// `sshpass … -p <secret>`. Anchored on sshpass so a plain `ssh -p 65222` —
// which is a PORT, not a password — stays readable. `-f <file>` is a path to a
// temp file, not a secret, and is deliberately left alone.
// Case-SENSITIVE on purpose: scp's port flag is `-P`, and an /i here would
// redact the port number. The {0,40} span covers the argv punctuation that can
// sit between the binary and its flag (` args=[`), without reaching so far that
// it swallows an unrelated flag later on the line.
const SSHPASS_P = /(sshpass(?:\.exe)?[^\n]{0,40}?[\s,[]-p[\s,]+)([^\s,\]]+)/g;

// Environment form: SSHPASS=<secret>
const SSHPASS_ENV = /(\bSSHPASS=)([^\s,\]]+)/g;

function redactSecrets(text) {
  if (typeof text !== 'string') {
    if (text === null || text === undefined) return text;
    try { text = String(text); } catch { return text; }
  }
  return text
    .replace(SSHPASS_P, `$1${MASK}`)
    .replace(SSHPASS_ENV, `$1${MASK}`);
}

module.exports = { redactSecrets };
