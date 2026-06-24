# Changelog

All notable changes to Prateek-Term are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
