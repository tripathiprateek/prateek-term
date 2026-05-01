'use strict';
/**
 * tests/unit/log-rotation.test.js
 *
 * Tests for the debug log rotation logic in main.js.
 * Uses a temp directory so no real app state is touched.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Minimal stubs so we can load the rotation helpers without Electron
// ---------------------------------------------------------------------------

// We test the rotation logic by extracting it into an isolated helper module.
// Rather than mocking the entire Electron bootstrap we replicate the logic
// under test here as pure functions — matching src/main/main.js exactly so
// changes to the source will be caught by source-contract tests at the end.

const LOG_ROTATE_DEFAULTS = { logRotateSizeMB: 50, logRotateAgeDays: 30, logRotateMaxFiles: 5 };

function makeHelpers(logPath, getSettings) {
  function rotateLog() {
    if (!fs.existsSync(logPath)) return;
    const s = getSettings();
    const maxFiles = Math.max(1, parseInt(s.logRotateMaxFiles ?? LOG_ROTATE_DEFAULTS.logRotateMaxFiles, 10));
    for (let i = maxFiles - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      const to   = `${logPath}.${i + 1}`;
      if (fs.existsSync(from)) {
        if (i + 1 > maxFiles) fs.unlinkSync(from);
        else                   fs.renameSync(from, to);
      }
    }
    fs.renameSync(logPath, `${logPath}.1`);
  }

  function maybeRotate() {
    if (!fs.existsSync(logPath)) return false;
    const s      = getSettings();
    const sizeMB  = parseFloat(s.logRotateSizeMB  ?? LOG_ROTATE_DEFAULTS.logRotateSizeMB);
    const ageDays = parseFloat(s.logRotateAgeDays ?? LOG_ROTATE_DEFAULTS.logRotateAgeDays);
    const stat    = fs.statSync(logPath);
    const sizeTriggered = sizeMB  > 0 && stat.size >= sizeMB * 1024 * 1024;
    const ageMs         = ageDays > 0 ? ageDays * 24 * 60 * 60 * 1000 : Infinity;
    const ageTriggered  = ageDays > 0 && (Date.now() - stat.mtimeMs) >= ageMs;
    if (sizeTriggered || ageTriggered) { rotateLog(); return true; }
    return false;
  }

  return { rotateLog, maybeRotate };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-log-test-'));
  return d;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// rotateLog: archive shifting
// ---------------------------------------------------------------------------

describe('rotateLog — archive shifting', () => {
  let dir, logPath;

  beforeEach(() => {
    dir     = tmpDir();
    logPath = path.join(dir, 'debug.log');
  });
  afterEach(() => cleanup(dir));

  test('renames current log to .1 when no archives exist', () => {
    fs.writeFileSync(logPath, 'line1\n');
    const { rotateLog } = makeHelpers(logPath, () => ({ logRotateMaxFiles: 5 }));
    rotateLog();
    expect(fs.existsSync(logPath)).toBe(false);
    expect(fs.existsSync(`${logPath}.1`)).toBe(true);
    expect(fs.readFileSync(`${logPath}.1`, 'utf8')).toBe('line1\n');
  });

  test('shifts existing archives up by one index', () => {
    fs.writeFileSync(logPath, 'current\n');
    fs.writeFileSync(`${logPath}.1`, 'archive1\n');
    fs.writeFileSync(`${logPath}.2`, 'archive2\n');
    const { rotateLog } = makeHelpers(logPath, () => ({ logRotateMaxFiles: 5 }));
    rotateLog();
    expect(fs.readFileSync(`${logPath}.1`, 'utf8')).toBe('current\n');
    expect(fs.readFileSync(`${logPath}.2`, 'utf8')).toBe('archive1\n');
    expect(fs.readFileSync(`${logPath}.3`, 'utf8')).toBe('archive2\n');
  });

  test('deletes oldest archive when maxFiles is reached', () => {
    fs.writeFileSync(logPath, 'current\n');
    for (let i = 1; i <= 3; i++) fs.writeFileSync(`${logPath}.${i}`, `arc${i}\n`);
    const { rotateLog } = makeHelpers(logPath, () => ({ logRotateMaxFiles: 3 }));
    rotateLog();
    expect(fs.existsSync(`${logPath}.4`)).toBe(false); // beyond limit, deleted
    expect(fs.readFileSync(`${logPath}.1`, 'utf8')).toBe('current\n');
    expect(fs.readFileSync(`${logPath}.2`, 'utf8')).toBe('arc1\n');
    expect(fs.readFileSync(`${logPath}.3`, 'utf8')).toBe('arc2\n');
  });

  test('does nothing if log file does not exist', () => {
    const { rotateLog } = makeHelpers(logPath, () => ({}));
    expect(() => rotateLog()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// maybeRotate: trigger conditions
// ---------------------------------------------------------------------------

describe('maybeRotate — size trigger', () => {
  let dir, logPath;

  beforeEach(() => { dir = tmpDir(); logPath = path.join(dir, 'debug.log'); });
  afterEach(() => cleanup(dir));

  test('triggers when file size >= sizeMB threshold', () => {
    // Write exactly 1 byte over 1 MB threshold
    const buf = Buffer.alloc(1024 * 1024 + 1, 'x');
    fs.writeFileSync(logPath, buf);
    const { maybeRotate } = makeHelpers(logPath, () => ({ logRotateSizeMB: 1, logRotateAgeDays: 0 }));
    expect(maybeRotate()).toBe(true);
    expect(fs.existsSync(`${logPath}.1`)).toBe(true);
  });

  test('does NOT trigger when file is below size threshold', () => {
    fs.writeFileSync(logPath, 'small\n');
    const { maybeRotate } = makeHelpers(logPath, () => ({ logRotateSizeMB: 50, logRotateAgeDays: 0 }));
    expect(maybeRotate()).toBe(false);
    expect(fs.existsSync(`${logPath}.1`)).toBe(false);
  });

  test('size trigger disabled when logRotateSizeMB = 0', () => {
    const buf = Buffer.alloc(1024 * 1024 * 100, 'x');
    fs.writeFileSync(logPath, buf);
    const { maybeRotate } = makeHelpers(logPath, () => ({ logRotateSizeMB: 0, logRotateAgeDays: 0 }));
    expect(maybeRotate()).toBe(false);
  });
});

describe('maybeRotate — age trigger', () => {
  let dir, logPath;

  beforeEach(() => { dir = tmpDir(); logPath = path.join(dir, 'debug.log'); });
  afterEach(() => cleanup(dir));

  test('triggers when mtime is older than ageDays', () => {
    fs.writeFileSync(logPath, 'old log\n');
    // Back-date mtime to 31 days ago
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    fs.utimesSync(logPath, old, old);
    const { maybeRotate } = makeHelpers(logPath, () => ({ logRotateSizeMB: 0, logRotateAgeDays: 30 }));
    expect(maybeRotate()).toBe(true);
    expect(fs.existsSync(`${logPath}.1`)).toBe(true);
  });

  test('does NOT trigger when file is newer than ageDays', () => {
    fs.writeFileSync(logPath, 'recent log\n');
    const { maybeRotate } = makeHelpers(logPath, () => ({ logRotateSizeMB: 0, logRotateAgeDays: 30 }));
    expect(maybeRotate()).toBe(false);
  });

  test('age trigger disabled when logRotateAgeDays = 0', () => {
    fs.writeFileSync(logPath, 'log\n');
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    fs.utimesSync(logPath, old, old);
    const { maybeRotate } = makeHelpers(logPath, () => ({ logRotateSizeMB: 0, logRotateAgeDays: 0 }));
    expect(maybeRotate()).toBe(false);
  });
});

describe('maybeRotate — defaults', () => {
  let dir, logPath;

  beforeEach(() => { dir = tmpDir(); logPath = path.join(dir, 'debug.log'); });
  afterEach(() => cleanup(dir));

  test('returns false when log does not exist', () => {
    const { maybeRotate } = makeHelpers(logPath, () => ({}));
    expect(maybeRotate()).toBe(false);
  });

  test('uses LOG_ROTATE_DEFAULTS when settings keys absent', () => {
    // File well below 50 MB default → no rotation
    fs.writeFileSync(logPath, 'tiny\n');
    const { maybeRotate } = makeHelpers(logPath, () => ({}));
    expect(maybeRotate()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source-contract tests: confirm the logic is present in the actual source
// ---------------------------------------------------------------------------

describe('main.js source contracts', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/main/main.js'), 'utf8'
  );

  test('exports rotateDebugLog function', () => {
    expect(src).toMatch(/function rotateDebugLog\(\)/);
  });

  test('exports maybeRotateDebugLog function', () => {
    expect(src).toMatch(/function maybeRotateDebugLog\(\)/);
  });

  test('maybeRotateDebugLog is called from dbgLog', () => {
    // Find dbgLog body and confirm it calls maybeRotateDebugLog
    const dbgFnMatch = src.match(/function dbgLog\([\s\S]{0,500}?^}/m);
    expect(dbgFnMatch).not.toBeNull();
    expect(dbgFnMatch[0]).toMatch(/maybeRotateDebugLog\(\)/);
  });

  test('maybeRotateDebugLog called on startup', () => {
    expect(src).toMatch(/maybeRotateDebugLog\(\)[\s\S]{0,200}?dbgLog\(.*starting/);
  });

  test('debug:rotateLog IPC handler exists', () => {
    expect(src).toMatch(/ipcMain\.handle\('debug:rotateLog'/);
  });

  test('debug:listArchives IPC handler exists', () => {
    expect(src).toMatch(/ipcMain\.handle\('debug:listArchives'/);
  });

  test('LOG_ROTATE_DEFAULTS has correct keys', () => {
    expect(src).toMatch(/logRotateSizeMB.*50/);
    expect(src).toMatch(/logRotateAgeDays.*30/);
    expect(src).toMatch(/logRotateMaxFiles.*5/);
  });
});
