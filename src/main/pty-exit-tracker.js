'use strict';
/**
 * Lets the app wait for every PTY child to report its exit before Node is torn
 * down.
 *
 * node-pty reports a child's exit from a native thread through a
 * ThreadSafeFunction, whose callback runs JavaScript on the main thread. Quit
 * kills every shell and then lets Electron free the Node environment. A child
 * that exits after that point still posts its event, and `uv_run` — draining
 * handles inside FreeEnvironment — delivers it to an environment that can no
 * longer run JS. node-addon-api's CallJS catches the resulting Napi::Error and
 * calls ThrowAsJavaScriptException, whose napi_throw fails for the same reason;
 * without NODE_API_SWALLOW_UNTHROWABLE_EXCEPTIONS that becomes a C++ `throw`
 * out of a C callback, so std::terminate() and the process dies with SIGABRT
 * (Napi::ThreadSafeFunction::CallJS → Napi::Error::ThrowAsJavaScriptException).
 *
 * No JS handler throws. The fix is to not quit until the exits have been
 * delivered while the environment is still alive.
 *
 * The `terminals` map in main.js cannot answer "is anything still pending?":
 * closeWindowTerminals() kills a window's PTYs and deletes them from it at once,
 * so by quit they are gone from the map while their exit watchers are not.
 * This tracks the PTYs themselves, from spawn until their own exit event.
 */

const KILL_AFTER_MS = 1500;   // SIGHUP did not take: escalate to SIGKILL
const GIVE_UP_AFTER_MS = 2500; // nothing more to try; quit rather than hang

/**
 * @param {{escalate?: boolean}} [opts] escalate: send SIGKILL to PTYs that
 *   outlive SIGHUP. Off on Windows, where node-pty's kill(signal) throws for
 *   any signal — and, for a terminal that is not ready yet, throws later from a
 *   deferred queue, outside any try/catch here.
 */
function createExitTracker({ escalate = process.platform !== 'win32' } = {}) {
  /** @type {Set<{kill: Function, onExit: Function}>} */
  const live = new Set();
  let wake = null;
  let inFlight = null;

  return {
    /** Register a freshly spawned PTY. Returns it so it can wrap pty.spawn. */
    track(term) {
      live.add(term);
      term.onExit(() => {
        live.delete(term);
        if (!live.size && wake) wake();
      });
      return term;
    },

    /** PTYs spawned and not yet reported as exited. */
    get pending() { return live.size; },

    /**
     * Hang up every live PTY and resolve once each has reported its exit.
     * Resolves true when all exits arrived, false if some never did (the
     * caller should quit anyway and accept the old race for those).
     *
     * Calling it again while a drain is running returns that drain: will-quit
     * can fire twice (Cmd+Q with no windows open), and two drains would share
     * one wake-up between them.
     */
    drain({ killAfterMs = KILL_AFTER_MS, giveUpAfterMs = GIVE_UP_AFTER_MS } = {}) {
      if (inFlight) return inFlight;
      inFlight = new Promise((resolve) => {
        if (!live.size) return resolve(true);
        const timers = [];
        const finish = (ok) => { timers.forEach(clearTimeout); wake = null; resolve(ok); };
        const signalAll = (sig) => {
          for (const t of live) { try { t.kill(sig); } catch { /* already gone */ } }
        };
        wake = () => finish(true);
        signalAll();
        if (escalate) timers.push(setTimeout(() => signalAll('SIGKILL'), killAfterMs));
        timers.push(setTimeout(() => finish(false), giveUpAfterMs));
      }).finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}

module.exports = { createExitTracker };
