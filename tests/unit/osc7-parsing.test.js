'use strict';
/**
 * tests/unit/osc7-parsing.test.js
 *
 * OSC 7 is the standard escape sequence a shell emits to tell the terminal
 * its current working directory:
 *
 *     ESC ] 7 ; file://<hostname>/<absolute-path> ESC \
 *
 * Prateek-Term parses this in src/renderer/js/app.js to populate
 * tab._remoteCwd, which the drag-drop SCP upload uses as the destination
 * path. This test validates the regex+decoding logic used there.
 *
 * We reimplement the parser inline (it's 4 lines) rather than importing
 * from app.js (renderer code can't be required directly from tests).
 */

const fs   = require('fs');
const path = require('path');

// Pure parser — mirrors the logic in app.js registerOscHandler(7, ...)
function parseOsc7(data) {
  try {
    const m = /^file:\/\/[^/]*(\/.*)$/.exec(data);
    if (m) return decodeURIComponent(m[1]);
  } catch { /* malformed */ }
  return null;
}

describe('OSC 7 — URL parsing', () => {
  test('hostname present, simple path', () => {
    expect(parseOsc7('file://my-host/tmp')).toBe('/tmp');
  });

  test('empty hostname (triple slash)', () => {
    expect(parseOsc7('file:///home/root')).toBe('/home/root');
  });

  test('percent-encoded path (spaces)', () => {
    expect(parseOsc7('file://host/path%20with%20spaces')).toBe('/path with spaces');
  });

  test('percent-encoded path (unicode)', () => {
    expect(parseOsc7('file://host/caf%C3%A9')).toBe('/café');
  });

  test('nested path', () => {
    expect(parseOsc7('file://ntc-502/home/root/scripts')).toBe('/home/root/scripts');
  });

  test('root path', () => {
    expect(parseOsc7('file://host/')).toBe('/');
  });

  test('malformed — missing file:// prefix', () => {
    expect(parseOsc7('/tmp')).toBeNull();
  });

  test('malformed — empty string', () => {
    expect(parseOsc7('')).toBeNull();
  });

  test('malformed — no path portion', () => {
    expect(parseOsc7('file://host')).toBeNull();
  });

  test('malformed — invalid percent-encoding does not throw', () => {
    // Invalid %XX sequences should not crash the handler
    expect(() => parseOsc7('file://host/%ZZ')).not.toThrow();
    expect(parseOsc7('file://host/%ZZ')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Source-contract: app.js must contain the OSC 7 handler + auto-inject
// ---------------------------------------------------------------------------

const APP_JS = path.resolve(__dirname, '../../src/renderer/js/app.js');
let appSource;
beforeAll(() => { appSource = fs.readFileSync(APP_JS, 'utf8'); });

describe('app.js — OSC 7 handler registration', () => {
  test('registers OSC 7 handler on xterm parser', () => {
    expect(appSource).toMatch(/parser\.registerOscHandler\(7,/);
  });

  test('OSC 7 handler stores result on tab._remoteCwd', () => {
    expect(appSource).toMatch(/tab\._remoteCwd\s*=\s*decodeURIComponent/);
  });

  test('uses file:// regex with optional hostname', () => {
    expect(appSource).toMatch(/\/\^file:\\\/\\\/\[\^\/\]\*\(\\\/.\*\)\$\//);
  });
});

describe('app.js — cwd reporter auto-inject for SSH tabs', () => {
  test('injects cwd reporter for SSH tabs', () => {
    expect(appSource).toMatch(/protocol === 'ssh'/);
    expect(appSource).toMatch(/_pt_cwd/);
    expect(appSource).toMatch(/_oscInjected/);
  });

  test('injection is guarded so it fires only once per tab', () => {
    expect(appSource).toMatch(/if\s*\(!tab\.ptyId\s*\|\|\s*tab\._oscInjected\)\s*return/);
  });

  test('_pt_cwd function emits OSC 7 escape with PWD', () => {
    // The injected command writes ESC ] 7 ; file://$HOSTNAME$PWD ESC \
    // Accept either bare ' (backtick JS string) or \' (escaped in single-quoted JS string)
    expect(appSource).toMatch(/printf\s+\\'?\\\\033\]7;file:\/\/%s%s\\\\033/);
  });

  test('overrides cd() to work on busybox ash/dropbear (not bash-only)', () => {
    // cd(){ command cd "$@" && _pt_cwd; } — POSIX, works everywhere
    expect(appSource).toMatch(/cd\(\)\{\s*command cd/);
  });

  test('fires _pt_cwd immediately so we know cwd at login', () => {
    // After defining the function, invoke it once so tab._remoteCwd populates
    // before the user types any commands.
    expect(appSource).toMatch(/_pt_cwd;/);
  });

  test('prepends to existing PROMPT_COMMAND (does not clobber user setup)', () => {
    // Must reference $PROMPT_COMMAND with :- default, so user's existing value is preserved
    expect(appSource).toMatch(/PROMPT_COMMAND:-:/);
  });

  test('uses $HOSTNAME with hostname fallback (busybox may not set $HOSTNAME)', () => {
    // Busybox ash may not export $HOSTNAME; fallback to `hostname` command
    expect(appSource).toMatch(/HOSTNAME:-\$\(hostname/);
  });
});

describe('app.js — drag-drop destination prefers _remoteCwd', () => {
  test('destination priority puts tab._remoteCwd first', () => {
    expect(appSource).toMatch(/tab\._remoteCwd\s*\|\|\s*profile\.remotePath/);
  });
});

describe('app.js — OSC 7 injection helper is reusable for reconnect', () => {
  test('injection logic is extracted into injectOscCwdReporter(tab) helper', () => {
    // A single reusable function (not inlined) so reconnectTab can call it.
    expect(appSource).toMatch(/function injectOscCwdReporter\(tab\)/);
  });

  test('injection no longer uses brittle fixed 1500ms timer', () => {
    // Old model fired setTimeout(1500) which raced with slow-device login.
    // New model is prompt-driven: fireOscInjection() called from
    // maybeFireOscInjection() once the shell is idle at a prompt.
    expect(appSource).toMatch(/function fireOscInjection\(tab\)/);
    expect(appSource).toMatch(/function maybeFireOscInjection\(tab,\s*data\)/);
    // No 1500ms timer within the injection path. Search 400 chars around
    // each `_oscInjected` reference for the old timer.
    const oscRefs = appSource.matchAll(/.{0,200}_oscInjected.{0,200}/gs);
    for (const m of oscRefs) {
      expect(m[0]).not.toMatch(/setTimeout\([^)]*1500\s*\)/);
    }
  });

  test('injection is wired into onTerminalData dispatcher', () => {
    expect(appSource).toMatch(/maybeFireOscInjection\(tab,\s*data\)/);
  });

  test('injection skips while password auto-type is still pending', () => {
    // Prevents the injection from being typed INTO the password prompt.
    expect(appSource).toMatch(/if \(tab\._pendingPassword\) return/);
  });

  test('injection fires only when shell prompt is detected (not password prompt)', () => {
    // Password prompts end in `:` — our regex deliberately only matches #/$/>/%.
    expect(appSource).toMatch(/\/\[#\$>%\]\\s\*\$\//);
  });

  test('reconnectTab clears _oscInjected and _remoteCwd before re-injecting', () => {
    // After a reconnect, the new shell has no `cd()` override — must re-inject
    // AND clear stale `_remoteCwd` so drag-drop doesn't upload to the wrong dir.
    expect(appSource).toMatch(/tab\._oscInjected\s*=\s*false/);
    expect(appSource).toMatch(/tab\._remoteCwd\s*=\s*null/);
  });

  test('reconnectTab calls injectOscCwdReporter for SSH tabs', () => {
    // Find the reconnect block and ensure it includes the re-injection call.
    const reconnectBlock = appSource.match(
      /async function reconnectTab\(tab\)[\s\S]*?^\}/m
    );
    expect(reconnectBlock).toBeTruthy();
    expect(reconnectBlock[0]).toMatch(/injectOscCwdReporter\(tab\)/);
  });
});

describe('app.js — injection is hidden from terminal + history', () => {
  test('saves full terminal state with stty -g before disabling echo', () => {
    // stty -g captures ALL terminal flags (ICANON, ECHO, readline settings).
    // Restoring the saved state in phase 2 preserves ctrl+r / reverse-i-search.
    expect(appSource).toMatch(/_PT_STTY=\$\(stty -g 2>\/dev\/null\)/);
  });

  test('disables shell echo before sending setup (stty -echo)', () => {
    // Phase 1: stty -echo suppresses echo of the real setup command
    expect(appSource).toMatch(/stty -echo 2>\/dev\/null/);
  });

  test('restores exact terminal state after setup via stty "${_PT_STTY:-echo}"', () => {
    // stty "${_PT_STTY:-echo}" is a single real command:
    //   • _PT_STTY set   → passes the full saved termios blob (restores ALL flags
    //     including readline ICANON that ctrl+r depends on)
    //   • _PT_STTY unset → expands to the word "echo" → `stty echo` (busybox fallback)
    // The previous `${_PT_STTY:+...}` form was a parameter EXPANSION not an
    // execution — it produced a string but never ran it, so state was never restored.
    expect(appSource).toMatch(/stty "\$\{_PT_STTY:-echo\}" 2>\/dev\/null/);
  });

  test('unsets _PT_STTY after restore to avoid polluting shell env', () => {
    expect(appSource).toMatch(/unset _PT_STTY/);
  });

  test('erases visible stty -echo line with ANSI cursor-up + clear', () => {
    // \033[2F = cursor up 2 lines to start; \033[0J = clear to end of screen
    // Source uses backtick template, so it has `\\033` as literal bytes.
    expect(appSource).toMatch(/\\\\033\[2F\\\\033\[0J/);
  });

  test('leading space before _PT_STTY so bash/zsh ignorespace skips history', () => {
    // Phase 1 starts with a space then `_PT_STTY=...` → HISTCONTROL=ignorespace skips it
    expect(appSource).toMatch(/['`]\s+_PT_STTY=\$\(stty -g/);
  });

  test('phase-2 setup ALSO has leading space for history skip', () => {
    // Phase 2 previously started with `_pt_cwd(){...` — no leading space, so it
    // landed in history even when echo was suppressed. Must start with a space.
    // Accept either backtick or single-quote JS string delimiter
    expect(appSource).toMatch(/['`] _pt_cwd\(\)\{ printf/);
  });
});
