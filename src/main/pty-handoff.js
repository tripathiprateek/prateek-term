'use strict';
/**
 * Holds a PTY's output while its ownership moves from one window to another.
 *
 * Tearing a tab off disposes it in the old window as soon as the new window is
 * *requested*, but the new window cannot adopt the PTY until its renderer has
 * booted. On a real tear-off that gap was 2.7 seconds. Everything the PTY
 * emitted in that window went to the old window, which no longer had a tab for
 * that id, and was dropped on the floor.
 *
 * An idle shell emits nothing, so plain tabs appeared to tear off cleanly. A
 * full-screen app (screen, tmux, vim, htop) sends only INCREMENTAL updates and
 * assumes everything it wrote reached the screen. One dropped delta and the new
 * window shows a stale frame forever — the app will never resend it.
 */

// Far larger than any redraw burst, small enough to be harmless if a tear-off
// never completes and the hold is never claimed.
const MAX_HELD_BYTES = 4 * 1024 * 1024;

/**
 * @param {{maxBytes?: number}} [opts]
 */
function createHandoff({ maxBytes = MAX_HELD_BYTES } = {}) {
  /** @type {Map<number, {chunks: string[], bytes: number, overflowed: boolean}>} */
  const inTransit = new Map();

  return {
    /** The old window has let go of `id`; hold its output until someone adopts. */
    begin(id) {
      // Keep any existing hold: a repeated release must not discard output
      // already captured, which is the exact hole this closes.
      if (!inTransit.has(id)) {
        inTransit.set(id, { chunks: [], bytes: 0, overflowed: false });
      }
    },

    /**
     * Offer a chunk. Returns true when it was held (caller must not deliver it),
     * false when the PTY has a live owner and the caller should send it on.
     */
    hold(id, data) {
      const slot = inTransit.get(id);
      if (!slot) return false;
      // Past the cap we still swallow the chunk. Returning false here would
      // deliver it to the window that tore the tab off — printing one window's
      // output into another. The adopting window repaints instead; see
      // overflowed().
      if (slot.bytes < maxBytes) {
        slot.chunks.push(data);
        slot.bytes += data.length;
      } else {
        slot.overflowed = true;
      }
      return true;
    },

    /** Whether output was dropped, so the caller should force a repaint. */
    overflowed(id) {
      const slot = inTransit.get(id);
      return slot ? slot.overflowed : false;
    },

    /** The new window has adopted `id`; stop holding and hand back the backlog. */
    end(id) {
      const slot = inTransit.get(id);
      if (!slot) return [];
      inTransit.delete(id);
      return slot.chunks;
    },

    /** The PTY exited mid-hand-off — drop the hold. */
    discard(id) {
      inTransit.delete(id);
    },

    /** ptyIds currently mid-hand-off. */
    pending() {
      return [...inTransit.keys()];
    },
  };
}

module.exports = { createHandoff, MAX_HELD_BYTES };
