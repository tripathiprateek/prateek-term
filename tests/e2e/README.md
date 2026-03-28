# E2E Tests

End-to-end tests launch the full Electron app using
[@playwright/test](https://playwright.dev/docs/api/class-electronapplication)
with Electron support.

## Setup

```bash
npm install --save-dev @playwright/test playwright
```

## Run

```bash
npm run test:e2e
```

## Test cases to implement

| File | What it covers |
|------|---------------|
| `app-launch.test.js` | App opens, title bar shows, default tab visible |
| `new-tab.test.js` | Cmd+T opens local shell tab, shell prompt appears |
| `paste-multiline.test.js` | Paste a multi-line script — no duplication or garbling |
| `cmd-r-block.test.js` | Cmd+R does NOT reload the page (sessions survive) |
| `cmd-n-window.test.js` | Cmd+N opens an independent second window |
| `dock-activate.test.js` | Clicking dock icon focuses existing window, not new one |
| `reconnect.test.js` | Kill SSH session → press R → reconnected, history intact |
| `drag-drop-file.test.js` | Drop a file onto SSH tab → SCP progress bar appears |
| `drag-drop-dir.test.js` | Drop a directory → -r flag used, upload completes |
| `multi-file-drop.test.js` | Drop 3 files → uploaded sequentially, all succeed |
