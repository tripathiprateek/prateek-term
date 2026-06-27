'use strict';
/**
 * tests/renderer/platform-ui.test.js
 *
 * Source-contract tests for the cross-platform renderer wiring: platform is
 * exposed via preload, the renderer tags <body> + localizes ⌘/Finder, the
 * titlebar adapts per-OS, and the BrowserWindow titlebar style branches.
 */

const fs   = require('fs');
const path = require('path');

const APP_JS  = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/js/app.js'), 'utf8');
const PRELOAD = fs.readFileSync(path.resolve(__dirname, '../../src/main/preload.js'), 'utf8');
const MAIN    = fs.readFileSync(path.resolve(__dirname, '../../src/main/main.js'), 'utf8');
const CSS     = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/css/style.css'), 'utf8');

describe('preload exposes platform', () => {
  test('platform: process.platform is bridged to the renderer', () => {
    expect(PRELOAD).toMatch(/platform:\s*process\.platform/);
  });
});

describe('renderer platform UI', () => {
  test('applyPlatformUI tags <body> with the platform class', () => {
    expect(APP_JS).toContain("classList.add('platform-' + plat)");
  });

  test('applyPlatformUI is invoked at the top of init()', () => {
    const initBlock = APP_JS.slice(APP_JS.indexOf('async function init()'), APP_JS.indexOf('async function init()') + 200);
    expect(initBlock).toContain('applyPlatformUI()');
  });

  test('⌘ glyph is swapped to Ctrl on non-mac', () => {
    expect(APP_JS).toMatch(/replace\(\/⌘\/g,\s*'Ctrl\+'\)/);
  });

  test('Finder wording is localized to the OS file manager', () => {
    expect(APP_JS).toContain("'File Explorer'");
    expect(APP_JS).toContain("plat === 'win32'");
  });
});

describe('titlebar adapts per-OS', () => {
  test('main process branches titleBarStyle by platform', () => {
    expect(MAIN).toMatch(/platform\.isMac\(\)[\s\S]{0,120}hiddenInset/);
    expect(MAIN).toContain('titleBarOverlay');
  });

  test('CSS gives mac the traffic-light inset and Windows the overlay inset', () => {
    expect(CSS).toContain('body.platform-darwin #titlebar');
    expect(CSS).toContain('body.platform-win32 #titlebar');
  });
});
