/**
 * Native addon wrapper — default terminal registration.
 *
 * Gracefully falls back to no-ops if the compiled addon is not present
 * (e.g. in development before `npm run rebuild:native` has been run).
 */

let native = null;

try {
  // Try the electron-rebuild output path first (inside app.asar.unpacked)
  native = require('./build/Release/default_terminal.node');
} catch (_) {
  try {
    // Fallback: local build path (during development)
    native = require('../../../build/Release/default_terminal.node');
  } catch (__) {
    // Native module not compiled — all functions return safe defaults
  }
}

/**
 * Check if Prateek-Term is currently the default terminal.
 * @returns {boolean}
 */
function isDefaultTerminal() {
  if (!native) return false;
  try { return native.isDefaultTerminal(); } catch { return false; }
}

/**
 * Prompt the user (via macOS system dialog on 12+) to set Prateek-Term
 * as the default terminal, or silently register on macOS < 12.
 */
function setDefaultTerminal() {
  if (!native) {
    throw new Error(
      'Native addon not compiled. Run: npm run rebuild:native'
    );
  }
  native.setDefaultTerminal();
}

/**
 * Return the bundle ID of the currently registered default terminal.
 * @returns {string | null}
 */
function getDefaultTerminalBundleId() {
  if (!native) return null;
  try { return native.getDefaultTerminalBundleId(); } catch { return null; }
}

/** True when the native addon loaded successfully. */
const nativeAvailable = native !== null;

module.exports = { isDefaultTerminal, setDefaultTerminal, getDefaultTerminalBundleId, nativeAvailable };
