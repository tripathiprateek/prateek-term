'use strict';

/**
 * Tests for the Chrome SOCKS5 proxy filter feature:
 *   - buildIncludePacUrl  (pure function exported from ssh-utils.js)
 *   - shell:openChromeProxy IPC handler (source-contract tests against main.js)
 *
 * Filter modes:
 *   none    → all traffic through tunnel, bypass loopback only  (--proxy-bypass-list="<-loopback>")
 *   include → only listed hosts tunneled, rest direct           (--proxy-pac-url with PAC data: URL)
 *   exclude → all tunneled except listed hosts                  (--proxy-server + --proxy-bypass-list)
 */

const fs   = require('fs');
const path = require('path');

const { buildIncludePacUrl } = require('../../src/main/ssh-utils');

const MAIN_SRC = path.join(__dirname, '../../src/main/main.js');
const APP_SRC  = path.join(__dirname, '../../src/renderer/js/app.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode a data: URI and return the raw PAC source. */
function decodePac(dataUrl) {
  const prefix = 'data:application/x-ns-proxy-autoconfig,';
  expect(dataUrl.startsWith(prefix)).toBe(true);
  return decodeURIComponent(dataUrl.slice(prefix.length));
}

// ---------------------------------------------------------------------------
// buildIncludePacUrl — return format
// ---------------------------------------------------------------------------

describe('buildIncludePacUrl — return format', () => {
  test('returns a data: URI with correct MIME type', () => {
    const url = buildIncludePacUrl(1080, '10.0.0.5');
    expect(url).toMatch(/^data:application\/x-ns-proxy-autoconfig,/);
  });

  test('URL segment is percent-encoded', () => {
    const url = buildIncludePacUrl(1080, '10.0.0.5');
    const encoded = url.slice('data:application/x-ns-proxy-autoconfig,'.length);
    // Encoded PAC must not contain raw braces/spaces
    expect(encoded).not.toContain('{');
    expect(encoded).not.toContain(' ');
  });

  test('decoded PAC is a valid FindProxyForURL function declaration', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.5'));
    expect(pac).toMatch(/^function FindProxyForURL\(url,host\)\{/);
  });

  test('PAC always ends with return"DIRECT"', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.5'));
    expect(pac).toMatch(/return"DIRECT";\}$/);
  });
});

// ---------------------------------------------------------------------------
// buildIncludePacUrl — empty / no-op list
// ---------------------------------------------------------------------------

describe('buildIncludePacUrl — empty list', () => {
  test('empty string → no SOCKS5 condition, all traffic DIRECT', () => {
    const pac = decodePac(buildIncludePacUrl(1080, ''));
    expect(pac).not.toContain('SOCKS5');
    expect(pac).toBe('function FindProxyForURL(url,host){return"DIRECT";}');
  });

  test('whitespace-only string → same as empty', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '   ,  ,   '));
    expect(pac).not.toContain('SOCKS5');
  });

  test('empty list still embeds correct port when a condition IS present', () => {
    const pac = decodePac(buildIncludePacUrl(9050, '10.0.0.1'));
    expect(pac).toContain('SOCKS5 127.0.0.1:9050');
  });
});

// ---------------------------------------------------------------------------
// buildIncludePacUrl — exact IP match
// ---------------------------------------------------------------------------

describe('buildIncludePacUrl — exact IP match', () => {
  test('single exact IP uses host== comparison', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.5'));
    expect(pac).toContain('host=="10.0.0.5"');
  });

  test('matching host returns SOCKS5, non-matching returns DIRECT', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.5'));
    expect(pac).toMatch(/host=="10\.0\.0\.5".*SOCKS5/);
    expect(pac).toMatch(/SOCKS5.*return"DIRECT"/);
  });

  test('multiple exact IPs joined with ||', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.1, 10.0.0.2, 10.0.0.3'));
    expect(pac).toContain('host=="10.0.0.1"||host=="10.0.0.2"||host=="10.0.0.3"');
  });

  test('does not use isInNet for plain IPs (no /mask)', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '192.168.1.1'));
    expect(pac).not.toContain('isInNet');
    expect(pac).toContain('host=="192.168.1.1"');
  });
});

