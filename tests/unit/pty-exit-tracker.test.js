'use strict';
/**
 * Quitting with PTY tabs open aborted the app (SIGABRT, 2026-11-22).
 *
 * Three crash reports shared one faulting stack on CrBrowserMain:
 *
 *   abort → std::terminate → __cxa_throw
 *     → pty.node Napi::Error::ThrowAsJavaScriptException
 *     → Napi::ThreadSafeFunction::CallJS
 *     → uv_async_send → uv_run → node::FreeEnvironment
 *
 * It looks like a JS handler throwing, but none does. node-pty reports a
 * child's exit through a ThreadSafeFunction. Quit killed every shell and let
 * Electron free the Node environment; a child exiting after that posted its
 * event to an environment that can no longer run JS. CallJS's catch calls
 * ThrowAsJavaScriptException, napi_throw fails for the same reason, and with
 * C++ exceptions enabled (-DNAPI_CPP_EXCEPTIONS, no SWALLOW_UNTHROWABLE) that
 * becomes a C++ throw out of a C callback → std::terminate.
 *
 * The cure is not to quit until every exit event has been delivered while the
 * environment is alive. The native abort needs a real Electron to observe, so
 * this covers the two halves that can be checked without one: the tracker that
 * knows what is still pending, and the wiring in main.js that waits on it.
 */

const fs = require('fs');
const path = require('path');
const { createExitTracker } = require('../../src/main/pty-exit-tracker');

const mainSource = fs.readFileSync(path.resolve(__dirname, '../../src/main/main.js'), 'utf8');

