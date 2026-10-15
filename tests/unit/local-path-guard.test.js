'use strict';
/**
 * validateLocalPath is the trust boundary for MCP file transfer: it decides
 * which local paths an AI client may read from (upload) or write to (download).
 *
 * It claimed to allow "home directory or temp directory", but compared against
 * os.tmpdir() only — which on macOS is /var/folders/…/T. The canonical Unix temp
 * dir, /tmp (a symlink to /private/tmp), was therefore REJECTED, so anything
 * staged in /tmp could not be uploaded at all.
 *
 * The prefix test was also unanchored, so a sibling directory whose name merely
 * starts with the home path (…/prateek-evil) slipped through.
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');

const { validateLocalPath } = require('../../src/main/http-bridge');

const ok     = (p) => expect(validateLocalPath(p)).toBeNull();
const denied = (p) => expect(validateLocalPath(p)).toMatch(/^localPath must/);

describe('allowed roots', () => {
  test('the home directory', () => {
    ok(path.join(os.homedir(), 'build.ipk'));
  });

  test("node's own temp dir", () => {
    ok(path.join(os.tmpdir(), 'build.ipk'));
  });

  test('/tmp — the reported bug', () => {
    // os.tmpdir() is /var/folders/…/T on macOS, so /tmp was refused despite the
    // error message promising "temp directory".
    ok('/tmp/build.ipk');
  });

  const posix = process.platform !== 'win32';
  const realTmp = () => fs.realpathSync(posix ? '/tmp' : os.tmpdir());

  (posix ? test : test.skip)('/tmp resolved through its symlink', () => {
    // macOS: /tmp -> /private/tmp. Both spellings name the same directory and
    // must behave identically. There is no /tmp on Windows.
    ok(path.join(realTmp(), 'build.ipk'));
  });

  test('nested subdirectories of an allowed root', () => {
    ok(path.join(fs.realpathSync(os.tmpdir()), 'a', 'b', 'c', 'build.ipk'));
  });

  test('a destination that does not exist yet (the download case)', () => {
    // /download validates before the file is created, so a missing path must
    // still be judged on location, not existence.
    ok(path.join(os.homedir(), 'no', 'such', 'dir', 'out.bin'));
  });

  test('an allowed root itself', () => {
    ok(os.homedir());
  });
});

describe('denied paths', () => {
  test('a system file', () => {
    denied('/etc/passwd');
  });

  test('a sibling directory that merely shares the home prefix', () => {
    // startsWith(home) with no separator let "/Users/prateek-evil" pass.
    denied(os.homedir() + '-evil/secrets.txt');
  });

  test('.. traversal escaping an allowed root', () => {
    denied('/tmp/../etc/passwd');
    denied(`${os.homedir()}/../../etc/passwd`);
  });

  test('a relative path is resolved before judging, not taken at face value', () => {
    // Deliberately CWD-independent: climb far enough that the result is "/etc"
    // no matter where the bridge happens to be running from.
    denied(`${os.homedir()}/${Array(12).fill('..').join('/')}/etc/passwd`);
  });
});

// Symlink creation needs elevation on Windows, and there is no /tmp there.
const describeSymlink = process.platform === 'win32' ? describe.skip : describe;

describeSymlink('symlinks cannot be used to escape a root', () => {
  let dir, link;
  beforeAll(() => {
    dir  = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'pt-guard-'));
    link = path.join(dir, 'escape');
    fs.symlinkSync('/etc', link);
  });
  afterAll(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('a symlink inside /tmp pointing at /etc is refused', () => {
    // Without realpath resolution this reads as "/tmp/…/escape/passwd" and the
    // prefix test passes, handing an AI client arbitrary file reads.
    denied(path.join(link, 'passwd'));
  });

  test("appending '..' after a symlink does not get past the guard", () => {
    // path.resolve() collapses `link/..` LEXICALLY before realpath sees it, so
    // the guard judged "<tmp>/etc/hosts" (inside a root) while scp would be
    // handed the original path and the OS would follow link -> /etc and read
    // the real /etc/hosts. Verified reachable on this machine before the fix.
    // NB: built by concatenation — path.join() would collapse the '..' itself,
    // which is exactly the lexical collapse that created the hole.
    denied(`${link}/../etc/hosts`);
    denied(`${dir}/a/../../../etc/passwd`);
  });

  test('a symlink inside HOME is resolved too, not just one inside tmp', () => {
    // The tmp-only case passed even before realpath resolution existed, because
    // /etc is outside every root either way. A link under HOME is where the
    // resolution actually changes the verdict.
    const hdir = fs.mkdtempSync(path.join(fs.realpathSync(os.homedir()), '.pt-guard-'));
    try {
      const hlink = path.join(hdir, 'escape');
      fs.symlinkSync('/etc', hlink);
      denied(path.join(hlink, 'passwd'));
    } finally {
      fs.rmSync(hdir, { recursive: true, force: true });
    }
  });

  test('a real file inside that temp dir is still allowed', () => {
    const f = path.join(dir, 'build.ipk');
    fs.writeFileSync(f, 'x');
    ok(f);
  });
});
