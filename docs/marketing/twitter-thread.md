# X/Twitter Thread

---

**Tweet 1/5:**
I built a macOS terminal that AI agents can control.

Prateek-Term has native MCP support -- Claude can SSH into your devices, run commands, and transfer files. No plugins, no wrappers.

11 tools. stdio transport. Works with Claude Desktop and Claude Code.

https://github.com/tripathiprateek/prateek-term

---

**Tweet 2/5:**
The problem: I manage IoT devices (routers, gateways, embedded systems) and constantly copy-paste terminal output into Claude for analysis.

The fix: give Claude direct access to the terminal sessions.

---

**Tweet 3/5:**
What Claude can do through Prateek-Term:

- connect(profileName: "staging-server")
- run_command(session_id: "1", command: "df -h")
- upload_file(localPath: "config.json", remotePath: "/etc/config.json")
- list_serial_ports()

All through standardized MCP tools.

---

**Tweet 4/5:**
Beyond MCP, it's a full terminal emulator:

- SSH, Telnet, Serial, SFTP, SCP
- Connection manager with profiles
- Multi-tab + multi-window
- Drag-and-drop file transfer
- Custom per-profile actions
- Catppuccin Mocha theme

---

**Tweet 5/5:**
Built with Electron + xterm.js + node-pty.

Free for non-commercial use. Apple Silicon only (for now).

If you work with remote devices and use Claude, give it a try. Feedback welcome.

https://github.com/tripathiprateek/prateek-term
