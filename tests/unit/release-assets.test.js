'use strict';
/**
 * Release artifact naming is a cross-repo contract.
 *
 * install.sh, the Homebrew cask and the Scoop manifest all construct download
 * URLs from electron-builder's artifactName templates. Renaming an artifact
 * silently breaks all three at once, and only at install time — long after CI
 * is green. These tests render the templates and assert the shape the
 * installers depend on.
 *
 * electron-builder's DEFAULT names omit the arch suffix for x64, which is why
 * every consumed target sets artifactName explicitly.
 */

const pkg = require('../../package.json');

/** Minimal renderer for the electron-builder template vars we use. */
const render = (tpl, vars) =>
  tpl.replace(/\$\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`unknown template var \${${k}}`);
    return vars[k];
  });

const V = { productName: pkg.build.productName, version: '1.5.0-rc.1' };
const name = (tpl, arch, ext) => render(tpl, { ...V, arch, ext });

describe('artifact names are explicit (not electron-builder defaults)', () => {
  for (const target of ['mac', 'win', 'appImage']) {
    test(`${target} sets artifactName`, () => {
      expect(pkg.build[target].artifactName).toBeTruthy();
    });
  }

  test('every consumed template carries an arch suffix', () => {
    // Without ${arch} an x64 and an arm64 build collide on one filename.
    for (const target of ['mac', 'win', 'appImage']) {
      expect(pkg.build[target].artifactName).toContain('${arch}');
      expect(pkg.build[target].artifactName).toContain('${version}');
    }
  });
});

describe('the exact filenames the installers build URLs from', () => {
  test('macOS zip — consumed by the Homebrew cask', () => {
    expect(name(pkg.build.mac.artifactName, 'arm64', 'zip'))
      .toBe('Prateek-Term-1.5.0-rc.1-mac-arm64.zip');
  });

  test('Windows zip — consumed by the Scoop manifest, both arches', () => {
    expect(name(pkg.build.win.artifactName, 'x64', 'zip'))
      .toBe('Prateek-Term-1.5.0-rc.1-win-x64.zip');
    expect(name(pkg.build.win.artifactName, 'arm64', 'zip'))
      .toBe('Prateek-Term-1.5.0-rc.1-win-arm64.zip');
  });

  test('no two platforms can produce the same filename', () => {
    // v1.5.0-rc.1 shipped with mac and win BOTH rendering
    // Prateek-Term-<v>-arm64.zip. CI flattens every runner's artifacts into one
    // directory, so the second copy silently overwrote the first and Scoop's
    // arm64 entry pointed at a macOS .app bundle.
    const rendered = [];
    for (const [target, exts] of [['mac', ['zip', 'dmg']], ['win', ['zip']], ['appImage', ['AppImage']]]) {
      for (const arch of ['x64', 'x86_64', 'arm64']) {
        for (const ext of exts) rendered.push(name(pkg.build[target].artifactName, arch, ext));
      }
    }
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  test('AppImage — consumed by install.sh, both arches', () => {
    // electron-builder substitutes ${arch} as x86_64 for AppImage (the AppImage
    // convention), NOT x64 like every other target. Confirmed against the real
    // published assets — asserting x64 here previously passed while install.sh
    // 404'd on every Intel/AMD machine.
    expect(name(pkg.build.appImage.artifactName, 'x86_64', 'AppImage'))
      .toBe('Prateek-Term-1.5.0-rc.1-x86_64.AppImage');
    expect(name(pkg.build.appImage.artifactName, 'arm64', 'AppImage'))
      .toBe('Prateek-Term-1.5.0-rc.1-arm64.AppImage');
  });

  test('install.ps1 asks for the current win zip name', () => {
    const fs = require('fs');
    const path = require('path');
    const ps = fs.readFileSync(path.join(__dirname, '../../install.ps1'), 'utf8');
    // The -win- infix arrived with the rc.2 collision fix; without it this 404s.
    expect(ps).toContain('Prateek-Term-$ver-win-$Arch.zip');
  });

  test('install.ps1 avoids the two PowerShell 5.1 traps', () => {
    const fs = require('fs');
    const path = require('path');
    const ps = fs.readFileSync(path.join(__dirname, '../../install.ps1'), 'utf8');
    // Without -UseBasicParsing, PS 5.1 routes parsing through the IE engine and
    // throws NullReferenceException until IE's first-run wizard is done.
    // Strip comment lines first — the file explains these traps in prose, and
    // matching that text is not the same as matching a real invocation.
    const code = ps.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const calls = code.match(/Invoke-(WebRequest|RestMethod)[^\n]*/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toContain('-UseBasicParsing');
    // \Q...\E is PCRE; .NET throws "Unrecognized escape sequence \Q".
    expect(code).not.toMatch(/-match[^\n]*\\Q/);
  });

  test('install.sh asks for the arch names electron-builder actually emits', () => {
    const fs = require('fs');
    const path = require('path');
    const sh = fs.readFileSync(path.join(__dirname, '../../install.sh'), 'utf8');
    expect(sh).toMatch(/x86_64\|amd64\)\s+ARCH=x86_64/);
    expect(sh).toMatch(/aarch64\|arm64\)\s+ARCH=arm64/);
    expect(sh).toContain('Prateek-Term-${VERSION}-${ARCH}.AppImage');
  });
});

describe('targets required by the distribution channels', () => {
  test('Windows builds a zip — Scoop extracts one', () => {
    // NSIS would need silent-install hacks that break `scoop uninstall`, and
    // electron-builder "portable" re-extracts ~200MB to temp on every launch.
    expect(pkg.build.win.target).toContain('zip');
  });

  test('macOS still builds dmg + zip, arm64 only', () => {
    const targets = pkg.build.mac.target.map((t) => t.target);
    expect(targets).toEqual(expect.arrayContaining(['dmg', 'zip']));
    for (const t of pkg.build.mac.target) expect(t.arch).toEqual(['arm64']);
  });

  test('Linux still builds AppImage + deb', () => {
    expect(pkg.build.linux.target).toEqual(expect.arrayContaining(['AppImage', 'deb']));
  });

  test('nsis/portable keep their own names (target-level wins over win.*)', () => {
    expect(pkg.build.nsis.artifactName).toContain('Setup');
    expect(pkg.build.portable.artifactName).toContain('portable');
  });
});

describe('CI publishes what the installers expect', () => {
  const fs = require('fs');
  const path = require('path');
  const ci = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/ci.yml'), 'utf8',
  );

  test('a version guard blocks a tag that disagrees with package.json', () => {
    expect(ci).toContain('Version guard');
    expect(ci).toContain('does not match package.json');
  });

  test('the guard runs unconditionally — an `if:` on the job would skip build', () => {
    // A skipped `needs` dependency skips every dependent job, so `build` would
    // stop running on main. The job must self-exit for non-tags instead.
    const job = ci.match(/ {2}guard:[\s\S]{0,1400}/);
    expect(job).not.toBeNull();
    expect(job[0]).toContain('Not a tag build');
    expect(job[0]).not.toMatch(/^ {4}if:/m);
  });

  test('SHA256SUMS is generated with bare filenames', () => {
    // install.sh does: grep " <file>$" SHA256SUMS | sha256sum -c -
    // `sha256sum ./*` would emit "./name" and never match.
    expect(ci).toContain('sha256sum $(ls -1) > SHA256SUMS');
    expect(ci).not.toContain('sha256sum ./*');
  });

  test('SHA256SUMS cannot hash itself', () => {
    expect(ci).toMatch(/rm -f[^\n]*SHA256SUMS[\s\S]{0,80}sha256sum \$\(ls -1\)/);
  });

  test('release assets are explicit — no .blockmap / latest*.yml noise', () => {
    expect(ci).toContain('dist/SHA256SUMS');
    expect(ci).not.toContain('files: dist/*');
  });
});

