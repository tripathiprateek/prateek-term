'use strict';
/**
 * Tab tear-off: holding PTY output while ownership moves between windows.
 *
 * A torn-off tab is disposed in the OLD window as soon as the new window is
 * requested, but the new window cannot adopt the PTY until its renderer has
 * booted. On a real tear-off that gap measured 2.7 seconds:
 *
 *   16:28:54.297  [window] open-new
 *   16:28:56.966  [pty:4] adopted by new window
 *
 * Output emitted in that gap used to be sent to the old window, which no longer
 * had a tab for that ptyId, so it was buffered into a map nothing ever read.
 *
 * An idle shell emits nothing, which is why plain tabs tore off fine. A
 * full-screen app (screen, tmux, vim) sends only INCREMENTAL updates and
 * assumes everything it wrote reached the screen — so a dropped delta leaves
 * the new window showing a stale frame forever.
 */

const { createHandoff } = require('../../src/main/pty-handoff');

describe('output is delivered normally when no hand-off is in progress', () => {
  test('hold() declines data for a pty nobody released', () => {
    const h = createHandoff();
    expect(h.hold(1, 'ls\r\n')).toBe(false);
  });

  test('a pty released and then adopted goes back to normal delivery', () => {
    const h = createHandoff();
    h.begin(1);
    h.end(1);
    expect(h.hold(1, 'after')).toBe(false);
  });
});

describe('output emitted during the hand-off gap survives it', () => {
  test('data is held, then replayed in order to the adopting window', () => {
    const h = createHandoff();
    h.begin(7);
    expect(h.hold(7, 'frame-1')).toBe(true);
    expect(h.hold(7, 'frame-2')).toBe(true);
    expect(h.end(7)).toEqual(['frame-1', 'frame-2']);
  });

  test('holding one pty does not capture another', () => {
    const h = createHandoff();
    h.begin(7);
    expect(h.hold(8, 'other windows keep flowing')).toBe(false);
    expect(h.end(7)).toEqual([]);
  });

  test('end() on a pty that was never released returns nothing and does not throw', () => {
    const h = createHandoff();
    expect(h.end(99)).toEqual([]);
  });

  test('a second begin() for the same pty keeps what is already held', () => {
    // The old window may release twice (e.g. a retried tear-off). Dropping the
    // buffer on the second call would reintroduce the very hole this fixes.
    const h = createHandoff();
    h.begin(3);
    h.hold(3, 'early');
    h.begin(3);
    h.hold(3, 'late');
    expect(h.end(3)).toEqual(['early', 'late']);
  });
});

describe('a hand-off that never completes cannot grow without bound', () => {
  test('held output stops accumulating past the cap', () => {
    const h = createHandoff({ maxBytes: 100 });
    h.begin(1);
    for (let i = 0; i < 50; i++) h.hold(1, 'x'.repeat(10));
    const replayed = h.end(1).join('');
    expect(replayed.length).toBeLessThanOrEqual(100);
  });

  test('hold() keeps returning true after the cap — data must not leak to the old window', () => {
    // Returning false past the cap would send the overflow to the window that
    // tore the tab off, i.e. print one window's output into another.
    const h = createHandoff({ maxBytes: 10 });
    h.begin(1);
    h.hold(1, 'x'.repeat(50));
    expect(h.hold(1, 'more')).toBe(true);
  });

  test('overflow is reported only once output is actually DROPPED', () => {
    // "Overflowed" has to mean "data was lost", because that is what justifies
    // forcing a repaint. A single oversized chunk is still kept whole — losing
    // the one frame we have would defeat the purpose — so it is not an overflow.
    const h = createHandoff({ maxBytes: 10 });
    h.begin(1);
    h.hold(1, 'x'.repeat(50));
    expect(h.overflowed(1)).toBe(false);
    h.hold(1, 'this chunk has nowhere to go');
    expect(h.overflowed(1)).toBe(true);
  });

  test('a hand-off within the cap does not report overflow', () => {
    const h = createHandoff({ maxBytes: 1000 });
    h.begin(1);
    h.hold(1, 'small');
    expect(h.overflowed(1)).toBe(false);
  });
});

describe('cleanup', () => {
  test('discard() frees a held buffer when the pty exits mid-hand-off', () => {
    const h = createHandoff();
    h.begin(5);
    h.hold(5, 'data');
    h.discard(5);
    expect(h.end(5)).toEqual([]);
    expect(h.hold(5, 'more')).toBe(false);
  });

  test('pending() reports which ptys are mid-hand-off', () => {
    const h = createHandoff();
    h.begin(1);
    h.begin(2);
    h.end(1);
    expect(h.pending()).toEqual([2]);
  });
});
