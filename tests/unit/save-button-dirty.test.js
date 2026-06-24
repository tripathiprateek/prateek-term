'use strict';

/**
 * Source-contract tests for the dirty-tracking save button in app.js.
 *
 * Behaviour:
 *   - Existing profile opened unchanged  → button shows "Close" (X icon)
 *   - Any edit in the form              → button switches to "Save" (floppy icon)
 *   - After save completes              → flash "Saved ✓" green for ~2 s, then revert to "Close"
 *   - Click while in "close" mode       → closes the profile editor (no save)
 */

const fs   = require('fs');
const path = require('path');

const APP_SRC = path.join(__dirname, '../../src/renderer/js/app.js');

let source;
beforeAll(() => {
  source = fs.readFileSync(APP_SRC, 'utf8');
});

// ---------------------------------------------------------------------------
// setSaveButtonMode — function existence and modes
// ---------------------------------------------------------------------------

describe('setSaveButtonMode — function contract', () => {
  test('function is defined', () => {
    expect(source).toMatch(/function setSaveButtonMode\s*\(mode\)/);
  });

  test('handles three modes: save, close, saved', () => {
    expect(source).toContain("mode === 'saved'");
    expect(source).toContain("mode === 'close'");
    // else branch covers 'save'
  });

  test('saved mode sets dataset.mode to close (reverts correctly)', () => {
    // After "saved" flash, dataset.mode must be 'close' so clicking closes panel
    const savedBlock = source.slice(
      source.indexOf("mode === 'saved'"),
      source.indexOf("mode === 'close'")
    );
    expect(savedBlock).toContain("btn.dataset.mode = 'close'");
  });

  test('close mode sets dataset.mode to close', () => {
    const closeBlock = source.slice(
      source.indexOf("} else if (mode === 'close')"),
      source.indexOf("} else {", source.indexOf("} else if (mode === 'close')"))
    );
    expect(closeBlock).toContain("btn.dataset.mode = 'close'");
  });

  test('save mode sets dataset.mode to save', () => {
    expect(source).toContain("btn.dataset.mode = 'save'");
  });

  test('clears flash timer before changing mode (avoids double-revert)', () => {
    expect(source).toContain('_savedFlashTimer');
    expect(source).toContain('clearTimeout(_savedFlashTimer)');
  });

  test('saved flash reverts to close mode after 2 s', () => {
    expect(source).toContain("setSaveButtonMode('close'), 2000)");
  });
});

// ---------------------------------------------------------------------------
// HTML constants — Save / Saved / Close button labels
// ---------------------------------------------------------------------------

describe('save button HTML constants', () => {
  test('SAVE_BTN_SAVE_HTML defined and contains "Save" label', () => {
    expect(source).toContain('SAVE_BTN_SAVE_HTML');
    // Label text appears after closing svg tag
    expect(source).toMatch(/SAVE_BTN_SAVE_HTML\s*=[\s\S]{0,600}>\s*Save/);
  });

  test('SAVE_BTN_SAVED_HTML defined and contains "Saved" label', () => {
    expect(source).toContain('SAVE_BTN_SAVED_HTML');
    expect(source).toMatch(/SAVE_BTN_SAVED_HTML\s*=[\s\S]{0,600}>\s*Saved/);
  });

  test('SAVE_BTN_CLOSE_HTML defined and contains "Close" label', () => {
    expect(source).toContain('SAVE_BTN_CLOSE_HTML');
    expect(source).toMatch(/SAVE_BTN_CLOSE_HTML\s*=[\s\S]{0,600}>\s*Close/);
  });
});

// ---------------------------------------------------------------------------
// Integration — populateForm and form listeners
// ---------------------------------------------------------------------------

