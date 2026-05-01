'use strict';
/**
 * tests/unit/tab-context-menu.test.js
 *
 * Source-contract tests for the tab right-click context menu.
 */

const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/js/app.js'), 'utf8'
);

describe('tab context menu — source contracts', () => {
  test('showTabContextMenu function is defined', () => {
    expect(src).toMatch(/function showTabContextMenu\(/);
  });

  test('contextmenu listener added to each tab element', () => {
    expect(src).toMatch(/tabEl\.addEventListener\('contextmenu'/);
  });

  test('close-tab action present', () => {
    expect(src).toMatch(/tcm-close-tab/);
  });

  test('close-left action present', () => {
    expect(src).toMatch(/tcm-close-left/);
  });

  test('close-right action present', () => {
    expect(src).toMatch(/tcm-close-right/);
  });

  test('close-others action present', () => {
    expect(src).toMatch(/tcm-close-others/);
  });

  test('close-all action present', () => {
    expect(src).toMatch(/tcm-close-all/);
  });

  test('menu is dismissed on outside mousedown', () => {
    expect(src).toMatch(/mousedown.*onOutside|onOutside.*mousedown/);
  });

  test('menu is dismissed on Escape key', () => {
    expect(src).toMatch(/Escape/);
  });

  test('close-left is disabled when target is the first tab', () => {
    expect(src).toMatch(/hasLeft.*disabled|disabled.*hasLeft/);
  });

  test('close-right is disabled when target is the last tab', () => {
    expect(src).toMatch(/hasRight.*disabled|disabled.*hasRight/);
  });
});
