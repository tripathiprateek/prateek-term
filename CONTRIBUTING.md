# Contributing to Prateek-Term

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/tripathiprateek/prateek-term.git
cd prateek-term
npm install
npm start
```

## Development

- **Run**: `npm start`
- **Test**: `npm test` (175 tests across 10 suites)
- **Lint**: `npm run lint`
- **Build**: `npm run dist:arm64`

## Code Style

- JavaScript (ES2020+), no TypeScript
- Electron main/renderer process split
- xterm.js for terminal rendering
- node-pty for PTY management

## Pull Requests

1. Fork the repo and create a feature branch
2. Write tests for new functionality
3. Ensure all tests pass (`npm test`)
4. Keep commits focused and descriptive
5. Open a PR against `main`

## Reporting Bugs

Use the [bug report template](https://github.com/tripathiprateek/prateek-term/issues/new?template=bug_report.md).

## Feature Requests

Use the [feature request template](https://github.com/tripathiprateek/prateek-term/issues/new?template=feature_request.md).

## License

By contributing, you agree that your contributions will be licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).
