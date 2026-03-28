#!/usr/bin/env node
'use strict';
/**
 * tests/run.js — Master test runner for Prateek-Term
 *
 * Usage:
 *   node tests/run.js              # run all suites
 *   node tests/run.js unit         # run unit tests only
 *   node tests/run.js renderer     # run renderer contract tests only
 *   node tests/run.js ssh          # run SSH-related tests only
 *   node tests/run.js --list       # list all available suites
 *
 * Adding a new suite:
 *   1. Create tests/<category>/<name>.test.js
 *   2. Add a new entry to SUITES below (optional — "all" picks it up automatically)
 */

const { spawnSync } = require('child_process');
const path          = require('path');

const ROOT  = path.resolve(__dirname, '..');
const JEST  = path.join(ROOT, 'node_modules', '.bin', 'jest');

// ---------------------------------------------------------------------------
// Named suites — shortcuts for common test categories
// ---------------------------------------------------------------------------

const SUITES = {
  all:       null,                      // run everything
  unit:      'tests/unit',
  renderer:  'tests/renderer',
  e2e:       'tests/e2e',
  ssh:       'tests/unit/ssh',         // matches ssh-flags + ssh-commands + ssh-config
  scp:       'tests/unit/scp',
  paste:     'tests/renderer/paste',
  reconnect: 'tests/renderer/tab-reconnect',
  windows:   'tests/renderer/multi-window',
  wrap:      'tests/renderer/line-wrap',
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const arg = process.argv[2] || 'all';

if (arg === '--list' || arg === '-l') {
  console.log('\nAvailable suites:\n');
  Object.keys(SUITES).forEach(k => {
    const pattern = SUITES[k] || '(everything)';
    console.log(`  %-12s  %s`, k, pattern);
  });
  console.log('\nExamples:');
  console.log('  node tests/run.js            # all tests');
  console.log('  node tests/run.js unit        # unit tests only');
  console.log('  node tests/run.js ssh         # SSH flag/command tests');
  console.log('  npm test                      # same as "all"');
  console.log();
  process.exit(0);
}

if (!(arg in SUITES)) {
  console.error(`\n  Unknown suite: "${arg}"`);
  console.error('  Run  node tests/run.js --list  to see available suites.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build Jest args
// ---------------------------------------------------------------------------

const pattern = SUITES[arg];
const jestArgs = ['--colors'];

if (pattern) {
  jestArgs.push('--testPathPattern', pattern);
}

// Pass any extra flags through (e.g. --watch, --coverage)
jestArgs.push(...process.argv.slice(3));

// ---------------------------------------------------------------------------
// Print header
// ---------------------------------------------------------------------------

const label = arg === 'all' ? 'ALL suites' : `"${arg}" suite`;
const line  = '─'.repeat(50);
console.log(`\n${line}`);
console.log(`  🧪  Prateek-Term — ${label}`);
console.log(`${line}\n`);

// ---------------------------------------------------------------------------
// Run Jest
// ---------------------------------------------------------------------------

const result = spawnSync(JEST, jestArgs, {
  stdio:   'inherit',
  cwd:     ROOT,
  shell:   false,
});

if (result.error) {
  console.error('\nFailed to launch Jest:', result.error.message);
  console.error('Make sure Jest is installed:  npm install');
  process.exit(1);
}

process.exit(result.status ?? 1);