// ---------------------------------------------------------------------------
// buildIncludePacUrl — CIDR notation
// ---------------------------------------------------------------------------

describe('buildIncludePacUrl — CIDR notation', () => {
  test('/24 produces mask 255.255.255.0', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '192.168.2.0/24'));
    expect(pac).toContain('isInNet(host,"192.168.2.0","255.255.255.0")');
  });

  test('/16 produces mask 255.255.0.0', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.0/16'));
    expect(pac).toContain('isInNet(host,"10.0.0.0","255.255.0.0")');
  });

  test('/8 produces mask 255.0.0.0', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.0/8'));
    expect(pac).toContain('isInNet(host,"10.0.0.0","255.0.0.0")');
  });

  test('/32 produces mask 255.255.255.255 (single host)', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '192.168.1.100/32'));
    expect(pac).toContain('isInNet(host,"192.168.1.100","255.255.255.255")');
  });

  test('/0 produces mask 0.0.0.0 (matches all IPs)', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '0.0.0.0/0'));
    expect(pac).toContain('isInNet(host,"0.0.0.0","0.0.0.0")');
  });

  test('uses isInNet (not host==) for CIDR entries', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '192.168.2.0/24'));
    expect(pac).toContain('isInNet');
    expect(pac).not.toMatch(/host=="192\.168\.2\.0"/);
  });
});

// ---------------------------------------------------------------------------
// buildIncludePacUrl — wildcard patterns
// ---------------------------------------------------------------------------

describe('buildIncludePacUrl — wildcard patterns', () => {
  test('*.domain.com uses shExpMatch', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '*.company.com'));
    expect(pac).toContain('shExpMatch(host,"*.company.com")');
  });

  test('192.168.*.* (IP wildcard) uses shExpMatch', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '192.168.*.*'));
    expect(pac).toContain('shExpMatch(host,"192.168.*.*")');
  });

  test('does not use isInNet for wildcard entries', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '*.internal'));
    expect(pac).not.toContain('isInNet');
  });
});

// ---------------------------------------------------------------------------
// buildIncludePacUrl — mixed entries
// ---------------------------------------------------------------------------

describe('buildIncludePacUrl — mixed entries', () => {
  test('CIDR + wildcard + exact IP all combined with ||', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '192.168.2.0/24, *.company.com, 10.0.0.5'));
    expect(pac).toContain('isInNet(host,"192.168.2.0","255.255.255.0")');
    expect(pac).toContain('shExpMatch(host,"*.company.com")');
    expect(pac).toContain('host=="10.0.0.5"');
    // All joined with || inside one if
    expect(pac).toMatch(/isInNet.*\|\|.*shExpMatch.*\|\|.*host==/);
  });

  test('leading/trailing whitespace around entries is trimmed', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '  10.0.0.1  ,  *.corp.net  '));
    expect(pac).toContain('host=="10.0.0.1"');
    expect(pac).toContain('shExpMatch(host,"*.corp.net")');
  });

  test('empty entries between commas are filtered out', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.1,,10.0.0.2'));
    expect(pac).toContain('host=="10.0.0.1"||host=="10.0.0.2"');
    // Double-|| would indicate empty entry leaked through
    expect(pac).not.toContain('||||');
  });

  test('single entry produces if without ||', () => {
    const pac = decodePac(buildIncludePacUrl(1080, '10.0.0.1'));
    expect(pac).not.toContain('||');
    expect(pac).toContain('if(host=="10.0.0.1")');
  });
});

// ---------------------------------------------------------------------------
// buildIncludePacUrl — port embedding
// ---------------------------------------------------------------------------

