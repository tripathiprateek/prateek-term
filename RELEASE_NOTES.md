# Prateek-Term v1.5.0-beta.2

**Cross-platform release** — Prateek-Term now runs natively on **macOS, Windows, and Linux**, with native OS integrations and installers for every platform.

> Pre-release for testing. Not code-signed — macOS Gatekeeper / Windows SmartScreen / Linux may warn on first launch (see below).

## Highlights

- 🖥️ **Windows & Linux support** — the app, previously macOS-only, now runs natively on Windows 10+ and modern Linux desktops.
- 🧩 **Native OS integrations** — macOS default-terminal + Finder Quick Action, a Windows Explorer right-click **"Open in Prateek-Term"**, and a Linux `.desktop` entry + `prateekterm://` handler + Nautilus right-click action.
- 📦 **Installers for every platform** — Windows NSIS + portable `.exe`, Linux AppImage + `.deb` (x64 & arm64), macOS `.dmg` + `.zip` (Apple Silicon).
- ⧉ **Duplicate profile** — right-click a host → **Duplicate** to clone it with every detail under a suggested unique name.
- 🔐 **Cloudflare Access sign-in preflight** — connecting a Cloudflare SSH profile checks for a valid token first and offers a one-click browser login if needed; failures show an actionable hint.

## Notable fixes

- **Windows SSH** now connects (ConPTY can't spawn a bare `ssh` — resolved to the full OpenSSH path).
- **Serial ports** work on Windows/Linux (native bindings are unpacked from the app archive).
- **Linux dash icon** now shows; **middle-click** pastes once (was doubled).
- **SSH cwd tracking** can no longer corrupt the line or leave the terminal looking hung on connect.
- **Tab tear-off** opens a window with just the torn-off tab (no longer reopens the whole session).

## Downloads

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Prateek-Term-…-arm64.dmg` |
| Windows x64 / ARM64 | `Prateek-Term-Setup-…-{x64,arm64}.exe` (installer) · `…-portable.exe` |
| Linux x64 / ARM64 | `Prateek-Term-…[-arm64].AppImage` · `prateek-term_…_{amd64,arm64}.deb` |

**First launch:** macOS — right-click the app → **Open** → Open anyway. Windows — **More info → Run anyway** on SmartScreen. Linux `.deb` — `sudo dpkg -i …`, then Settings → General → register OS integration; log out/in for the dash icon.

## Known limitations

- **Windows** has no `sshpass`, so SCP/SFTP **password** auth (drag-drop upload / MCP `upload_file`) is unavailable there — use **key auth**. Interactive SSH terminal password auth works on every platform.

Full details in the [CHANGELOG](CHANGELOG.md).
