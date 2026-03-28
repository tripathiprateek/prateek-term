'use strict';
/**
 * tests/renderer/line-wrap.test.js
 *
 * Regression tests for terminal line-wrap / FitAddon column calculation.
 *
 * BUG-012: Wrong line-wrap point — `.terminal-pane` had `padding: 4px` AND
 *   `.xterm` also had a padding override.  FitAddon measured the container
 *   including pane padding when calculating column count, causing it to
 *   underestimate available width → text wrapped too early.
 *
 * BUG-013: ResizeObserver fired before layout settled → fitAddon.fit() ran
 *   with stale dimensions.  Fix: wrap fit() in requestAnimationFrame.
 */

const fs   = require('fs');
const path = require('path');

const CSS_FILE = path.resolve(__dirname, '../../src/renderer/css/style.css');
const APP_JS   = path.resolve(__dirname, '../../src/renderer/js/app.js');
let css, appSource;

beforeAll(() => {
  css       = fs.readFileSync(CSS_FILE, 'utf8');
  appSource = fs.readFileSync(APP_JS, 'utf8');
});

// ---------------------------------------------------------------------------
// BUG-012 — Double padding causes FitAddon miscalculation
// ---------------------------------------------------------------------------

describe('Terminal pane padding (BUG-012)', () => {
  // Extract the .terminal-pane rule from the CSS
  const getPaneRule = (src) => {
    const m = src.match(/\.terminal-pane\s*\{[^}]+\}/);
    return m ? m[0] : '';
  };

  test('.terminal-pane rule does NOT contain padding (FitAddon needs zero padding)', () => {
    const rule = getPaneRule(css);
    // Allow the rule to be absent (not defined), but if present it must not set padding
    if (rule) {
      // strip comments first
      const stripped = rule.replace(/\/\*.*?\*\//gs, '');
      expect(stripped).not.toMatch(/\bpadding\s*:/);
    }
  });

  test('.terminal-pane has overflow:hidden to prevent double-scrollbars', () => {
    const rule = getPaneRule(css);
    if (rule) {
      expect(rule).toMatch(/overflow\s*:\s*hidden/);
    }
  });
});

// ---------------------------------------------------------------------------
// BUG-013 — ResizeObserver + requestAnimationFrame
// ---------------------------------------------------------------------------

describe('ResizeObserver uses requestAnimationFrame (BUG-013)', () => {
  test('fitAddon.fit() is called inside requestAnimationFrame callback', () => {
    // Pattern: requestAnimationFrame(() => { ... fitAddon.fit() ... })
    const rafAndFit = appSource.match(
      /requestAnimationFrame[\s\S]{0,200}fitAddon\.fit\(\)/
    );
    expect(rafAndFit).not.toBeNull();
  });

  test('resizeTerminal is called with updated cols/rows after fit()', () => {
    // After fit(), cols and rows must be sent to the PTY so it wraps correctly
    const fitBlock = appSource.match(
      /fitAddon\.fit\(\)[\s\S]{0,200}resizeTerminal/
    );
    expect(fitBlock).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Terminal options — scrollback and EOL
// ---------------------------------------------------------------------------

describe('Terminal constructor options', () => {
  test('scrollback of at least 1000 lines is configured', () => {
    const scrollbackMatch = appSource.match(/scrollback\s*:\s*(\d+)/);
    expect(scrollbackMatch).not.toBeNull();
    expect(parseInt(scrollbackMatch[1], 10)).toBeGreaterThanOrEqual(1000);
  });
});
