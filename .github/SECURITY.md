# Security Policy

## Supported Versions

Only the latest release receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.4.x   | :white_check_mark: |
| < 1.4   | :x:                |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately, one of two ways:

1. **GitHub Security Advisories** (preferred) — open a draft advisory at
   [Security → Report a vulnerability](https://github.com/tripathiprateek/prateek-term/security/advisories/new).
2. **Email** — send details to **tripathiprateek@gmail.com** with `SECURITY` in
   the subject line.

Please include:

- The affected version (see **Prateek-Term → About** or the window title)
- Steps to reproduce, or a proof of concept
- The impact you expect (e.g. credential disclosure, RCE, sandbox escape)

## What to Expect

- Acknowledgement within **5 business days**.
- An assessment and, if confirmed, a fix timeline.
- Credit in the release notes once a fix ships, unless you prefer to remain
  anonymous.

## Scope Notes

Prateek-Term stores connection profiles (including passwords and key material)
locally in `~/Library/Application Support/prateek-term/`. The MCP bridge listens
only on `127.0.0.1` and requires a bearer token. Reports about local file
permissions, token handling, credential storage, or the MCP bridge are in scope.