// ---------------------------------------------------------------------------
// The download tables must name files that actually exist
// ---------------------------------------------------------------------------
describe('every filename quoted in the docs is one CI really produces', () => {
  const fs   = require('fs');
  const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');

  const VER = '1.5.0-rc.9';

  /**
   * Every asset electron-builder will emit for VER. Built from the same
   * artifactName templates the build uses, so a template change moves this set
   * and any doc still naming the old file fails.
   */
  const real = new Set();
  {
    const V2 = { productName: pkg.build.productName, version: VER };
    const n = (tpl, arch, ext) => render(tpl, { ...V2, arch, ext });
    // dmg has no artifactName of its own — it inherits mac's.
    for (const ext of ['dmg', 'zip']) real.add(n(pkg.build.mac.artifactName, 'arm64', ext));
    for (const arch of ['x64', 'arm64']) {
      real.add(n(pkg.build.win.artifactName,  arch, 'zip'));
      real.add(n(pkg.build.nsis.artifactName, arch, 'exe'));
      real.add(n(pkg.build.portable.artifactName, arch, 'exe'));
    }
    // AppImage arch names are electron-builder's own (x86_64, not x64).
    for (const arch of ['x86_64', 'arm64']) real.add(n(pkg.build.appImage.artifactName, arch, 'AppImage'));
    // .deb uses the electron-builder default template.
    for (const arch of ['amd64', 'arm64']) real.add(`${pkg.name}_${VER}_${arch}.deb`);
  }

  /** Backticked artifact filenames, with the doc's version placeholder normalized. */
  const quoted = (src) =>
    // ci.yml writes the table inside a shell heredoc, so its backticks are
    // escaped as \` — unescape before matching.
    [...src.replace(/\\`/g, '`')
        .matchAll(/`((?:Prateek-Term|prateek-term)[^`\s]*\.(?:dmg|zip|exe|AppImage|deb))`/g)]
      .map((m) => m[1]
        .replace(/\$\{VERSION\}/g, VER)
        .replace(/\d+\.\d+\.\d+(?:-rc\.\d+)?/g, VER))
      .filter((f, i, a) => a.indexOf(f) === i);

  for (const doc of ['.github/workflows/ci.yml', 'RELEASE_NOTES.md']) {
    test(`${doc} names only real assets`, () => {
      const named = quoted(read(doc));
      // A table that matched nothing would pass vacuously.
      expect(named.length).toBeGreaterThan(4);
      // v1.5.0-rc.4's release page listed Prateek-Term-<v>-arm64.dmg, which is
      // not what the mac template produces (…-mac-arm64.dmg). Readers were sent
      // looking for a file that was never uploaded.
      expect(named.filter((f) => !real.has(f))).toEqual([]);
    });
  }

  test('the doc tables cover every platform we ship', () => {
    const named = quoted(read('.github/workflows/ci.yml'));
    for (const want of ['.dmg', '-x64.exe', '-arm64.exe', '.AppImage', '_amd64.deb']) {
      expect(named.some((f) => f.endsWith(want))).toBe(true);
    }
  });
});
