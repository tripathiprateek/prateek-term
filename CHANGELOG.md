# Changelog

All notable changes to Prateek-Term are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.5.0] — unreleased

> Shipping for testing as **1.5.0-rc.4** (2026-09-08). This section becomes the
> final 1.5.0 entry once the release candidate is verified on all three platforms.

The cross-platform release. Everything from the `1.5.0` betas and earlier release
candidates below, plus **installation through a package manager on all three
platforms**, a **startup check for the tools the app shells out to**, and a set
of jump-host and profile-editor fixes found by testing on real Windows, Linux
and embedded hardware.

### Added

- **Install with one command, on every platform.** No more hand-downloading from the releases page:
  - **macOS** — a Homebrew cask: `brew tap tripathiprateek/prateek-term && brew install --cask prateek-term`
  - **Linux** — `curl -fsSL …/install.sh | sh` (AppImage, with a `.deb` fallback where the AppImage runtime is unusable). Takes `--channel stable|rc`, `--version vX.Y.Z`, `--with-deps` and `--uninstall`.
  - **Windows** — a Scoop bucket: `scoop install prateek-term`, or `install.ps1` for a Scoop-free install.
  - Every release now publishes **`SHA256SUMS`**, which all three installers verify against.
- **Release channels** (Settings → General → Updates) — *Automatic* follows release candidates only if you are already running one, so installing an RC opts you in and you still get the final release when it ships. *Stable only* and *Include release candidates* override that.
- **Startup environment check.** A banner appears when something the app depends on is missing or too old, listing each tool, what it is for, and how to install it — with a one-click **Install** button that opens a local tab pre-typed with the correct command for your package manager (`brew`, `apt`, `dnf`, `pacman`, `winget`). Nothing is executed until you press Enter.
  - It only warns about tools **your** setup actually uses: `telnet` for a telnet profile, `sshpass` for a password jump host, `cloudflared` for a Cloudflare Access profile, `node` when MCP is enabled. `ssh` is always checked.
  - Versions are checked, not just presence, so an OpenSSH or `cloudflared` too old for a feature is reported as *outdated* rather than silently failing later.
- **Health checks** beyond missing binaries:
  - **A dead SSH agent is detected.** When `SSH_AUTH_SOCK` points at a socket with no agent behind it, `ssh` hangs indefinitely during authentication — the failure mode looks like a network problem and is nearly impossible to diagnose from the terminal. The app now probes the agent at startup (with a timeout, so a broken agent can never delay launch) and tells you what to fix.
  - **`~/.ssh` permissions** are audited on macOS/Linux — a group-writable key or directory makes OpenSSH refuse the key without explanation.
- **Default Shell** (Settings → General) — choose which shell new local tabs open, from the shells actually installed on the machine. *System default* follows your login shell (`$SHELL`); existing tabs keep the shell they started with.

### Fixed

