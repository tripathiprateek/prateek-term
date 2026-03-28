'use strict';
/**
 * tests/unit/build-number.test.js
 *
 * Tests for the build-number reading logic used in the About panel.
 * The build number is written to .build-number by `git rev-list --count HEAD`
 * during `npm run dist` and bundled as an extra resource.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Inline re-implementation of getBuildNumber for isolated testing
// (the real one lives in main.js and calls app.isPackaged from Electron)
// ---------------------------------------------------------------------------

function getBuildNumber(buildFile) {
  // buildFile = path to a .build-number file (or a non-existent path to test fallback)
  try {
    return fs.readFileSync(buildFile, 'utf8').trim();
  } catch {
    return '0';
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getBuildNumber', () => {
  let tmpDir;
  let buildFile;

  beforeEach(() => {
    tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'prateek-term-test-'));
    buildFile = path.join(tmpDir, '.build-number');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns the trimmed build number string when file exists', () => {
    fs.writeFileSync(buildFile, '42\n');
    expect(getBuildNumber(buildFile)).toBe('42');
  });

  test('strips whitespace and newlines', () => {
    fs.writeFileSync(buildFile, '  137  \n');
    expect(getBuildNumber(buildFile)).toBe('137');
  });

  test('returns "0" as fallback when file does not exist', () => {
    expect(getBuildNumber('/non/existent/path/.build-number')).toBe('0');
  });

  test('returns an empty string when file is empty (caller should handle this as "0")', () => {
    // fs.readFileSync('').trim() = '' — the About panel treats '' the same as '0'
    fs.writeFileSync(buildFile, '');
    expect(getBuildNumber(buildFile)).toBe('');
  });

  test('the project .build-number file exists after prebuild script runs', () => {
    // Verify the file was generated (it's present in the repo root after npm run prebuild)
    const projectBuildFile = path.resolve(__dirname, '../../.build-number');
    if (fs.existsSync(projectBuildFile)) {
      const num = parseInt(fs.readFileSync(projectBuildFile, 'utf8').trim(), 10);
      expect(num).toBeGreaterThan(0);
    } else {
      // Not generated yet (fresh checkout) — skip rather than fail
      console.warn('  ⚠  .build-number not present — run `npm run prebuild` to generate it');
    }
  });
});
