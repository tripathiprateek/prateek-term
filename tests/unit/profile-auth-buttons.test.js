'use strict';
/**
 * Editing a profile must never destroy its saved password.
 *
 * Reported: adding jump-host details to Lantronix-X304 blanked the device
 * password. Confirmed on disk — the profile had NO authType key at all and
 * "password": null, while its sibling G526 had both.
 *
 * Cause: all six auth buttons share .auth-type-btn — three for the target
 * ([data-auth]) and three for the jump host ([data-proxy-auth]). The target
 * click handler used an UNSCOPED '.auth-type-btn' selector, so it was also
 * bound to the proxy buttons. Clicking "Jump Host Auth -> Password" therefore
 * also ran setAuthType(btn.dataset.auth) with dataset.auth === undefined:
 *
 *   state.authType = undefined
 *   -> data.authType = undefined      (JSON.stringify omits the key)
 *   -> data.password = null           (the === 'password' test fails)
 */

const fs   = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');
const app  = read('src/renderer/js/app.js');
const html = read('src/renderer/index.html');

describe('the two sets of auth buttons must not share handlers', () => {
  test('both sets really do share the .auth-type-btn class', () => {
    // If this ever stops being true the scoping below is still correct, but
    // the reason for it is worth keeping visible.
    expect(html).toMatch(/class="auth-type-btn[^"]*"\s+data-auth=/);
    expect(html).toMatch(/class="auth-type-btn[^"]*"\s+data-proxy-auth=/);
  });

  test('EVERY .auth-type-btn selector is scoped to one set or the other', () => {
    const selectors = app.match(/querySelectorAll\('\.auth-type-btn[^']*'\)/g) || [];
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel).toMatch(/\[data-auth\]|\[data-proxy-auth\]/);
    }
  });

  test('the target handler cannot fire on a jump-host button', () => {
    const block = app.match(/\/\/ Auth type selector[\s\S]{0,900}/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain(".auth-type-btn[data-auth]");
    expect(block[0]).toContain('setAuthType(btn.dataset.auth)');
  });
});

describe('setAuthType rejects a bad value', () => {
  test('it never stores anything but key/password/none', () => {
    const fn = app.match(/function setAuthType\(authType\)[\s\S]{0,700}/);
    expect(fn).not.toBeNull();
    // An undefined must not reach state.authType — that is what nulled the
    // password on the next save.
    expect(fn[0]).toMatch(/authType === 'password'[\s\S]{0,120}'key'/);
  });
});

describe('recovering profiles already corrupted on disk', () => {
  const { buildPasswordQueue } = require('../../src/main/ssh-utils');
  const base = {
    protocol: 'ssh', host: '192.168.2.160', username: 'root',
    proxyEnabled: true, proxyHost: '192.168.1.68',
    proxyUsername: 'pi', proxyPassword: 'JUMP',
  };

  test('a stored password counts even with authType missing', () => {
    // X304's exact shape, but with the password still present.
    const q = buildPasswordQueue({ ...base, password: 'TARGET' });
    expect(q.map((e) => e.who)).toEqual(['pi@192.168.1.68', 'root@192.168.2.160']);
  });

  test('an explicit key authType still ignores a stale password', () => {
    // Tolerance must not become "always use any password lying around".
    const q = buildPasswordQueue({ ...base, authType: 'key', password: 'STALE' });
    expect(q.map((e) => e.who)).toEqual(['pi@192.168.1.68']);
  });

  test('X304 as actually found on disk queues only the jump host', () => {
    const q = buildPasswordQueue({ ...base, password: null });
    expect(q.map((e) => e.who)).toEqual(['pi@192.168.1.68']);
  });

  test('the renderer mirror applies the same tolerance', () => {
    expect(app).toContain("cp.authType === undefined && !!cp.password");
  });
});

describe('editing a profile must not drop fields the form does not render', () => {
  test('save MERGES over the stored profile instead of replacing it', () => {
    // `state.profiles[index] = { ...formData, id }` rebuilt the record from
    // form fields alone, so anything without a form control was destroyed.
    // aiEnabled is the visible casualty: it is toggled from the sidebar, has
    // no input in the editor, and so every edit switched AI/MCP access off.
    const fn = app.match(/function saveCurrentProfile\(\)[\s\S]{0,1400}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('...state.profiles[index]');
    expect(fn[0]).toMatch(/\.\.\.state\.profiles\[index\][\s\S]{0,80}\.\.\.formData/);
  });

  test('aiEnabled has no form control, which is why the merge matters', () => {
    // If a control is ever added, getFormData should own the field and this
    // test should be revisited — but until then the merge is what preserves it.
    const form = app.match(/function getFormData\(\)[\s\S]{0,3000}/);
    expect(form[0]).not.toContain('aiEnabled');
  });
});
