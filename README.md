# Prateek-Term

A macOS native terminal emulator with a built-in connection manager for SSH, Telnet,
FTP, SFTP, SCP, and Serial connections. Built with Electron and xterm.js.

## Features

### Connectivity
- **SSH** — PEM/identity file support, custom SSH options, ssh-config import/export
- **Telnet** — configurable host, port, and options
- **FTP** — interactive FTP client
- **SFTP** — PEM support; drag-and-drop file upload from Finder
- **SCP** — `-O` / `-O -O` legacy protocol flags, recursive copy, upload/download
- **Serial** — configurable baud rate, data bits, stop bits, parity
- **Local** — native shell (zsh/bash) in a local tab

### Terminal
- **xterm.js** with 256-color / true-color support, Catppuccin Mocha theme
- **Multi-tab** — `Cmd+T` new tab, `Cmd+W` close, `Cmd+1–9` switch
- **Multi-window** — tear off any tab into its own window
- **Bracketed paste** — safe multi-line paste for scripts and commands
- **Middle-click paste** from clipboard

### Connection Manager
- Save, edit, and organize connection profiles per protocol
- **Custom Actions** — define per-profile scripts that appear in the right-click menu
  under **Actions → \<name\>** and execute instantly in the terminal
- Export / Import profiles as JSON (credentials included)
- Export / Import actions as JSON (credentials excluded)

### UI
- Right-click context menu — Copy, Paste, Send Text, Actions submenu
- Built-in **Help** window (`Cmd+?`)
- SSH config import / export
- Build version shown in About dialog

## Requirements

- macOS 12+ (Apple Silicon / arm64)
- Node.js 18+

## Development

```bash
npm install       # install dependencies
npm start         # run in development mode
npm test          # run test suite
```

## Build

```bash
npm run dist:arm64   # builds DMG + ZIP in dist/mac-arm64/
```

## License

[Polyform Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)
For commercial use, contact: tripathiprateek@gmail.com

## Author

Prateek Tripathi — tripathiprateek@gmail.com
