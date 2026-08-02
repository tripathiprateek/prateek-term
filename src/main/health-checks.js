'use strict';
/**
 * health-checks.js — environment problems that break SSH before the app ever
 * runs a command, and that a "is the binary installed?" probe cannot see.
 *
 * Every check here exists because it actually broke a connection in the field:
 *   • A wedged ssh-agent (SSH_AUTH_SOCK points at a socket with no live agent)
 *     makes any ssh that tries publickey auth hang forever — connections die
 *     with "timed out during banner exchange".
 *   • ~/.ssh/agent created without the execute bit (drw-------) stops ssh-agent
 *     from creating its socket at all: it exits 255 and launchd's agent stays
 *     dead. A directory needs owner-rwx to be entered, even by its owner.
 *   • Over-permissive private keys make ssh refuse them outright.
 *
 * Pure Node + injectable I/O so every branch is unit-testable.
 */

const os   = require('os');
const path = require('path');
const fsDefault  = require('fs');
const netDefault = require('net');

// SSH agent protocol: a request is [uint32 length][byte type]; type 11 is
// SSH_AGENTC_REQUEST_IDENTITIES. A live agent answers; a dead socket does not.
const AGENTC_REQUEST_IDENTITIES = 11;

/**
 * Is the ssh-agent behind SSH_AUTH_SOCK actually alive? Connecting alone is not
 * enough — launchd sockets accept the connection and then never answer, which
 * is exactly the hang we are detecting. So send a real request and await a reply.
 * @returns {Promise<{state:'ok'|'unresponsive'|'absent'|'unusable', sock:(string|null)}>}
 */
function probeSshAgent({ sock, connect, timeoutMs = 2000 } = {}) {
  const sockPath = sock !== undefined ? sock : process.env.SSH_AUTH_SOCK;
  const connectFn = connect || ((p, cb) => netDefault.connect(p, cb));
  if (!sockPath) return Promise.resolve({ state: 'absent', sock: null });

  return new Promise((resolve) => {
    let done = false;
    const finish = (state) => {
      if (done) return;
      done = true;
      try { socket && socket.destroy(); } catch { /* already gone */ }
      resolve({ state, sock: sockPath });
    };
    let socket;
    const timer = setTimeout(() => finish('unresponsive'), timeoutMs);
    try {
      socket = connectFn(sockPath, () => {
        const req = Buffer.alloc(5);
        req.writeUInt32BE(1, 0);
        req.writeUInt8(AGENTC_REQUEST_IDENTITIES, 4);
        try { socket.write(req); } catch { clearTimeout(timer); finish('unusable'); }
      });
    } catch {
      clearTimeout(timer);
      return finish('unusable');
    }
    socket.on('data', () => { clearTimeout(timer); finish('ok'); });
    socket.on('error', () => { clearTimeout(timer); finish('unusable'); });
    socket.on('close', () => { clearTimeout(timer); finish('unresponsive'); });
  });
}

/**
 * ~/.ssh hygiene: directories must be owner-rwx (0700) or ssh/ssh-agent cannot
 * traverse them; private keys must not be group/other readable or ssh rejects
 * them. Returns one issue per offending path.
 */
function checkSshPermissions({ home, fs = fsDefault, platform = process.platform } = {}) {
  // POSIX-only: Windows has no Unix mode bits (it uses ACLs), so st.mode there
  // is synthesised and comparing it against 0o700 would flag every directory.
  if (platform === 'win32') return [];

  const base = path.join(home || os.homedir(), '.ssh');
  const issues = [];
  let entries;
  try { entries = fs.readdirSync(base); } catch { return issues; }  // no ~/.ssh — nothing to check

  const dirNeedsExec = (p, label) => {
    let st;
    try { st = fs.statSync(p); } catch { return; }
    if (!st.isDirectory()) return;
    // 0o700 = owner read+write+EXECUTE. Missing x makes the dir un-enterable.
    if ((st.mode & 0o700) !== 0o700) {
      issues.push({
        id: `ssh-dir-perms:${label}`,
        severity: 'error',
        title: `${label} has unusable permissions`,
        detail: `${p} is not owner-traversable, so ssh/ssh-agent cannot use it. `
              + 'A directory without the execute bit cannot be entered even by its owner — '
              + 'this makes ssh-agent fail to create its socket and exit, which in turn makes '
              + 'SSH connections hang.',
        fix: `chmod 700 ${p}`,
      });
    }
  };

  dirNeedsExec(base, '~/.ssh');
  for (const name of entries) {
    const full = path.join(base, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) { dirNeedsExec(full, `~/.ssh/${name}`); continue; }
    // Private keys: id_* without a .pub suffix.
    if (/^id_/.test(name) && !/\.pub$/.test(name) && (st.mode & 0o077) !== 0) {
      issues.push({
        id: `ssh-key-perms:${name}`,
        severity: 'error',
        title: `Private key ${name} is too permissive`,
        detail: `${full} is readable by group/other, so ssh will refuse to use it.`,
        fix: `chmod 600 ${full}`,
      });
    }
  }
  return issues;
}

/** Turn an agent probe result into a user-facing issue (or null when healthy). */
function agentIssue(result) {
  if (!result || result.state === 'ok' || result.state === 'absent') return null;
  return {
    id: 'ssh-agent',
    severity: 'warn',
    title: 'SSH agent is not responding',
    detail: `SSH_AUTH_SOCK points at ${result.sock}, but no agent answers on it. `
          + 'Any ssh that tries key authentication will hang, which can make connections '
          + 'fail with "timed out during banner exchange". Prateek-Term avoids the agent '
          + 'for password-authenticated jump hosts, but other key-based connections may stall.',
    fix: 'Check ~/.ssh permissions (chmod 700 ~/.ssh ~/.ssh/agent), then log out and back in '
       + 'so macOS restarts ssh-agent. Meanwhile: eval "$(ssh-agent -s)" && ssh-add',
  };
}

/**
 * Run every environment health check.
 * @returns {Promise<Array<{id,severity,title,detail,fix}>>}
 */
async function runHealthChecks(opts = {}) {
  const issues = [];
  try { issues.push(...checkSshPermissions(opts)); } catch { /* never block startup */ }
  try {
    const agent = await probeSshAgent(opts);
    const issue = agentIssue(agent);
    if (issue) issues.push(issue);
  } catch { /* never block startup */ }
  return issues;
}

module.exports = { probeSshAgent, checkSshPermissions, agentIssue, runHealthChecks };
