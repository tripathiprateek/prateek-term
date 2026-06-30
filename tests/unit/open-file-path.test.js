'use strict';
/**
 * tests/unit/open-file-path.test.js
 *
 * Source-contract tests for macOS open-file path resolution.
 *
 * BUG: The macOS open-file event (Finder "Open in Terminal", drag onto dock,
 * Automator Quick Action) can receive either a folder path or a file path.
 * Two bugs existed:
 *
 *   1. The open-file handler did not resolve file paths to their parent
 *      directory — it passed the file path directly as the working directory,
 *      which caused PTY spawn to fall back to HOME silently.
 *
 *   2. The PTY cwd validation only checked readability (fs.accessSync), not
 *      whether the path is actually a directory. A valid but non-directory path
 *      passed the access check and landed at pty.spawn with a file cwd.
 *
 * Fix:
 *   - open-file handler: stat the path, if not a directory use path.dirname().
 *   - terminal:create handler: stat the cwd, if not a directory use path.dirname().
 *   - process.argv scan: only accept absolute paths that stat as directories.
 *   - pendingFolderPaths array buffers paths received before renderer is ready.
 */

const fs   = require('fs');
const path = require('path');

const MAIN_SRC = path.resolve(__dirname, '../../src/main/main.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(MAIN_SRC, 'utf8');
});

// ---------------------------------------------------------------------------
// open-file handler — file-path resolution
// ---------------------------------------------------------------------------

describe('open-file handler — directory resolution', () => {
  test('open-file handler calls fs.statSync(filePath).isDirectory() to detect non-directory paths', () => {
    // Find the open-file handler section
    const handlerBlock = source.match(/app\.on\('open-file'[\s\S]{0,600}/);
    expect(handlerBlock).not.toBeNull();
    expect(handlerBlock[0]).toContain('isDirectory()');
  });

  test('open-file handler uses path.dirname(filePath) for non-directory paths', () => {
    const handlerBlock = source.match(/app\.on\('open-file'[\s\S]{0,600}/);
    expect(handlerBlock).not.toBeNull();
    expect(handlerBlock[0]).toContain('path.dirname(filePath)');
  });
});

// ---------------------------------------------------------------------------
// PTY cwd validation — directory check
// ---------------------------------------------------------------------------

describe('terminal:create handler — cwd directory validation', () => {
  test('PTY cwd validation calls .isDirectory() before spawning', () => {
    // The terminal:create handler must stat the cwd and check isDirectory()
    const createBlock = source.match(/ipcMain\.handle\('terminal:create'[\s\S]{0,2000}/);
    expect(createBlock).not.toBeNull();
    expect(createBlock[0]).toContain('isDirectory()');
  });

  test('If PTY cwd is a file, uses path.dirname to get parent directory', () => {
    const createBlock = source.match(/ipcMain\.handle\('terminal:create'[\s\S]{0,2000}/);
    expect(createBlock).not.toBeNull();
    expect(createBlock[0]).toContain('path.dirname(cwd)');
  });
});

// ---------------------------------------------------------------------------
// process.argv scan — only absolute directory paths
// ---------------------------------------------------------------------------

describe('process.argv — startup folder path detection', () => {
  test('argv scan uses path.isAbsolute() to filter out non-path args', () => {
    expect(source).toContain('path.isAbsolute(arg)');
  });

  test('argv scan calls isDirectory() to ensure the arg is a directory', () => {
    // After path.isAbsolute, code must stat and call isDirectory()
    const argvBlock = source.match(/path\.isAbsolute\(arg\)[\s\S]{0,200}/);
    expect(argvBlock).not.toBeNull();
    expect(argvBlock[0]).toContain('isDirectory()');
  });
});

// ---------------------------------------------------------------------------
// pendingFolderPaths — buffering paths before renderer is ready
// ---------------------------------------------------------------------------

describe('pendingFolderPaths — pre-renderer buffering', () => {
  test('pendingFolderPaths array is declared', () => {
    expect(source).toContain('let pendingFolderPaths');
  });

  test('open-file handler pushes resolved path into pendingFolderPaths', () => {
    // The handler body spans ~800 chars — use a larger window to reach the else branch
    const handlerBlock = source.match(/app\.on\('open-file'[\s\S]{0,1000}/);
    expect(handlerBlock).not.toBeNull();
    expect(handlerBlock[0]).toContain('pendingFolderPaths.push');
  });

  test('argv folder path is pushed into pendingFolderPaths', () => {
    // After finding argvFolderPath, it must be pushed into pendingFolderPaths
    const argvPush = source.match(/argvFolderPath[\s\S]{0,200}pendingFolderPaths\.push/);
    expect(argvPush).not.toBeNull();
  });
});
