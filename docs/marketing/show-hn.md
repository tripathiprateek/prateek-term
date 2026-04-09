# Show HN Post

**Title:** Show HN: Prateek-Term -- macOS terminal that AI agents can control via MCP

**Body:**

I built a macOS terminal emulator with a built-in connection manager for SSH, Serial, SFTP, and SCP. What makes it different is native MCP (Model Context Protocol) support -- AI agents like Claude can connect to remote devices, run commands, transfer files, and manage sessions through 11 standardized tools.

The use case: I work with IoT/embedded devices (routers, gateways) and needed a way to let AI agents SSH into devices and run diagnostics without copy-pasting terminal output. Prateek-Term exposes the terminal sessions directly to the AI over stdio transport.

Built with Electron + xterm.js + node-pty. The MCP server runs as a standalone process so it works with Claude Desktop, Claude Code, or any MCP-compatible client.

GitHub: https://github.com/tripathiprateek/prateek-term

Happy to answer questions about the MCP integration or the terminal architecture.