- **The update check could not see release candidates — or a hotfix.** `isVersionNewer()` stripped pre-release suffixes before comparing, so anyone running `1.5.0-beta.2` was offered neither `1.5.0-rc.1` nor the final `1.5.0`: they would have been stranded until `1.5.1`. Comparison now implements full SemVer 2.0 precedence (including numeric identifier ordering, so `rc.10` correctly beats `rc.2`). Separately, the GitHub releases API is date-ordered, so a `1.4.x` hotfix published after `1.5.0` was being offered as an "update" — the newest release is now chosen by version, not by date.
- **Editing a profile destroyed its password and its AI access.** Two independent bugs in the same save path: the auth-type buttons were located with an unscoped selector that also matched the jump-host buttons, so saving a profile blanked the device password; and the save *replaced* the stored profile instead of merging into it, dropping `aiEnabled` (and anything else not present on the form) on **every** edit. Editing a profile now preserves every field it does not touch.
- **A jump-host connection typed the wrong password at each hop.** The password was tracked as a single pending value, so the jump host could be answered with the target's password and vice versa. Each hop now has its own queued credential, which also means the target device's password is never sent to the jump host.
- **Jump hosts failed on Windows** with `CreateProcessW failed error:2` — the proxy command named `sshpass`, which does not exist on Windows. Windows now uses OpenSSH's own `-W` stdio forwarding for the hop, and `sshpass` is no longer listed as a dependency there (it was shown as "missing" next to a hint saying it is unavailable — a problem the user could not fix).
- **Password jump hosts hung before the password prompt.** The inner `ssh` tried publickey and agent authentication first; with a dead agent socket that blocks forever. Password jump hosts now force `PreferredAuthentications=password`, `PubkeyAuthentication=no` and `IdentityAgent=none`.
- **The MCP bridge had the same wrong-password bug** as the terminal path, and is now driven by the same per-hop credential logic.
- **The cwd reporter broke shells on embedded devices.** The OSC 7 injection fired on a fixed 1.5 s timer, which raced with slow logins, and used a tty line-kill that shredded any unconsumed input — producing `-sh: syntax error: unexpected "("` on BusyBox/dropbear devices. It now waits for an actual shell prompt (never a password prompt) and never line-kills.
- **The version and build number were missing from the titlebar** — they are now set before anything else in startup, so a later failure cannot leave the titlebar blank.
- **`package.json` declared the license as MIT** while `LICENSE` is PolyForm Noncommercial 1.0.0. The manifest now matches the actual license, and a test keeps the two in sync.
- **Release artifacts collided.** The macOS and Windows ARM64 builds produced the same filename, so `v1.5.0-rc.1`'s "Windows arm64" zip actually contained the macOS `.app`. Artifact names are now explicit and arch-suffixed on every platform, and the AppImage carries its architecture.
- Numerous fixes to the installers themselves, all found on real machines rather than in CI: `install.sh` now works with `wget` (stock Ubuntu Desktop has no `curl`) and falls back to the `.deb` where the arm64 AppImage runtime cannot start; `install.ps1` had four separate failures on a real Windows box (wrong asset name, PowerShell 5.1's `-UseBasicParsing`, JSON tag extraction, and a `Byte[]` response body).

### Changed

- **CI gained a release guard** — a tag is rejected unless it matches `package.json` and has the expected `vX.Y.Z[-rc.N]` shape, so a mistyped tag fails in seconds instead of publishing a mislabelled release. A `publish-managers` job then updates the Homebrew tap and Scoop bucket with the new version and checksums automatically.
- Artifact filenames are deterministic and always arch-suffixed (electron-builder omits `-x64` by default, which all three installers depend on).

### Known limitations

- **macOS builds are Apple Silicon only.** The cask declares `depends_on arch: :arm64`, so an Intel Mac gets a clear error instead of an app that cannot launch.
- **Not code-signed.** macOS is ad-hoc signed but not notarized, so Gatekeeper may refuse the first launch (`xattr -dr com.apple.quarantine /Applications/Prateek-Term.app`, or right-click → Open). The Windows `.exe` is unsigned and triggers SmartScreen — Scoop and `install.ps1` avoid this by extracting a zip. Verify any download against the published `SHA256SUMS`.
- **The Linux `.deb` is a manual install**, deliberately not driven by `install.sh`: under `dpkg`, `1.5.0-rc.1` sorts as *newer* than the final `1.5.0`, so apt would refuse the upgrade to stable.
- **Windows has no `sshpass`**, so SCP/SFTP **password** auth (drag-drop upload, MCP `upload_file`) is unavailable there — use **key auth** on Windows. Interactive SSH terminal password auth, including through a jump host, works on every platform.

---

## [1.5.0-beta.2] — 2026-07-30

Cross-platform release. Prateek-Term, previously macOS-only, now runs natively on **macOS, Windows, and Linux**, with per-OS native integrations and installers for every platform.

### Added

- **Windows & Linux support** — runs natively on Windows 10+ and modern Linux desktops. A single platform-resolver layer centralizes every per-OS decision (shell selection, `PATH`, config-file locations, SSH agent socket, browser/binary discovery), so behavior is correct on each OS.
- **Native OS integrations, per platform**:
  - **macOS** — become the system default terminal + a Finder Quick Action.
  - **Windows** — an **"Open in Prateek-Term"** entry in the File Explorer folder (and folder-background) right-click menu.
  - **Linux** — a `.desktop` application entry, the `prateekterm://` URL handler, and a Nautilus right-click **"Open in Prateek-Term"** script; the app icon is installed into the user icon theme so it shows in the dash.
- **Installers for every platform** — Windows **NSIS installer** + **portable `.exe`**, Linux **AppImage** + **`.deb`** (each for x64 and arm64), plus the existing macOS `.dmg` + `.zip` (Apple Silicon).
- **Duplicate profile** — right-click any saved connection → **Duplicate** to clone it with every detail (host, port, username, password, identity/PEM key, actions, tags, and all options — SSH flags, jump host, port-forwards, Cloudflare, SCP settings) under a suggested unique name, opened for a quick rename.
- **Cloudflare Access sign-in preflight** — connecting a Cloudflare Access SSH profile now checks for a valid `cloudflared` token first and, if it's missing or expired, offers a **one-click browser login** before connecting (the SSH ProxyCommand runs `cloudflared` non-interactively and can't log in on its own). Connection failures are translated into actionable hints (TLS-inspecting firewall, login required, or origin unreachable).

