# Prateek-Term v1.5.0-rc.4

**Release candidate for 1.5.0** — the cross-platform release. Prateek-Term, previously macOS-only, now runs natively on **macOS, Windows, and Linux**, and installs with a single command on each of them.

> This is a pre-release for testing. Installing it opts you into the RC channel: you keep getting release candidates, and the final 1.5.0 when it ships.

## Install

**macOS** (Apple Silicon)

```sh
brew tap tripathiprateek/prateek-term
brew trust tripathiprateek/prateek-term      # Homebrew 6+ requires trusting third-party cask taps
brew install --cask prateek-term@rc
```

**Linux** (x64 / ARM64)

```sh
curl -fsSL https://raw.githubusercontent.com/tripathiprateek/prateek-term/main/install.sh | sh -s -- --channel rc
```

**Windows** (x64 / ARM64)

```powershell
scoop bucket add prateek-term https://github.com/tripathiprateek/scoop-prateek-term
scoop install prateek-term-rc
```

Prefer a direct download? See the table below, and verify against the `SHA256SUMS` published with this release.

## Highlights

- 🖥️ **Windows & Linux support** — native on Windows 10+ and modern Linux desktops, with a platform-resolver layer that centralizes every per-OS decision (shell, `PATH`, config locations, SSH agent socket, binary discovery).
- 📦 **Install with one command** — Homebrew cask, `curl … | sh`, and a Scoop bucket, all fed automatically by CI on every release. `install.sh` also takes `--channel`, `--version`, `--with-deps` and `--uninstall`.
- 🩺 **Startup environment check** — a banner tells you when a tool the app shells out to is missing *or too old*, with a one-click **Install** button that pre-types the right command for your package manager. It only warns about tools your own profiles actually need.
- 🔍 **A dead SSH agent is now detected.** When `SSH_AUTH_SOCK` points at a socket with nothing behind it, `ssh` hangs forever during auth — a failure that looks like a network problem and is nearly undiagnosable from the terminal. The app probes for it at startup.
- 🧩 **Native OS integrations** — macOS default-terminal + Finder Quick Action, a Windows Explorer right-click **"Open in Prateek-Term"**, and a Linux `.desktop` entry + `prateekterm://` handler + Nautilus action.
- 🐚 **Default Shell** setting — pick which shell new local tabs open, from the shells actually installed.
- 🔔 **Release channels** — *Automatic* follows RCs only if you already run one, so installing an RC opts you in and you still get the final release.
- ⧉ **Duplicate profile** — right-click a host → **Duplicate** to clone it with every detail under a suggested unique name.
- 🔐 **Cloudflare Access sign-in preflight** — checks for a valid token before connecting and offers a one-click browser login; failures show an actionable hint.

## Notable fixes

- **Editing a profile no longer destroys its password or its AI access.** An unscoped selector blanked the device password on save, and the save replaced the profile instead of merging — dropping the AI toggle on *every* edit.
- **Jump-host connections type the right password at each hop.** Each hop now carries its own queued credential, so the target's password is never sent to the jump host.
- **Jump hosts work on Windows** — the proxy command named `sshpass`, which does not exist there (`CreateProcessW failed error:2`); Windows now uses OpenSSH's own `-W` stdio forwarding.
- **Password jump hosts no longer hang** before the prompt — the inner `ssh` was attempting agent/publickey auth first.
- **The update check can see release candidates again.** Pre-release suffixes were stripped before comparison, so a `1.5.0-beta.2` user would have been offered neither `rc.1` nor final `1.5.0` — stranded until `1.5.1`. Full SemVer 2.0 precedence now, and the newest release is chosen by version rather than by publish date.
- **The cwd reporter no longer breaks embedded shells** — it waits for a real shell prompt instead of a fixed timer, and never line-kills (which produced `-sh: syntax error: unexpected "("` on BusyBox/dropbear devices).
- **Windows SSH connects** (ConPTY cannot spawn a bare `ssh` — resolved to the full OpenSSH path); **serial ports** work on Windows/Linux; the **Linux dash icon** shows; **middle-click** pastes once.
- **`v1.5.0-rc.1` shipped a macOS `.app` inside its "Windows arm64" zip** — artifact names now carry an explicit architecture on every platform.
- **The license in `package.json` said MIT** while `LICENSE` is PolyForm Noncommercial 1.0.0. Fixed, with a test keeping them in sync.

## Downloads

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Prateek-Term-1.5.0-rc.4-mac-arm64.dmg` · `Prateek-Term-1.5.0-rc.4-mac-arm64.zip` |
| Windows x64 | `Prateek-Term-Setup-1.5.0-rc.4-x64.exe` (installer) · `Prateek-Term-1.5.0-rc.4-x64-portable.exe` |
| Windows ARM64 | `Prateek-Term-Setup-1.5.0-rc.4-arm64.exe` (installer) · `Prateek-Term-1.5.0-rc.4-arm64-portable.exe` |
| Linux x64 | `Prateek-Term-1.5.0-rc.4-x86_64.AppImage` · `prateek-term_1.5.0-rc.4_amd64.deb` |
| Linux ARM64 | `Prateek-Term-1.5.0-rc.4-arm64.AppImage` · `prateek-term_1.5.0-rc.4_arm64.deb` |

**First launch.** macOS — the app is ad-hoc signed but not notarized, so if Gatekeeper refuses it, run `xattr -dr com.apple.quarantine /Applications/Prateek-Term.app` or right-click → **Open** → Open. Windows — the `.exe` is unsigned; click **More info → Run anyway** (Scoop and `install.ps1` extract a zip and avoid this entirely). Linux `.deb` — `sudo dpkg -i …`, then Settings → General → register OS integration; log out/in for the dash icon.

## Known limitations

- **macOS is Apple Silicon only** — the cask declares `depends_on arch: :arm64`, so an Intel Mac fails clearly rather than installing an app that cannot launch.
- **Not code-signed** on any platform (no paid Apple Developer or Windows OV certificate). `SHA256SUMS` is the integrity check.
- **The `.deb` is a manual install**, deliberately not driven by `install.sh`: under `dpkg`, `1.5.0-rc.4` sorts as *newer* than the final `1.5.0`, so apt would refuse the upgrade to stable.
- **Windows has no `sshpass`**, so SCP/SFTP **password** auth (drag-drop upload, MCP `upload_file`) is unavailable there — use **key auth**. Interactive SSH terminal password auth, including through a jump host, works everywhere.

Full details in the [CHANGELOG](CHANGELOG.md).
