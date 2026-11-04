// SSim's path resolution and forces (#405: out of mountISim): finding a signal or an instance by its path (absolute,
// or relative to the selected instance), and the forces (isim force add / remove, the drawn stimuli) as
// pseudo-processes of the simulator. mountForces(ctx) is called by mountISim where this code was.
import { pathOf } from './isim.js';
import { findInstIn, findSignalIn, injectForceIn } from '/core/ssim-forces.js';

/** { findSignal, findInst, injectForce, isForced, addForce, removeForces } of an SSim window. */
export function mountForces(ctx) {
  const { st, sim, design, invalidate, logLine, objectsChanged } = ctx;

  // ---------------------------------------------------------------- path resolution (core/ssim-forces.js, #2674)
  const findSignal = p => findSignalIn(design, p, st.curInst);
  const findInst = p => findInstIn(design, p, st.curInst);

  // ---------------------------------------------------------------- forces (injected stimulus processes)
  // A force is a pattern of {off, val} applied from `start` (absolute ps), optionally repeating every `repeat`
  // ps, until `end` (absolute ps; the signal is released there when `endRelease`). It runs inside the
  // simulator as a pseudo-process woken through the event heap, so forced values land at exact times and
  // override drivers. Forces form a history: a new force on the same signal truncates the previous one, and
  // Restart replays the whole history from time 0.
  const injectForce = f => injectForceIn(sim, design, f);
  const forceActive = (f, t = sim.now) => f.start <= t ? (f.end == null || f.end > t) : true;
  function isForced(sig) { return st.forces.some(f => f.sig === sig && forceActive(f)); }
  // stop the forces of `sig` at time `t` (dropping those that have not started yet)
  function truncateForces(sig, t, release) {
    const keep = [];
    for (const f of st.forces) {
      if (f.sig !== sig) { keep.push(f); continue; }
      if (f.start >= t) { if (f.rt) f.rt.done = true; continue; }
      if (f.end == null || f.end > t) {
        f.end = t; f.endRelease = release;
        if (f.rt) f.rt.done = true;
        if (!sim.finished && t > sim.now) injectForceTail(f);
      }
      keep.push(f);
    }
    st.forces = keep;
  }
  // re-create the generator of a running force so it observes a new end time
  function injectForceTail(f) { injectForce(f); }
  function addForce(sig, { pattern, start = sim.now, repeat = 0, cancel = null, desc }) {
    start = Math.round(start);
    truncateForces(sig, start, false);
    const f = { id: st.forceSeq++, sig, pattern, start, repeat: Math.round(repeat), end: cancel == null ? null : Math.round(cancel), endRelease: true, desc };
    st.forces.push(f);
    if (sim.finished) { logLine('WARNING: simulation has finished; the force takes effect after restart', 'warning'); }
    else {
      injectForce(f);
      // apply immediately when starting now, so the change is visible without running
      if (f.start <= sim.now && pattern[0]?.off === 0) {
        if (!sim.started) sim.start();
        sim.force(sig, pattern[0].val);
        sim.run(sim.now);
      }
    }
    invalidate(false); objectsChanged();
    return f;
  }
  function removeForces(sig, silent) {
    if (!st.forces.some(f => f.sig === sig)) return;
    truncateForces(sig, sim.now, true);
    sim.release(sig);
    if (!silent) { logLine(`Force removed from ${pathOf(sig)}`, 'info'); invalidate(false); }
  }

  return { findSignal, findInst, injectForce, isForced, addForce, removeForces };
}