/** A PTY whose native exit event is delivered only when the test says so. */
function fakeTerm() {
  const t = {
    signals: [],
    onExit(cb) { t._cb = cb; },
    kill: jest.fn((sig) => { t.signals.push(sig || 'SIGHUP'); }),
    exit() { t._cb({ exitCode: 0, signal: 1 }); },
  };
  return t;
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/** Start a drain and expose whether, and how, it has settled. */
function startDrain(tracker, opts) {
  const state = { settled: false, ok: undefined };
  tracker.drain(opts).then((ok) => { state.settled = true; state.ok = ok; });
  return state;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('exit tracker', () => {
  test('with nothing spawned, drain resolves at once', async () => {
    const d = startDrain(createExitTracker());
    await flush();
    expect(d).toEqual({ settled: true, ok: true });
  });

  test('track() hands the PTY back so it can wrap pty.spawn', () => {
    const tracker = createExitTracker();
    const term = fakeTerm();
    expect(tracker.track(term)).toBe(term);
    expect(tracker.pending).toBe(1);
  });

  test('drain hangs up every live PTY', async () => {
    const tracker = createExitTracker();
    const [a, b] = [fakeTerm(), fakeTerm()];
    tracker.track(a); tracker.track(b);
    startDrain(tracker);
    expect(a.signals).toEqual(['SIGHUP']);
    expect(b.signals).toEqual(['SIGHUP']);
  });

  test('drain waits until EVERY exit event has been delivered', async () => {
    const tracker = createExitTracker();
    const [a, b] = [fakeTerm(), fakeTerm()];
    tracker.track(a); tracker.track(b);
    const d = startDrain(tracker);

    a.exit();
    await flush();
    expect(d.settled).toBe(false);          // b's exit is still in flight
    expect(tracker.pending).toBe(1);

    b.exit();
    await flush();
    expect(d).toEqual({ settled: true, ok: true });
    expect(tracker.pending).toBe(0);
  });

  test('a PTY that already exited is not waited on', async () => {
    const tracker = createExitTracker();
    const [gone, live] = [fakeTerm(), fakeTerm()];
    tracker.track(gone); tracker.track(live);
    gone.exit();
    const d = startDrain(tracker);
    expect(gone.kill).not.toHaveBeenCalled();
    live.exit();
    await flush();
    expect(d).toEqual({ settled: true, ok: true });
  });

  test('a PTY killed earlier — and dropped by its owner — is still waited on', async () => {
    // closeWindowTerminals() does exactly this: kill, then delete from the
    // `terminals` map. The exit event has not arrived, and it is the one that
    // used to land inside FreeEnvironment.
    const tracker = createExitTracker();
    const term = fakeTerm();
    const terminals = new Map([[1, tracker.track(term)]]);
    term.kill();
    terminals.delete(1);

    expect(terminals.size).toBe(0);
    expect(tracker.pending).toBe(1);
    const d = startDrain(tracker);
    await flush();
    expect(d.settled).toBe(false);
    term.exit();
    await flush();
    expect(d.ok).toBe(true);
  });

  test('a PTY that ignores SIGHUP is escalated to SIGKILL', async () => {
    const tracker = createExitTracker();
    const stubborn = fakeTerm();
    tracker.track(stubborn);
    const d = startDrain(tracker, { killAfterMs: 100, giveUpAfterMs: 1000 });

    jest.advanceTimersByTime(99);
    expect(stubborn.signals).toEqual(['SIGHUP']);
    jest.advanceTimersByTime(1);
    expect(stubborn.signals).toEqual(['SIGHUP', 'SIGKILL']);

    stubborn.exit();
    await flush();
    expect(d).toEqual({ settled: true, ok: true });
  });

  test('if an exit never arrives, drain gives up (false) instead of hanging quit', async () => {
    const tracker = createExitTracker();
    tracker.track(fakeTerm());
    const d = startDrain(tracker, { killAfterMs: 100, giveUpAfterMs: 500 });

    jest.advanceTimersByTime(499);
    await flush();
    expect(d.settled).toBe(false);
    jest.advanceTimersByTime(1);
    await flush();
    expect(d).toEqual({ settled: true, ok: false });
  });

  test('a second drain while one is running is that same drain', async () => {
    // Cmd+Q still works on macOS with every window closed, so will-quit can
    // fire again mid-drain. A second drain used to replace the first's wake-up,
    // and the first's give-up then cleared the second's.
    const tracker = createExitTracker();
    const term = fakeTerm();
    tracker.track(term);
    const first = tracker.drain();
    expect(tracker.drain()).toBe(first);
    expect(term.signals).toEqual(['SIGHUP']);   // hung up once, not twice
    term.exit();
    await expect(first).resolves.toBe(true);
  });

  test('once a drain has finished, a new one starts fresh', async () => {
    const tracker = createExitTracker();
    const a = fakeTerm();
    tracker.track(a);
    const first = tracker.drain();
    a.exit();
    await first;

    const b = fakeTerm();
    tracker.track(b);
    const d = startDrain(tracker);
    await flush();
    expect(d.settled).toBe(false);              // waits for b, not first's result
    b.exit();
    await flush();
    expect(d).toEqual({ settled: true, ok: true });
  });

  test('without signal support (Windows) a stubborn PTY is never sent SIGKILL', async () => {
    // node-pty's WindowsTerminal.kill(signal) throws for any signal — and for a
    // not-yet-ready terminal it throws later, from a deferred queue, outside
    // any try/catch: an uncaught error in the main process.
    const tracker = createExitTracker({ escalate: false });
    const stubborn = fakeTerm();
    tracker.track(stubborn);
    const d = startDrain(tracker, { killAfterMs: 100, giveUpAfterMs: 500 });
    jest.advanceTimersByTime(500);
    await flush();
    expect(stubborn.signals).toEqual(['SIGHUP']);
    expect(d).toEqual({ settled: true, ok: false });
  });

  test('escalation is off by default on win32 and on elsewhere', () => {
    const real = Object.getOwnPropertyDescriptor(process, 'platform');
    const signalsOn = (platform) => {
      Object.defineProperty(process, 'platform', { value: platform });
      try {
        const tracker = createExitTracker();
        const t = fakeTerm();
        tracker.track(t);
        tracker.drain({ killAfterMs: 100, giveUpAfterMs: 500 });
        jest.advanceTimersByTime(100);
        return t.signals;
      } finally {
        Object.defineProperty(process, 'platform', real);
      }
    };
    expect(signalsOn('win32')).toEqual(['SIGHUP']);
    expect(signalsOn('darwin')).toEqual(['SIGHUP', 'SIGKILL']);
    expect(signalsOn('linux')).toEqual(['SIGHUP', 'SIGKILL']);
  });

  test('a finished drain leaves no timers behind to hold the process open', async () => {
    const tracker = createExitTracker();
    const term = fakeTerm();
    tracker.track(term);
    startDrain(tracker);
    term.exit();
    await flush();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('main.js waits for PTY exits before it lets the app quit', () => {
  test('every PTY is spawned through the tracker, never pty.spawn directly', () => {
    expect(mainSource).toMatch(/spawnTracked\s*=[^;]*exitTracker\.track\([^;]*pty\.spawn\(/);
    // The one allowed raw call is the wrapper itself. A new spawn site that
    // bypasses it is a PTY quit would not wait for.
    expect(mainSource.match(/\bpty\.spawn\(/g)).toHaveLength(1);
    // pty:create (primary + fallback), scp, and the MCP bridge.
    expect(mainSource.match(/\bspawnTracked\(/g).length).toBeGreaterThanOrEqual(4);
  });

  test('will-quit holds the quit until the tracker has drained', () => {
    const handlers = mainSource.match(/app\.on\('will-quit'[\s\S]*?\n\}\);/g) || [];
    const drain = handlers.find((h) => h.includes('exitTracker.drain('));
    expect(drain).toBeDefined();
    expect(drain).toMatch(/\(event\)/);
    expect(drain).toMatch(/event\.preventDefault\(\)/);
    // Re-quit once drained — and only once, or will-quit would hold forever.
    expect(drain).toMatch(/quitDrained\s*=\s*true[\s\S]*app\.quit\(\)/);
    expect(drain).toMatch(/quitDrained\s*\|\|/);
  });

  test('quit stops the MCP bridge first, so no session can start mid-drain', () => {
    // A `connect` during the drain spawns a PTY the first SIGHUP missed; one
    // after quitDrained is set is not waited for at all — the original race.
    const drain = (mainSource.match(/app\.on\('will-quit'[\s\S]*?\n\}\);/g) || [])
      .find((h) => h.includes('exitTracker.drain('));
    const stopAt = drain.indexOf('bridge.stop()');
    expect(stopAt).toBeGreaterThan(-1);
    // Before the early return: a PTY-free quit must stop the bridge too.
    expect(stopAt).toBeLessThan(drain.indexOf('if (quitDrained'));
  });

  test('a PTY-free quit is not delayed', () => {
    const drain = (mainSource.match(/app\.on\('will-quit'[\s\S]*?\n\}\);/g) || [])
      .find((h) => h.includes('exitTracker.drain('));
    expect(drain).toMatch(/!exitTracker\.pending/);
  });
});
