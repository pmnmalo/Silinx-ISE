// Silinx - a push button of the Board Emulator held down as long as a real press (#3109): a design's debouncer
// takes a press once the button stayed down for some milliseconds of the board's time (the examples': 20 ms,
// a million cycles at 50 MHz), and the emulator, slower than real time (the event-driven engine much slower),
// let a short click go after far fewer cycles. A button let go is released once the design has seen it for
// PRESS_MS of the board's time (at the chosen speed, at least one clock cycle); a longer press at once.
//
// Isomorphic ES module (browser + Node), no DOM.

/** How long a press lasts at least, in the board's time at real speed (a real press: about 100 ms). */
export const PRESS_MS = 100;

/**
 * The board's time (ps) at which a button pressed at `from` (ps) may be released: PRESS_MS later at the
 * board's real speed (speed 'real' or 'max': the board's own time), PRESS_MS of the user's time at a set
 * speed (`speed` cycles a second), never less than one clock cycle (`period`, ps).
 */
export function pressEnd({ from, speed, period }) {
  const cycles = typeof speed === 'number' ? speed * PRESS_MS / 1000 : PRESS_MS * 1e9 / period;
  return from + Math.max(1, Math.ceil(cycles)) * period;
}

/**
 * The releases held back: release(key, { until, now, go }) lets the button go at once (`go()`) when the
 * board's time `now` is at `until`, else when tick(now) reaches it, or goes back before the release (a power
 * cycle: the board's time from 0 again); press(key) drops the one held back (a new press); flush() lets them all
 * go (paused, powered off).
 *
 * The compiled engine runs in a worker, a run at a time (up to a quarter of a second's cycles when the page is slow,
 * #3727): an input set while one is in flight reaches the design once it is over, at a board time the page does not
 * know yet. press(key, { now, busy }) says when the press reaches the design: `now`, or (busy) the board's time when
 * the run in flight is over, the first tick(now, { settled: true }) after it; release(key, { until: from => …, … })
 * then counts from there.
 */
export function pressHolds() {
  const held = new Map(), starts = new Map();
  return {
    press(key, { now, busy = false } = {}) {
      held.delete(key);
      if (now === undefined) starts.delete(key);
      else starts.set(key, busy ? null : now);
    },
    release(key, { until, now, go }) {
      held.delete(key);
      if (typeof until === 'function') {
        const from = starts.has(key) ? starts.get(key) : now;
        starts.delete(key);
        // (pressed during a run in flight, not settled since: the press's start, and so its end, not known yet)
        if (from === null) { held.set(key, { from: now, end: until, go }); return; }
        until = until(from);
      }
      if (now >= until) go();
      else held.set(key, { from: now, until, go });
    },
    tick(now, { settled = true } = {}) {
      if (settled) for (const [key, at] of starts) if (at === null) starts.set(key, now);
      for (const [key, r] of [...held]) {
        if (r.end) { if (!settled) continue; r.until = r.end(now); delete r.end; }
        if (now >= r.until || now < r.from) { held.delete(key); r.go(); }
      }
    },
    flush() {
      const all = [...held.values()];
      held.clear();
      starts.clear();
      for (const r of all) r.go();
    },
    get size() { return held.size; },
  };
}
