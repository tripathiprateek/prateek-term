'use strict';
/**
 * The declared license must match the LICENSE file.
 *
 * package.json said "MIT" from the very first commit while LICENSE has always
 * been PolyForm Noncommercial 1.0.0. package.json ships inside every build and
 * is what npm, electron-builder and GitHub tooling read, so the app was
 * declaring permissive commercial-use-OK terms that the actual license forbids.
 * These tests keep the two from drifting apart again.
 */

const fs   = require('fs');
const path = require('path');

const root    = path.join(__dirname, '../..');
const pkg     = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');

describe('license consistency', () => {
  test('LICENSE is PolyForm Noncommercial 1.0.0', () => {
    expect(license).toMatch(/Polyform Noncommercial License 1\.0\.0/i);
  });

  test('package.json declares the same license, not MIT', () => {
    expect(pkg.license).toBe('LicenseRef-PolyForm-Noncommercial-1.0.0');
    expect(pkg.license).not.toBe('MIT');
  });

  test('the lockfile root entry agrees with package.json', () => {
    // npm regenerates this from package.json; a stale value re-introduces the
    // contradiction in a file that is committed and shipped.
    const lockPath = path.join(root, 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(lock.packages['']?.license).toBe(pkg.license);
  });

  test('README points at PolyForm, not MIT', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    expect(readme).toMatch(/PolyForm Noncommercial/i);
    expect(readme).not.toMatch(/\bMIT License\b/);
  });

  test('LICENSE names the current copyright holder', () => {
    expect(license).toMatch(/Copyright \(c\) \d{4} Prateek Tripathi/);
  });
});