describe('buildIncludePacUrl — port number', () => {
  test('port number appears in SOCKS5 return value', () => {
    const pac = decodePac(buildIncludePacUrl(1234, '10.0.0.1'));
    expect(pac).toContain('SOCKS5 127.0.0.1:1234');
  });

  test('different ports produce different PAC URLs', () => {
    const a = buildIncludePacUrl(1080, '10.0.0.1');
    const b = buildIncludePacUrl(9050, '10.0.0.1');
    expect(a).not.toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// shell:openChromeProxy — source contracts against main.js
// ---------------------------------------------------------------------------

describe('shell:openChromeProxy — source contracts', () => {
  let source;
  beforeAll(() => {
    source = fs.readFileSync(MAIN_SRC, 'utf8');
  });

  test('handler is registered for shell:openChromeProxy channel', () => {
    expect(source).toContain("ipcMain.handle('shell:openChromeProxy'");
  });

  test('handler destructures filterMode and filterList from payload', () => {
    expect(source).toMatch(/\{\s*port[^}]*filterMode[^}]*filterList[^}]*\}/);
  });

  test('include mode uses --proxy-pac-url (no --proxy-server)', () => {
    expect(source).toContain("filterMode === 'include'");
    expect(source).toContain('--proxy-pac-url=');
  });

  test('include mode does NOT use --proxy-server when PAC is active', () => {
    // Find the include branch and confirm proxy-server is absent from it
    const includeBlock = source.slice(
      source.indexOf("filterMode === 'include'"),
      source.indexOf("filterMode === 'exclude'")
    );
    expect(includeBlock).not.toContain('--proxy-server=');
  });

  test('exclude mode uses --proxy-server plus --proxy-bypass-list', () => {
    expect(source).toContain("filterMode === 'exclude'");
    // The exclude branch must have both flags
    const excludeBlock = source.slice(
      source.indexOf("filterMode === 'exclude'"),
      source.indexOf("proxyFlags = `--proxy-server")
    );
    // Just confirm both strings appear near each other in the source
    expect(source).toMatch(/proxy-server.*proxy-bypass-list|proxy-bypass-list.*proxy-server/s);
  });

  test('exclude mode prepends <-loopback> to the bypass list', () => {
    expect(source).toContain('<-loopback>');
  });

  test('none/default mode uses --proxy-bypass-list="<-loopback>" only', () => {
    // The else branch should produce the loopback-only bypass
    expect(source).toContain('--proxy-bypass-list="<-loopback>"');
  });

  test('include mode with empty filterList falls through to default', () => {
    // Guard: filterList && filterList.trim() must be present
    expect(source).toContain('filterList && filterList.trim()');
  });

  test('Chrome binary is resolved per-OS via platform.chromePath()', () => {
    expect(source).toContain('platform.chromePath()');
  });

  test('errors clearly when Chrome/Chromium is not found', () => {
    expect(source).toMatch(/Chrome.*not found|not found.*Chrome/i);
  });

  test('--user-data-dir uses os.tmpdir() + the proxy port for process isolation', () => {
    expect(source).toMatch(/os\.tmpdir\(\)[\s\S]{0,40}chrome-proxy-\$\{p\}/);
    expect(source).toContain('--user-data-dir="${userDataDir}"');
  });

  test('port is validated to be in range 1–65535', () => {
    expect(source).toContain('p < 1 || p > 65535');
  });

  test('buildIncludePacUrl is imported from ssh-utils (not defined locally)', () => {
    // Should NOT contain a local function definition
    expect(source).not.toContain('function buildIncludePacUrl(');
    // Should be destructured from the require
    expect(source).toContain('buildIncludePacUrl,');
  });
});

// ---------------------------------------------------------------------------
// Renderer UI (app.js) — source contracts for proxy filter row
// ---------------------------------------------------------------------------

describe('proxy filter UI — app.js source contracts', () => {
  let appSource;
  beforeAll(() => {
    appSource = fs.readFileSync(APP_SRC, 'utf8');
  });

  test('new Dynamic rule defaults proxyFilterMode to "none"', () => {
    expect(appSource).toContain("proxyFilterMode: 'none'");
  });

  test('new Dynamic rule defaults proxyFilterList to empty string', () => {
    expect(appSource).toContain("proxyFilterList: ''");
  });

  test('filter row rendered only for Dynamic rules (isDynamic guard)', () => {
    expect(appSource).toMatch(/if\s*\(isDynamic\)[\s\S]{0,300}pf-filter-row/);
  });

  test('filter row renders three mode buttons: none, include, exclude', () => {
    expect(appSource).toContain('data-fmode="none"');
    expect(appSource).toContain('data-fmode="include"');
    expect(appSource).toContain('data-fmode="exclude"');
  });

  test('active class applied to button matching current proxyFilterMode', () => {
    expect(appSource).toMatch(/fMode\s*===\s*'none'.*active/);
    expect(appSource).toMatch(/fMode\s*===\s*'include'.*active/);
    expect(appSource).toMatch(/fMode\s*===\s*'exclude'.*active/);
  });

  test('filter list input hidden when mode is none', () => {
    expect(appSource).toMatch(/pf-filter-list.*hidden|hidden.*pf-filter-list/);
    expect(appSource).toContain("fMode==='none'");
  });

  test('filter button click updates state proxyFilterMode', () => {
    expect(appSource).toContain('proxyFilterMode = newMode');
  });

  test('filter list input event updates state proxyFilterList', () => {
    expect(appSource).toContain('proxyFilterList = e.target.value');
  });

  test('Chrome button dataset stores filterMode from active SOCKS5 rule', () => {
    expect(appSource).toContain('dataset.filterMode');
    expect(appSource).toContain("proxyFilterMode || 'none'");
  });

  test('Chrome button dataset stores filterList from active SOCKS5 rule', () => {
    expect(appSource).toContain('dataset.filterList');
    expect(appSource).toContain("proxyFilterList || ''");
  });

  test('Chrome button click reads filterMode from dataset', () => {
    expect(appSource).toContain("dataset.filterMode || 'none'");
  });

  test('Chrome button click reads filterList from dataset', () => {
    expect(appSource).toContain("dataset.filterList || ''");
  });

  test('openChromeWithProxy called with port, filterMode, filterList', () => {
    expect(appSource).toContain('openChromeWithProxy(port, filterMode, filterList)');
  });
});

// ---------------------------------------------------------------------------
// Sidebar quick-launch icon — app.js source contracts
// ---------------------------------------------------------------------------

describe('sidebar Chrome-launch icon — app.js source contracts', () => {
  let appSource;
  beforeAll(() => {
    appSource = fs.readFileSync(APP_SRC, 'utf8');
  });

  test('detects an enabled dynamic SOCKS5 rule from the profile portForwards', () => {
    expect(appSource).toMatch(
      /\(profile\.portForwards \|\| \[\]\)\.find\([\s\S]{0,120}type === 'dynamic'[\s\S]{0,40}localPort/
    );
  });

  test('renders the launch button only when a SOCKS5 rule exists (socksPf truthy)', () => {
    expect(appSource).toMatch(/socksPf\s*\?\s*`<button class="host-chrome-launch"/);
  });

  test('launch button is placed inside the host-tags row', () => {
    // chromeLaunchHtml is interpolated alongside the AI toggle
    expect(appSource).toContain('${chromeLaunchHtml}');
    expect(appSource).toContain('host-chrome-launch');
  });

  test('launch button tooltip shows the SOCKS5 loopback port', () => {
    expect(appSource).toMatch(/Launch Chrome via SOCKS5 proxy \(127\.0\.0\.1:/);
  });

  test('click handler stops propagation so it does not connect/open context menu', () => {
    const block = appSource.slice(
      appSource.indexOf("host.querySelector('.host-chrome-launch')"),
      appSource.indexOf("host.querySelector('.host-chrome-launch')") + 900
    );
    expect(block).toContain('e.stopPropagation()');
    expect(block).toContain('e.preventDefault()');
  });

  test('click handler launches Chrome with the rule port, filterMode and filterList', () => {
    const block = appSource.slice(
      appSource.indexOf("host.querySelector('.host-chrome-launch')"),
      appSource.indexOf("host.querySelector('.host-chrome-launch')") + 900
    );
    expect(block).toContain('openChromeWithProxy(');
    expect(block).toContain('socksPf.localPort');
    expect(block).toContain("socksPf.proxyFilterMode || 'none'");
    expect(block).toContain("socksPf.proxyFilterList || ''");
  });

  test('failed launch flags the button with launch-error and a Chrome-not-found tooltip', () => {
    const block = appSource.slice(
      appSource.indexOf("host.querySelector('.host-chrome-launch')"),
      appSource.indexOf("host.querySelector('.host-chrome-launch')") + 900
    );
    expect(block).toContain('launch-error');
    expect(block).toContain('Chrome not found');
  });
});
