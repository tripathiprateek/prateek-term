'use strict';
/**
 * Cloudflare Access SSH: the ProxyCommand must be a SINGLE ssh argument, and
 * the on-screen command echo must quote it so a copy-pasted line doesn't split
 * (an unquoted ProxyCommand makes cloudflared run bare → "unable to find config
 * file").
 */

const fs   = require('fs');
const path = require('path');
const { buildCloudflareProxyFlags } = require('../../src/main/ssh-utils');

describe('buildCloudflareProxyFlags', () => {
  test('returns exactly ["-o", "ProxyCommand=… access ssh --hostname %h"]', () => {
    const flags = buildCloudflareProxyFlags('/opt/homebrew/bin/cloudflared');
    expect(flags).toHaveLength(2);
    expect(flags[0]).toBe('-o');
    // The whole ProxyCommand is ONE element — never split across argv.
    expect(flags[1]).toBe('ProxyCommand=/opt/homebrew/bin/cloudflared access ssh --hostname %h');
  });

  test('defaults the binary to bare "cloudflared" when none given', () => {
    expect(buildCloudflareProxyFlags()[1]).toBe('ProxyCommand=cloudflared access ssh --hostname %h');
  });

  test('the ProxyCommand element carries the full cloudflared invocation, not just the binary', () => {
    const val = buildCloudflareProxyFlags('/x/cloudflared')[1];
    expect(val).toContain('access ssh --hostname %h');
  });
});

// ---------------------------------------------------------------------------
// debugCmd echo quoting (mirrors the closure in main.js terminal:create)
// ---------------------------------------------------------------------------
function quoteForDisplay(tok) {
  const s = String(tok);
  if (s !== '' && /^[A-Za-z0-9_./:=@%+-]+$/.test(s)) return s;
  const q = String.fromCharCode(39);
  return q + s.split(q).join(q + '\\' + q + q) + q;
}

describe('command echo quoting', () => {
  test('leaves plain tokens untouched', () => {
    expect(quoteForDisplay('ssh')).toBe('ssh');
    expect(quoteForDisplay('-o')).toBe('-o');
    expect(quoteForDisplay('ConnectTimeout=15')).toBe('ConnectTimeout=15');
    expect(quoteForDisplay('pi@ssh-rpi-124.prateek.uk')).toBe('pi@ssh-rpi-124.prateek.uk');
  });

  test('single-quotes a ProxyCommand value that contains spaces', () => {
    const tok = 'ProxyCommand=/opt/homebrew/bin/cloudflared access ssh --hostname %h';
    expect(quoteForDisplay(tok)).toBe(`'${tok}'`);
  });

  test('the quoted echo, re-parsed by a shell, keeps ProxyCommand as one token', () => {
    // Simulate: the quoted string is one shell word (no unescaped spaces outside quotes).
    const quoted = quoteForDisplay('ProxyCommand=cf access ssh --hostname %h');
    // Strip the outer quotes → the inner value is intact and unsplit.
    expect(quoted.startsWith("'")).toBe(true);
    expect(quoted.endsWith("'")).toBe(true);
    expect(quoted.slice(1, -1)).toBe('ProxyCommand=cf access ssh --hostname %h');
  });

  test('main.js builds debugCmd by quoting each token', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
    expect(src).toContain('[shell, ...args].map(quoteForDisplay).join');
  });
});