describe('dirty-tracking integration', () => {
  test('populateForm sets button to close mode (existing profile loads as Close)', () => {
    expect(source).toContain("setSaveButtonMode('close')");
    // It must appear inside or after populateForm
    const pfIdx = source.indexOf('function populateForm(');
    const closeIdx = source.indexOf("setSaveButtonMode('close')", pfIdx);
    expect(closeIdx).toBeGreaterThan(pfIdx);
  });

  test('form input event triggers save mode', () => {
    // dom.connectionForm.addEventListener('input',  () => setSaveButtonMode('save'));
    expect(source).toMatch(/addEventListener\('input'[\s\S]{0,50}setSaveButtonMode\('save'\)/);
  });

  test('form change event triggers save mode', () => {
    // dom.connectionForm.addEventListener('change', () => setSaveButtonMode('save'));
    expect(source).toMatch(/addEventListener\('change'[\s\S]{0,50}setSaveButtonMode\('save'\)/);
  });

  test('save button click in close mode calls closeConnectionManager (not saveCurrentProfile)', () => {
    expect(source).toContain("dataset.mode === 'close'");
    // closeConnectionManager must be called in that branch
    const modeBlock = source.slice(
      source.indexOf("dataset.mode === 'close'"),
      source.indexOf("dataset.mode === 'close'") + 200
    );
    expect(modeBlock).toContain('closeConnectionManager');
  });

  test('successful save triggers setSaveButtonMode("saved")', () => {
    expect(source).toContain("setSaveButtonMode('saved')");
  });

  test('"save" mode call present when new profile created', () => {
    // New profile → button in save mode immediately
    expect(source).toContain("setSaveButtonMode('save')");
  });
});

// ---------------------------------------------------------------------------
// Button-driven changes — programmatic .value= bypasses form events
// ---------------------------------------------------------------------------

describe('programmatic value changes trigger save mode', () => {
  test('Browse PEM: setSaveButtonMode called after file selected', () => {
    // filePath set via openFileDialog result — not a user input event
    const browseBlock = source.slice(
      source.indexOf('dom.btnBrowsePem.addEventListener'),
      source.indexOf('dom.btnClearPem.addEventListener')
    );
    expect(browseBlock).toContain("setSaveButtonMode('save')");
  });

  test('Clear PEM: setSaveButtonMode called', () => {
    const clearBlock = source.slice(
      source.indexOf('dom.btnClearPem.addEventListener'),
      source.indexOf('dom.btnBrowseLocal.addEventListener')
    );
    expect(clearBlock).toContain("setSaveButtonMode('save')");
  });

  test('Browse local SCP path: setSaveButtonMode called after dir selected', () => {
    const browseLocalBlock = source.slice(
      source.indexOf('dom.btnBrowseLocal.addEventListener'),
      source.indexOf('// IPv4')
    );
    expect(browseLocalBlock).toContain("setSaveButtonMode('save')");
  });

  test('Auth-type button click triggers save mode', () => {
    const authBtnBlock = source.slice(
      source.indexOf("querySelectorAll('.auth-type-btn').forEach"),
      source.indexOf('// Password visibility toggle')
    );
    expect(authBtnBlock).toContain("setSaveButtonMode('save')");
  });

  test('SSH mode button click triggers save mode', () => {
    const modeBtnBlock = source.slice(
      source.indexOf("querySelectorAll('.mode-btn').forEach"),
      source.indexOf('// SCP Direction selector')
    );
    expect(modeBtnBlock).toContain("setSaveButtonMode('save')");
  });

  test('Jump Host auth-type button click triggers save mode', () => {
    const proxyAuthBlock = source.slice(
      source.indexOf("querySelectorAll('.auth-type-btn[data-proxy-auth]').forEach"),
      source.indexOf('// Browse jump host key file')
    );
    expect(proxyAuthBlock).toContain("setSaveButtonMode('save')");
  });

  test('Browse jump host PEM triggers save mode', () => {
    const proxyBrowseBlock = source.slice(
      source.indexOf('dom.btnBrowseProxyPem.addEventListener'),
      source.indexOf('dom.btnClearProxyPem.addEventListener')
    );
    expect(proxyBrowseBlock).toContain("setSaveButtonMode('save')");
  });

  test('Clear jump host PEM triggers save mode', () => {
    const proxyClearBlock = source.slice(
      source.indexOf('dom.btnClearProxyPem.addEventListener'),
      source.indexOf('// Show/hide jump host password')
    );
    expect(proxyClearBlock).toContain("setSaveButtonMode('save')");
  });

  test('PF remove button triggers save mode', () => {
    const removeBtnBlock = source.slice(
      source.indexOf("querySelector('.btn-pf-remove').addEventListener"),
      source.indexOf('// Filter row')
    );
    expect(removeBtnBlock).toContain("setSaveButtonMode('save')");
  });

  test('PF add rule button triggers save mode', () => {
    const addRuleBlock = source.slice(
      source.indexOf('dom.btnAddPfRule.addEventListener'),
      source.indexOf('// Keyboard shortcuts')
    );
    expect(addRuleBlock).toContain("setSaveButtonMode('save')");
  });

  test('PF filter mode button triggers save mode', () => {
    const filterBtnBlock = source.slice(
      source.indexOf("querySelectorAll('.pf-filter-btn').forEach"),
      source.indexOf("querySelector('.pf-filter-list').addEventListener('input'")
    );
    expect(filterBtnBlock).toContain("setSaveButtonMode('save')");
  });
});
