'use strict';
/**
 * version.js — SemVer comparison and update-channel resolution.
 *
 * This lives outside main.js deliberately: main.js requires `electron` and so
 * cannot be loaded under Jest, which is how the bug below survived unnoticed.
 * platform.js / dependencies.js / health-checks.js follow the same pattern.
 *
 * The bug: the previous comparator did
 *     v.replace(/^v/, '').split('-')[0].split('.').map(Number)
 * i.e. it threw the pre-release suffix away. For a user on 1.5.0-beta.2 both
 * 1.5.0-rc.1 AND the final 1.5.0 compared as "not newer", so pre-release users
 * were stranded until the next patch release. Full SemVer precedence fixes it.
 */

/**
 * Compare two versions by SemVer 2.0 precedence (spec §11), pre-release
 * identifiers included:
 *   1.5.0-beta.2 < 1.5.0-rc.1 < 1.5.0-rc.2 < 1.5.0-rc.10 < 1.5.0
 * Unparseable input sorts lowest so a malformed tag can never look like an
 * upgrade.
 * @returns {number} -1, 0 or 1 (comparator convention)
 */
function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v || '').trim());
    return m ? { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] } : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;

  for (let i = 0; i < 3; i += 1) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] > pb.core[i] ? 1 : -1;
  }

  // A version with no pre-release outranks one that has it (1.5.0 > 1.5.0-rc.1).
  if (!pa.pre.length && !pb.pre.length) return 0;
  if (!pa.pre.length) return 1;
  if (!pb.pre.length) return -1;

  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;              // fewer identifiers ranks lower
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) > Number(y) ? 1 : -1;  // numeric, so rc.10 > rc.2
    if (nx !== ny) return ny ? 1 : -1;           // numeric identifiers rank lower
    return x > y ? 1 : -1;                       // otherwise ASCII order
  }
  return 0;
}

/** True when `remote` is strictly newer than `local`. */
function isVersionNewer(remote, local) {
  return compareVersions(remote, local) > 0;
}

/**
 * Which release channel to follow.
 * 'auto' (the default) means: follow RCs if this build is itself a pre-release.
 * Opting in therefore happens by *installing* an RC — no setting to find first —
 * and rc.1 → rc.2 → 1.5.0 then flows without the user touching anything.
 */
function resolveChannel(setting, localVersion) {
  if (setting === 'stable' || setting === 'rc') return setting;
  return /-/.test(String(localVersion || '')) ? 'rc' : 'stable';
}

/**
 * The newest eligible release for a channel, by SemVer.
 *
 * Not `releases.find(...)`: the GitHub API orders by creation date, so a 1.4.1
 * hotfix published after 1.5.0 would otherwise be offered to everyone as an
 * "update" — a downgrade. The 'rc' channel is a superset of 'stable', so RC
 * users are offered the final release as soon as it ships.
 */
function pickCandidate(releases, channel) {
  return (Array.isArray(releases) ? releases : [])
    .filter((r) => r
      && !r.draft
      && (channel === 'rc' || !r.prerelease)
      && /^v?\d+\.\d+\.\d+/.test(r.tag_name || ''))
    .reduce((best, r) => (
      !best || compareVersions(r.tag_name, best.tag_name) > 0 ? r : best
    ), null);
}

module.exports = { compareVersions, isVersionNewer, resolveChannel, pickCandidate };
