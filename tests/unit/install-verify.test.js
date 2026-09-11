'use strict';
/**
 * install.sh integrity contract.
 *
 * Prateek-Term is not code-signed on any platform, so SHA256SUMS is the only
 * integrity guarantee a `curl … | sh` user gets. That guarantee has to cover
 * whatever actually lands on disk.
 *
 * It did not. On arm64 Linux the bundled AppImage runtime cannot start (it
 * links the unversioned libz.so), so the installer falls back to the .deb —
 * and the .deb was unpacked straight from the network with no check. The
 * "Checksum verified." line printed just before it referred to the AppImage,
 * which was then discarded. Reported from a real Ubuntu 24.04 arm64 install.
 */

const fs   = require('fs');
const path = require('path');

const SH = fs.readFileSync(path.join(__dirname, '../../install.sh'), 'utf8');

/** Release payloads pulled from $BASE into $TMP, excluding SHA256SUMS itself. */
const payloads = [...SH.matchAll(/^\s*fetch "\$BASE\/([^"]+)" "\$TMP\/([^"]+)"/gm)]
  .map((m) => m[2])
  .filter((f) => !f.includes('SHA256SUMS'));

describe('every installed payload is checksum-verified', () => {
  test('the fetches we expect are present (guards against a vacuous pass)', () => {
    // The AppImage and the .deb fallback. If a third payload is ever added,
    // this fails and forces a decision rather than silently skipping it.
    expect(payloads.sort()).toEqual(['$DEB', '$FILE']);
  });

  for (const p of payloads) {
    test(`${p} is passed to verify()`, () => {
      expect(SH).toMatch(new RegExp(`^\\s*verify "\\${p}"`, 'm'));
    });
  }

  test('the .deb is verified BEFORE it is unpacked', () => {
    // Order matters: dpkg-deb -x writes into $LIB/app, so verifying afterwards
    // would leave an unverified tree on disk even when we then bail out.
    const i = SH.indexOf('verify "$DEB"');
    const j = SH.indexOf('dpkg-deb -x "$TMP/$DEB"');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
  });
});

describe('verify() fails closed', () => {
  const fn = SH.match(/^verify\(\) \{[\s\S]*?^\}/m);

  test('it exists as a reusable function, not an inline one-off', () => {
    // The bug existed because the check was inlined at the first download and
    // could not be reused by the fallback path.
    expect(fn).not.toBeNull();
  });

  test('a mismatch aborts the install — it never warns and continues', () => {
    expect(fn[0]).toMatch(/\|\|\s*die "checksum verification FAILED/);
    expect(fn[0]).not.toMatch(/\|\|\s*say/);
  });

  test('a filename absent from SHA256SUMS also aborts', () => {
    // grep matches nothing -> `$SUM -c -` gets empty stdin -> exits 1 -> die.
    // Anchoring the filename with " name$" is what makes a missing entry empty
    // rather than a loose substring hit on some other asset.
    expect(fn[0]).toMatch(/grep " \$1\\\$" SHA256SUMS/);
  });

  test('verification is skipped only when the release published no SHA256SUMS', () => {
    expect(fn[0]).toMatch(/\[ "\$HAVE_SUMS" = yes \] \|\| return 0/);
    expect(SH).toMatch(/HAVE_SUMS=no\n\s*say "warning: SHA256SUMS not published/);
  });
});
