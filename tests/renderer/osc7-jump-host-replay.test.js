'use strict';
/**
 * End-to-end replay of the reported bug.
 *
 * Dragging a file onto an SSH tab sitting at /tmp on Lantronix NTC-552 uploaded
 * to the remote HOME instead:
 *   scp: /home/root//pps-vpn-lantronix-ntc-552-….ipk: Read-only file system
 * and the toast read "→ ~/", i.e. the destination was null — tab._remoteCwd had
 * never been set, so the drop fell through to the scp default.
 *
 * Cause: on macOS/Linux sshpass answers the jump hop inside the ProxyCommand's
 * own PTY, so "pi@…'s password:" never reaches the terminal. The queue kept that
 * entry forever and maybeFireOscInjection()'s length gate returned on every
 * chunk for the life of the tab — the cwd reporter was never injected.
 *
 * This test runs the REAL renderer functions, lifted from app.js source (the
 * renderer cannot be required: it is a browser script with DOM globals), and
 * replays the exact byte sequence such a connection produces.
 */

const fs   = require('fs');
const path = require('path');

const APP = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/js/app.js'), 'utf8');

/** Lift a top-level function out of app.js by name, brace-matched. */
function lift(name) {
  const start = APP.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found in app.js`);
  let depth = 0, i = APP.indexOf('{', start);
  for (let j = i; j < APP.length; j++) {
    if (APP[j] === '{') depth++;
    else if (APP[j] === '}' && --depth === 0) return APP.slice(start, j + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/** The password-drain block, lifted from setupTerminalListeners. */
function liftDrain() {
  const m = APP.match(/if \(tab\._pwdQueue && tab\._pwdQueue\.length\) \{[\s\S]*?\n {6}\}/);
  if (!m) throw new Error('password-drain block not found in app.js');
  return m[0];
}

function buildHarness() {
  const fired = [];
  const sent  = [];
  const src = `
    ${lift('buildPasswordQueue')}
    ${lift('maybeFireOscInjection')}
    function onData(tab, data) {
      const id = tab.ptyId;   // the real code closes over this from the IPC event
      ${liftDrain()}
      maybeFireOscInjection(tab, data);
    }
    return { buildPasswordQueue, onData };
  `;
  // Stubs for the few globals the lifted code touches.
  const fireOscInjection = (tab) => { fired.push(tab._oscWatchBuf); tab._oscInjected = true; };
  const sendOscPhase2    = () => {};
  const window = { terminalAPI: { sendInput: (_id, s) => sent.push(s) } };
  const setTimeoutStub   = (fn) => { fn(); return 1; };   // run timers inline
  const api = new Function(
    'fireOscInjection', 'sendOscPhase2', 'window', 'setTimeout', 'clearTimeout', src,
  )(fireOscInjection, sendOscPhase2, window, setTimeoutStub, () => {});
  return { ...api, fired, sent };
}

const NTC552 = {
  protocol: 'ssh', host: '192.168.2.150', username: 'root',
  authType: 'password', password: 'TARGETPW',
  proxyEnabled: true, proxyHost: '192.168.1.68',
  proxyUsername: 'pi', proxyPassword: 'JUMPPW',
};

/** What the PTY really emits — sshpass ate the jump prompt, so it is absent. */
const MACOS_TRANSCRIPT = [
  "Warning: Permanently added '192.168.1.68' (ED25519) to the list of known hosts.\r\n",
  "root@192.168.2.150's password: ",
  '\r\n',
  'BusyBox v1.31.1 (2025-10-23 04:22:29 UTC) built-in shell (ash)\r\n',
  '\r\n',
  'root@ntc-552:~# ',
];

function newTab(h, profile) {
  const tab = { protocol: 'ssh', ptyId: 1, _oscWatchBuf: '', _pwdBuf: '', _remoteCwd: null };
  tab._pwdQueue = h.buildPasswordQueue(profile);
  return tab;
}

describe('jump-host tab still gets a cwd reporter', () => {
  test('the injection fires once the shell prompt appears', () => {
    const h = buildHarness();
    const tab = newTab(h, NTC552);
    expect(tab._pwdQueue).toHaveLength(2);          // jump + target
    MACOS_TRANSCRIPT.forEach((c) => h.onData(tab, c));

    expect(tab._pwdQueue).toHaveLength(0);          // was 1 — the orphaned jump hop
    expect(h.fired).toHaveLength(1);                // was 0 — gate blocked forever
  });

  test('only the TARGET password is typed — the jump secret is never sent', () => {
    const h = buildHarness();
    MACOS_TRANSCRIPT.forEach((c) => h.onData(newTab(h, NTC552), c));
    expect(h.sent).toEqual(['TARGETPW\r']);
    expect(h.sent.join('')).not.toContain('JUMPPW');
  });

  test('no later output can auto-type the orphaned jump password', () => {
    const h = buildHarness();
    const tab = newTab(h, NTC552);
    MACOS_TRANSCRIPT.forEach((c) => h.onData(tab, c));
    h.onData(tab, 'passwd: password updated successfully\r\nroot@ntc-552:~# ');
    h.onData(tab, '# grep -r password /etc/config\r\n');
    expect(h.sent).toEqual(['TARGETPW\r']);         // still just the one
  });

  test('key-auth target behind a password jump host also gets injected', () => {
    // Queue holds ONLY the jump entry, whose prompt never appears on macOS.
    const h = buildHarness();
    const tab = newTab(h, { ...NTC552, authType: 'key', password: '' });
    expect(tab._pwdQueue).toHaveLength(1);
    h.onData(tab, 'BusyBox v1.31.1 built-in shell (ash)\r\nroot@ntc-552:~# ');
    expect(h.fired).toHaveLength(1);
    expect(h.sent).toEqual([]);                     // nothing typed at all
  });

  test('Windows (no sshpass) — both prompts shown, both answered in order', () => {
    const h = buildHarness();
    const tab = newTab(h, NTC552);
    [
      "pi@192.168.1.68's password: ", '\r\n',
      "root@192.168.2.150's password: ", '\r\n',
      'root@ntc-552:~# ',
    ].forEach((c) => h.onData(tab, c));
    expect(h.sent).toEqual(['JUMPPW\r', 'TARGETPW\r']);
    expect(h.fired).toHaveLength(1);
  });

  test('injection is NOT fired while a password is still outstanding', () => {
    // The gate must still hold during authentication — a password prompt ends
    // in ':' and must never be mistaken for a shell prompt.
    const h = buildHarness();
    const tab = newTab(h, NTC552);
    h.onData(tab, "Warning: Permanently added '192.168.1.68' (ED25519)\r\n");
    h.onData(tab, "root@192.168.2.150's password: ");
    expect(h.fired).toHaveLength(0);
  });
});
