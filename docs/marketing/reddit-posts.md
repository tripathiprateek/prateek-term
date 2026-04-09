# Reddit Posts

---

## r/commandline

**Title:** Built a macOS terminal with native MCP -- AI agents can SSH into devices and run commands

I built Prateek-Term, a macOS terminal emulator with SSH, Serial, SFTP, and SCP support. The unique part: it has native MCP (Model Context Protocol) integration, so AI agents like Claude can directly connect to remote devices, execute commands, and transfer files through 11 standardized tools.

No copy-pasting terminal output into chat. The AI reads it directly from the session.

Features: multi-tab, multi-window, connection profiles, drag-and-drop SCP, custom per-profile actions, Catppuccin Mocha theme.

Built with Electron + xterm.js. Apple Silicon only for now.

https://github.com/tripathiprateek/prateek-term

---

## r/macapps

**Title:** Prateek-Term: SSH/Serial terminal for macOS with AI agent integration

I made a terminal app for macOS that doubles as a connection manager for SSH, Telnet, Serial, SFTP, and SCP. It also has native MCP support so AI tools like Claude Desktop can control terminal sessions programmatically.

Useful if you manage multiple remote devices and want AI assistance for diagnostics or automation.

Key features:
- Connection profiles with one-click connect
- Drag-and-drop file transfer (SCP/SFTP)
- Serial port support for embedded devices
- 11 MCP tools for AI agent integration
- Multi-tab, multi-window

Download DMG from releases: https://github.com/tripathiprateek/prateek-term

---

## r/ClaudeAI

**Title:** My terminal lets Claude connect to SSH devices and run commands natively via MCP

I built a macOS terminal app (Prateek-Term) that registers as an MCP server with Claude Desktop and Claude Code. Claude gets 11 tools to:

- Connect to SSH/Serial devices by profile name
- Run commands and read output
- Upload/download files via SCP
- Manage multiple sessions

The workflow: tell Claude "connect to my staging server and check disk usage" and it does it -- connects via SSH, runs `df -h`, and shows you the result. No copy-paste needed.

It works because the terminal exposes its PTY sessions over a local HTTP bridge, and the MCP server translates between Claude's tool calls and the bridge API.

GitHub: https://github.com/tripathiprateek/prateek-term

Setup: install the app, click "Register MCP Server" in settings, restart Claude.
