'use strict';
/**
 * tests/unit/platform-paths.test.js
 *
 * Unit tests for src/main/platform.js — the per-OS resolver layer.
 * process.platform is overridden per test; child_process.execSync and fs are
 * mocked so binary discovery is deterministic on any runner.
 */

jest.mock('child_process', () => ({ execSync: jest.fn() }));

const fs = require('fs');
const cp = require('child_process');
const platform = require('../../src/main/platform');

const realPlatform = process.platform;
function setPlatform(p) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}
afterEach(() => {
  setPlatform(realPlatform);
  jest.restoreAllMocks();
  cp.execSync.mockReset();
});

// ---------------------------------------------------------------------------
// shellExec
// ---------------------------------------------------------------------------

describe('shellExec', () => {
  test('Windows wraps with cmd /c', () => {
    setPlatform('win32');
    const r = platform.shellExec('echo hi');
    expect(r.args[0]).toBe('/c');
    expect(r.args[1]).toBe('echo hi');
    expect(r.shell.toLowerCase()).toContain('cmd');
  });
  test('macOS/Linux wrap with /bin/sh -c', () => {
    setPlatform('darwin');
    expect(platform.shellExec('ls')).toEqual({ shell: '/bin/sh', args: ['-c', 'ls'] });
    setPlatform('linux');
    expect(platform.shellExec('ls')).toEqual({ shell: '/bin/sh', args: ['-c', 'ls'] });
  });
});

// ---------------------------------------------------------------------------
// loginShellArgs
// ---------------------------------------------------------------------------

describe('loginShellArgs', () => {
  test('Windows: no login flag', () => {
    setPlatform('win32');
    expect(platform.loginShellArgs()).toEqual([]);
  });
  test('Unix: -l login flag', () => {
    setPlatform('linux');
    expect(platform.loginShellArgs()).toEqual(['-l']);
  });
});

// ---------------------------------------------------------------------------
// claudeDesktopConfigPath
// ---------------------------------------------------------------------------

describe('claudeDesktopConfigPath', () => {
  test('macOS uses Library/Application Support/Claude', () => {
    setPlatform('darwin');
    expect(platform.claudeDesktopConfigPath()).toMatch(/Library\/Application Support\/Claude\/claude_desktop_config\.json$/);
  });
  test('Windows uses APPDATA\\Claude', () => {
    setPlatform('win32');
    const prev = process.env.APPDATA;
    process.env.APPDATA = 'C:\\Users\\me\\AppData\\Roaming';
    expect(platform.claudeDesktopConfigPath()).toContain('Claude');
    expect(platform.claudeDesktopConfigPath()).toContain('claude_desktop_config.json');
    if (prev === undefined) delete process.env.APPDATA; else process.env.APPDATA = prev;
  });
  test('Linux uses .config/Claude', () => {
    setPlatform('linux');
    const prev = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    expect(platform.claudeDesktopConfigPath()).toMatch(/\.config\/Claude\/claude_desktop_config\.json$/);
    if (prev !== undefined) process.env.XDG_CONFIG_HOME = prev;
  });
});

// ---------------------------------------------------------------------------
// sshAgentSock
// ---------------------------------------------------------------------------

describe('sshAgentSock', () => {
  test('returns SSH_AUTH_SOCK when set (any OS)', () => {
    setPlatform('win32');
    const prev = process.env.SSH_AUTH_SOCK;
    process.env.SSH_AUTH_SOCK = '/tmp/agent.sock';
    expect(platform.sshAgentSock()).toBe('/tmp/agent.sock');
    if (prev === undefined) delete process.env.SSH_AUTH_SOCK; else process.env.SSH_AUTH_SOCK = prev;
  });
  test('null on non-mac when unset', () => {
    setPlatform('linux');
    const prev = process.env.SSH_AUTH_SOCK;
    delete process.env.SSH_AUTH_SOCK;
    expect(platform.sshAgentSock()).toBeNull();
    if (prev !== undefined) process.env.SSH_AUTH_SOCK = prev;
  });
});

// ---------------------------------------------------------------------------
// whichBin
// ---------------------------------------------------------------------------

describe('whichBin', () => {
  test('returns an existing candidate without calling the OS', () => {
    setPlatform('linux');
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === '/opt/thing/bin');
    expect(platform.whichBin('thing', ['/nope', '/opt/thing/bin'])).toBe('/opt/thing/bin');
    expect(cp.execSync).not.toHaveBeenCalled();
  });
  test('falls back to which/where and trims first line', () => {
    setPlatform('linux');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    cp.execSync.mockReturnValue(Buffer.from('/usr/bin/node\n'));
    expect(platform.whichBin('node', [])).toBe('/usr/bin/node');
  });
  test('Windows where: takes the first of multiple lines', () => {
    setPlatform('win32');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    cp.execSync.mockReturnValue(Buffer.from('C:\\a\\chrome.exe\r\nC:\\b\\chrome.exe\r\n'));
    expect(platform.whichBin('chrome.exe', [])).toBe('C:\\a\\chrome.exe');
  });
  test('returns null when nothing found', () => {
    setPlatform('linux');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    cp.execSync.mockImplementation(() => { throw new Error('not found'); });
    expect(platform.whichBin('ghost', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// chromePath
// ---------------------------------------------------------------------------

describe('chromePath', () => {
  test('macOS returns the app-bundle path when present', () => {
    setPlatform('darwin');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(platform.chromePath()).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  });
  test('macOS returns null when Chrome absent', () => {
    setPlatform('darwin');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(platform.chromePath()).toBeNull();
  });
  test('Linux resolves via which', () => {
    setPlatform('linux');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    cp.execSync.mockImplementation((c) => {
      if (String(c).includes('google-chrome')) return Buffer.from('/usr/bin/google-chrome\n');
      throw new Error('nope');
    });
    expect(platform.chromePath()).toBe('/usr/bin/google-chrome');
  });
});

// ---------------------------------------------------------------------------
// findShell
// ---------------------------------------------------------------------------

describe('resolveCommand', () => {
  test('non-Windows returns the command unchanged', () => {
    setPlatform('linux');
    expect(platform.resolveCommand('ssh')).toBe('ssh');
  });
  test('Windows resolves bare ssh to the OpenSSH full path', () => {
    setPlatform('win32');
    const sshExe = require('path').join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe');
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === sshExe);
    expect(platform.resolveCommand('ssh')).toBe(sshExe);
  });
  test('Windows leaves an absolute path untouched', () => {
    setPlatform('win32');
    expect(platform.resolveCommand('C:\\Windows\\System32\\cmd.exe')).toBe('C:\\Windows\\System32\\cmd.exe');
  });
  test('Windows leaves a name with extension untouched', () => {
    setPlatform('win32');
    expect(platform.resolveCommand('powershell.exe')).toBe('powershell.exe');
  });
});

describe('findShell', () => {
  test('Unix returns first executable candidate', () => {
    setPlatform('linux');
    const prev = process.env.SHELL;
    delete process.env.SHELL;
    jest.spyOn(fs, 'accessSync').mockImplementation((p) => { if (p !== '/bin/zsh') throw new Error('no'); });
    expect(platform.findShell()).toBe('/bin/zsh');
    if (prev !== undefined) process.env.SHELL = prev;
  });
  test('Windows returns a shell and no login args', () => {
    setPlatform('win32');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    cp.execSync.mockImplementation(() => { throw new Error('not found'); });
    const sh = platform.findShell();
    expect(typeof sh).toBe('string');
    expect(sh.length).toBeGreaterThan(0);
    expect(platform.loginShellArgs()).toEqual([]);
  });
});
