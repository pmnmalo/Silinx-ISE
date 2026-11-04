// SSim's signals by their path and its forces (out of web/js/isim-forces.js, #2674, so that the server forces signals
// too): a signal or an instance of the design by its path (absolute, or relative to the selected instance; an
// instance's port its parent's signal), and a force run inside the simulator as a pseudo-process.

export function normPath(p) { return String(p).trim().replace(/^\/+/, '').replace(/\//g, '.').toLowerCase(); }
export function findSignalIn(design, p, curInst = null) {
  const n = normPath(p);
  const cands = [n];
  if (curInst) cands.push(normPath(curInst.path) + '.' + n);
  if (design.top) cands.push(normPath(design.top.path) + '.' + n);
  for (const c of cands) {
    const s = design.signals.find(s => s.path.toLowerCase() === c);
    if (s) return s;
    // port aliases: inst.port names map to parent signals
    const dot = c.lastIndexOf('.');
    const inst = findInstIn(design, c.slice(0, dot));
    const port = inst?.ports.find(pp => pp.name.toLowerCase() === c.slice(dot + 1));
    if (port) return port.sig;
  }
  return null;
}
export function findInstIn(design, p, curInst = null) {
  const n = normPath(p);
  let res = null;
  const walk = (i) => { if (res) return; if (i.path.toLowerCase() === n) res = i; else i.children.forEach(walk); };
  if (design.top) walk(design.top);
  if (!res && curInst && n) {
    const m = normPath(curInst.path) + '.' + n;
    const w2 = (i) => { if (res) return; if (i.path.toLowerCase() === m) res = i; else i.children.forEach(w2); };
    w2(design.top);
  }
  return res;
}

// A force is a pattern of {off, val} applied from `start` (absolute ps), optionally repeating every `repeat`
// ps, until `end` (absolute ps; the signal is released there when `endRelease`). It runs inside the
// simulator as a pseudo-process woken through the event heap, so forced values land at exact times and
// override drivers. Forces form a history: a new force on the same signal truncates the previous one, and
// Restart replays the whole history from time 0.
export function injectForceIn(sim, design, f) {
  const sigRef = f.sig;
  const from = sim.now;
  const gen = (function* () {
    let base = f.start;
    // (re)injected mid-flight: skip the cycles that are already in the past
    if (f.repeat && from > f.start) base += Math.floor((from - f.start) / f.repeat) * f.repeat;
    for (;;) {
      for (const ev of f.pattern) {
        const tk = base + ev.off;
        if (tk < from && (f.repeat || ev !== f.pattern[f.pattern.length - 1])) continue;
        if (f.end != null && tk >= f.end) {
          if (f.endRelease) { if (f.end > sim.now) yield { delay: f.end - sim.now }; sim.release(sigRef); }
          return;
        }
        if (tk > sim.now) yield { delay: tk - sim.now };
        sim.force(sigRef, ev.val);
      }
      if (!f.repeat) break;
      base += f.repeat;
    }
    if (f.end != null && f.endRelease) {
      if (f.end > sim.now) yield { delay: f.end - sim.now };
      sim.release(sigRef);
    }
  })();
  const rt = { p: { name: `isim_force_${sigRef.name}`, kind: 'force', inst: design.top, file: null, loc: null }, gen, done: false, rec: null, ctx: null };
  f.rt = rt;
  sim.heap.push(Math.max(f.start, sim.now), { wake: rt });
}
