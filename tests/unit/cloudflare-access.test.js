'use strict';
/**
 * Cloudflare Access preflight: token-status detection and error translation.
 * These drive the app's "log in before connecting" flow and the actionable
 * hints shown when a Cloudflare SSH connection fails.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { cloudflareTokenStatus, cloudflareErrorHint, decodeJwtExp } =
  require('../../src/main/ssh-utils');

// Build a minimal JWT with the given exp (epoch seconds).
function jwt(exp) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64({ exp })}.sig`;
}

describe('cloudflareTokenStatus', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-tok-')); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

  const write = (name, body) => fs.writeFileSync(path.join(dir, name), body);
  const HOST = 'ssh-rpi-124.prateek.uk';

  test('missing when no token file exists', () => {
    expect(cloudflareTokenStatus(HOST, dir).status).toBe('missing');
  });

  test('missing when only a stale .lock is present (the bug we hit)', () => {
    write(`${HOST}-abc123-token.lock`, '');
    expect(cloudflareTokenStatus(HOST, dir).status).toBe('missing');
  });

  test('valid when a token with a future exp exists', () => {
    const exp = 4102444800; // 2100-01-01
    write(`${HOST}-abc123-token`, jwt(exp));
    const r = cloudflareTokenStatus(HOST, dir);
    expect(r.status).toBe('valid');
    expect(r.expiresAt).toBe(exp);
  });

  test('expired when the token exp is in the past', () => {
    write(`${HOST}-abc123-token`, jwt(1000000000)); // 2001
    expect(cloudflareTokenStatus(HOST, dir).status).toBe('expired');
  });

  test('does not match a different hostname', () => {
    write('other-host.example-abc-token', jwt(4102444800));
    expect(cloudflareTokenStatus(HOST, dir).status).toBe('missing');
  });

  test('present-but-opaque token is treated as valid', () => {
    write(`${HOST}-abc123-token`, 'not-a-jwt');
    expect(cloudflareTokenStatus(HOST, dir).status).toBe('valid');
  });

  test('empty hostname is missing', () => {
    expect(cloudflareTokenStatus('', dir).status).toBe('missing');
  });

  test('respects an injected nowSec for the valid/expired boundary', () => {
    write(`${HOST}-abc123-token`, jwt(2000));
    expect(cloudflareTokenStatus(HOST, dir, 1000).status).toBe('valid');
    expect(cloudflareTokenStatus(HOST, dir, 3000).status).toBe('expired');
  });
});

describe('decodeJwtExp', () => {
  test('extracts exp from a base64url JWT', () => {
    expect(decodeJwtExp(jwt(12345))).toBe(12345);
  });
  test('null for garbage', () => {
    expect(decodeJwtExp('nope')).toBeNull();
    expect(decodeJwtExp('a.b.c')).toBeNull();
  });
});

describe('cloudflareErrorHint', () => {
  test('MITM cert interception → firewall guidance', () => {
    const h = cloudflareErrorHint('tls: failed to verify certificate: x509: certificate signed by unknown authority');
    expect(h).toMatch(/inspecting|inspection|firewall/i);
  });

  test('kex close → login/origin guidance', () => {
    const h = cloudflareErrorHint('kex_exchange_identification: Connection closed by remote host');
    expect(h).toMatch(/log in|login|origin/i);
  });

  test('unable to find config file → update guidance', () => {
    expect(cloudflareErrorHint('unable to find config file')).toMatch(/update|quoting/i);
  });

  test('cert signature wins over the generic close when both present', () => {
    const h = cloudflareErrorHint('x509: certificate signed by unknown authority\nConnection closed by UNKNOWN port 65535');
    expect(h).toMatch(/inspection|firewall/i);
  });

  test('unrecognised output → null', () => {
    expect(cloudflareErrorHint('some unrelated error')).toBeNull();
    expect(cloudflareErrorHint('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Wiring: IPC exposed in preload/main, and used by the renderer
// ---------------------------------------------------------------------------
describe('Cloudflare Access preflight wiring', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');
  const main    = read('src/main/main.js');
  const preload = read('src/main/preload.js');
  const app     = read('src/renderer/js/app.js');

  test('main registers token-status, login, and error-hint IPCs', () => {
    expect(main).toContain("ipcMain.handle('cloudflared:token-status'");
    expect(main).toContain("ipcMain.handle('cloudflared:login'");
    expect(main).toContain("ipcMain.handle('cloudflared:error-hint'");
  });

  test('login IPC opens the browser via `access login` and waits for a token', () => {
    const block = main.match(/ipcMain\.handle\('cloudflared:login'[\s\S]{0,1200}/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain("'access', 'login'");
    expect(block[0]).toContain('cloudflareTokenStatus');
  });

  test('preload bridges all three cloudflared methods', () => {
    expect(preload).toContain('cloudflaredTokenStatus');
    expect(preload).toContain('cloudflaredLogin');
    expect(preload).toContain('cloudflaredErrorHint');
  });

  test('renderer preflights Cloudflare token before creating the tab', () => {
    expect(app).toContain('async function ensureCloudflareToken');
    const create = app.match(/async function createTab\(options = \{\}\)[\s\S]{0,400}/);
    expect(create).not.toBeNull();
    expect(create[0]).toContain('ensureCloudflareToken');
  });

  test('renderer shows the translated hint on a failed Cloudflare exit', () => {
    const exitFn = app.match(/function showExitMessage\(tab, exitCode\)[\s\S]{0,700}/);
    expect(exitFn).not.toBeNull();
    expect(exitFn[0]).toContain('cloudflaredErrorHint');
    expect(exitFn[0]).toContain('_cfTail');
  });
});