### Changed

- **Keyboard shortcuts** accept `Ctrl` on Windows/Linux and `⌘` on macOS; window chrome, shortcut glyphs, and UI copy (Finder / File Explorer / file manager) adapt per platform.
- **CI** builds every OS/arch on its own native runner — including `windows-11-arm` and `ubuntu-24.04-arm` — and publishes all artifacts to the GitHub Release on a `v*` tag.
- The **user guide** and in-app copy are now cross-platform and version-free.

### Fixed

- **Windows SSH connections** — node-pty's ConPTY backend does not search `PATH`, so a bare `ssh`/`scp`/`sftp` failed with *"File not found"*. Bare command names are now resolved to their full OpenSSH path on Windows (no-op on macOS/Linux).
- **Serial ports & node-pty native bindings** are unpacked from the app archive so they load correctly in packaged builds on every platform (serial ports were unusable on Windows/Linux before).
- **Linux dash icon** — the app icon now appears in the dash/taskbar: it's bundled at runtime and the `.desktop` `StartupWMClass` matches the window class. The in-app "register" no longer writes an icon-less entry that shadowed the installed one.
- **Linux middle-click double-paste** — middle-click pasted the same text twice (the OS X11 primary-selection paste plus the app's clipboard paste). The native paste is now suppressed on Linux so middle-click pastes exactly once.
- **SSH cwd reporter can no longer hang the terminal** — the OSC 7 working-directory injection now holds user input during its brief echo-off window (flushing it immediately after) and always restores terminal echo, so typing or pasting on connect can't corrupt the line or leave input invisible.
- **Tab tear-off** — dragging a tab into a new window no longer reopens the entire previous session on top of it; secondary windows (tear-off, New Window, `prateekterm://…target=window`) start with just the intended tab.
- **MCP "Copy Config JSON"** produced a macOS-only `/Applications/…` path that was broken on Linux and Windows; the snippet's command and server path are now resolved for the current OS.
- **Copy-paste-safe command echo** — the shown SSH command quotes the `ProxyCommand` value, so pasting it into a shell no longer splits (which made `cloudflared` run bare with *"unable to find config file"*).
- **Command-lookup hardening** — bare command resolution on Windows never shells out for names containing metacharacters; the MCP-bridge working directory uses `os.homedir()` (was Unix-only `$HOME`).

### Known limitations

- **Windows** has no `sshpass`, so SCP/SFTP **password** auth over the MCP bridge and drag-drop upload is unavailable there — use **key auth** on Windows. Interactive SSH terminal password auth works on every platform.

---

## [1.4.0] — 2026-06-24

### Added

- **Jump Host / ProxyJump** — new form section in SSH profiles. Tunnel through an intermediary SSH host to reach devices that are not directly reachable (e.g. Mac → Raspberry Pi → router). Three authentication modes are supported for the jump host:
  - *Agent / Ask* — use the SSH agent or fall back to interactive prompt
  - *Key File* — specify a separate identity file for the jump hop
  - *Password* — password-based auth via `sshpass` (requires `sshpass` installed)
  - Jump Host and Cloudflare Access are mutually exclusive; enabling one disables the other.

- **Chrome proxy filter (Include / Exclude)** — each dynamic (SOCKS5) port-forward rule gains an *All traffic / Include only / Exclude* selector that controls which hosts Chrome routes through the tunnel:
  - *Include only* — only listed hosts/CIDRs/wildcards are tunnelled (via an inline PAC script); everything else goes direct.
  - *Exclude* — everything is tunnelled except the listed hosts (Chrome `--proxy-bypass-list`).
  - Supports exact IPs, CIDR (`192.168.2.0/24`), and wildcards (`*.company.com`). Saved per rule.

- **Launch Chrome from the sidebar** — profiles with an enabled dynamic SOCKS5 rule now show a one-click Chrome-launch icon next to the **AI** chip, so you can open a proxied Chrome without entering the profile editor.

- **Collapsible sidebar** — collapse/expand the Hosts sidebar via the header chevron, a floating expand rail, or `⌘B`. The collapsed state persists across restarts.

- **MCP `add_profile` / `remove_profile` tools** — create and delete connection profiles over MCP. New profiles default to AI access *off*; `remove_profile` refuses to delete a profile with active sessions unless `force: true`. Both broadcast a live sidebar refresh.

### Fixed

- **`ctrl+r` reverse history search** — SSH terminal injection now saves the full terminal state with `stty -g` before disabling echo, then restores the exact saved state after. The previous approach (`stty echo`) only restored the `ECHO` flag, leaving readline `ICANON` flags broken and causing `ctrl+r` to malfunction after the first injection.

- **SCP to dropbear / legacy devices** — MCP file transfers now reuse the same flag builder as the SSH terminal, so `HostKeyAlgorithms=+ssh-rsa` is applied. Uploads to devices that only offer `ssh-rsa` host keys (e.g. Lantronix E210) no longer fail with *"no matching host key type found"*.

- **SSH password auto-type** — the one-shot password injection now clears the pending password before it fires, so a wrong-password retry prompt no longer re-sends the same password in a loop.

- **MCP `connect` tool `port` schema** — the `port` parameter was typed as `number`, which rejected serial device paths such as `/dev/tty.usbserial-0001`. The parameter is now split into:
  - `port` (number) — TCP port for SSH connections
  - `serialPort` (string) — device path for serial connections

### Changed

- **Smart Save button** — opening an existing profile shows **Close**; the button switches to **Save** on the first edit (including Browse/Clear and toggle-button changes), flashes **Saved ✓** after saving, then reverts to **Close**.

- **AI/MCP access toggle** — replaced the `"ai"` tag convention with a dedicated per-profile toggle button in the sidebar. Every profile now shows a small **AI** chip: grey when off, green when active. Click to toggle; saves instantly. The `"ai"` tag no longer grants MCP access.

- **Identity File field** — now accepts typed or pasted paths directly in addition to the Browse button. Tilde (`~`) expansion is applied automatically.

- **Tag auto-persist** — adding or removing a tag on an existing saved profile now saves immediately without requiring a separate click of *Save Profile*.

---

## [1.3.0] — 2026-05

### Added

- **Cloudflare Access** — zero-trust SSH tunnelling via `cloudflared access ssh` proxy, configured per profile.
- **OSC 7 CWD tracking** — terminal emits `OSC 7` working-directory sequences; drag-drop SCP uploads land in the active remote directory automatically.
- **Right-click context menu** — copy, paste, and selection actions available from the terminal context menu.
- **Debug log rotation** — log files are capped and rotated to prevent unbounded disk usage.
- **Tab session restore fixes** — local tabs reopen in the exact directory they were closed in.
- **Tab groups** — visually group and colour-code related tabs.

---

## [1.2.1] and earlier

See `git log` for earlier version history.
