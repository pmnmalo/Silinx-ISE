// Silinx - Rearrange Wires' channels (#1994): the wires that run side by side between the symbols ordered with the
// fewest crossings, then spread at an even pitch. A wire's middle segment between two bends that turn the same way (a
// Z: a vertical run between two horizontal ones, or a horizontal run between two vertical ones) can slide sideways
// without changing the wire's bends or its length: the runs that can slide over the same free strip and lie side by
// side are a channel. For each channel the order of its runs with the fewest crossings is chosen (every order of up to
// six runs, swaps of neighbours for more), and the runs are spread over the strip at an even pitch (the gaps between
// neighbours and to the strip's walls equal, within a grid step). A channel takes its new runs only when every wire is
// clear (core/schpath.js's rules), the sheet has no more crossings, and fewer crossings or more even gaps.
//
// Isomorphic ES module (browser + Node). schdoc.js's names are read inside functions only (an import cycle).
import { GRID, key } from './schdoc.js';
import { cleanPath, pathViolations, segPoints, wireGrid } from './schpath.js';

const PERMUTE = 6, SWEEPS = 4;

// the crossings of a path with the wires of the grid (as core/schbeautify.js counts them)
function crossingsOf(g, pts) {
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a.x === b.x) === (a.y === b.y)) continue;
    const P = segPoints(a, b), m = a.y === b.y ? g.v : g.h;
    for (let j = 1; j < P.length - 1; j++) n += m.get(key(P[j].x, P[j].y)) || 0;
  }
  return n;
}

// the net names on a path's points (keys)
function namesOn(pts, labels) {
  const out = new Set();
  for (let i = 0; i + 1 < pts.length; i++) for (const q of segPoints(pts[i], pts[i + 1])) if (labels.has(key(q.x, q.y))) out.add(key(q.x, q.y));
  return out;
}
// a path that takes in no net name the old one did not have (a name with no wire under it would name this one's net)
const keepsNames = (pts, had, labels) => [...namesOn(pts, labels)].every(k => had.has(k));

// the path with its run i (from pts[i] to pts[i + 1]) at c: x for a vertical run, y for a horizontal one
function moved(pts, i, vert, c) {
  const out = pts.map(p => ({ x: p.x, y: p.y }));
  if (vert) out[i].x = out[i + 1].x = c; else out[i].y = out[i + 1].y = c;
  return out;
}

// the runs of the wires that can slide: { w, pts (the wire's clean path), i, vert, pos, lo, hi (the clear positions
// next to it, the run kept between its two neighbours' far ends), a0, a1 (its extent along its own axis) }
function runsOf(doc, wires, vert, modules) {
  const labels = new Set(doc.labels.map(l => key(l.x, l.y)));
  const g0 = wireGrid(doc, { modules, skip: new Set(wires.map(w => w.id)) });
  const gAll = wireGrid(doc, { modules });
  const out = [];
  for (const w of wires) {
    const pts = cleanPath(w.points);
    if (pts.length < 4 || pts.some((p, i) => i && p.x !== pts[i - 1].x && p.y !== pts[i - 1].y)) continue;
    gAll.removeWire(w.points);
    const clean = !pathViolations(gAll, pts).length;
    gAll.addWire(w.points);
    if (!clean) continue;
    const used = new Set();
    for (let i = 1; i + 2 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], p = pts[i - 1], q = pts[i + 2];
      if (vert ? a.x !== b.x : a.y !== b.y) continue;
      const c = vert ? a.x : a.y, cp = vert ? p.x : p.y, cq = vert ? q.x : q.y;
      if (Math.sign(c - cp) !== Math.sign(cq - c) || used.has(i - 1) || used.has(i + 1)) continue;   // a Z only, one run per segment
      // (a net name names the wire under it: on the run, the run stays; on a neighbour, the run keeps beyond it)
      if (segPoints(a, b).some(s => labels.has(key(s.x, s.y)))) continue;
      let lo0 = Math.min(cp, cq) + GRID, hi0 = Math.max(cp, cq) - GRID;
      for (const [u, v] of [[p, a], [b, q]]) {
        for (const s of segPoints(u, v)) {
          if (!labels.has(key(s.x, s.y))) continue;
          const l = vert ? s.x : s.y;
          if (l < c) lo0 = Math.max(lo0, l + GRID); else hi0 = Math.min(hi0, l - GRID);
        }
      }
      if (c < lo0 || c > hi0) continue;
      const had = namesOn(pts, labels);
      const ok = x => { const m = moved(pts, i, vert, x); return !pathViolations(g0, m).length && keepsNames(m, had, labels); };
      let lo = c, hi = c;
      while (lo - GRID >= lo0 && ok(lo - GRID)) lo -= GRID;
      while (hi + GRID <= hi0 && ok(hi + GRID)) hi += GRID;
      const e0 = vert ? a.y : a.x, e1 = vert ? b.y : b.x;
      out.push({ w, pts, i, vert, pos: c, lo, hi, a0: Math.min(e0, e1), a1: Math.max(e0, e1), had, labels });
      used.add(i);
    }
  }
  return out;
}

// the channels: runs side by side (their extents overlap) over a common strip, split where the strip is too narrow for
// them all
function channelsOf(runs) {
  const seen = new Set(), out = [];
  const near = (r, s) => r.a0 <= s.a1 && s.a0 <= r.a1 && r.lo <= s.hi && s.lo <= r.hi;
  for (const r of runs) {
    if (seen.has(r)) continue;
    const comp = [r];
    seen.add(r);
    for (let k = 0; k < comp.length; k++) for (const s of runs) if (!seen.has(s) && near(comp[k], s)) { seen.add(s); comp.push(s); }
    comp.sort((x, y) => x.lo - y.lo || x.hi - y.hi || x.pos - y.pos);
    let cur = [], lo = -Infinity, hi = Infinity;
    const flush = () => { if (cur.length > 1) out.push({ runs: cur, lo, hi }); };
    for (const s of comp) {
      const l = Math.max(lo, s.lo), h = Math.min(hi, s.hi);
      if (cur.length && (h - l) / GRID + 1 < cur.length + 1) { flush(); cur = []; lo = -Infinity; hi = Infinity; }
      cur.push(s); lo = Math.max(lo, s.lo); hi = Math.min(hi, s.hi);
    }
    flush();
  }
  return out;
}

// n positions spread over the strip lo..hi (its walls a grid step outside it), the gaps equal within a grid step
function spread(n, lo, hi) {
  const w0 = lo - GRID, span = hi - lo + 2 * GRID;
  return [...Array(n).keys()].map(k => w0 + Math.round((k + 1) * span / (n + 1) / GRID) * GRID);
}
// how uneven a channel's positions are: the largest gap less the smallest (its walls included)
function unevenness(pos, lo, hi) {
  const s = [lo - GRID, ...[...pos].sort((a, b) => a - b), hi + GRID];
  const gaps = s.slice(1).map((x, k) => x - s[k]);
  return Math.max(...gaps) - Math.min(...gaps);
}

// the crossings of the channel's wires with the runs at `pos` (Infinity: a wire not clear), on g without them
function cost(g, ch, pos) {
  const paths = ch.runs.map((r, k) => moved(r.pts, r.i, r.vert, pos[k]));
  let n = 0, k = 0;
  for (; k < paths.length; k++) {
    const r = ch.runs[k];
    if (pathViolations(g, paths[k]).length || !keepsNames(paths[k], r.had, r.labels)) { n = Infinity; break; }
    n += crossingsOf(g, paths[k]);
    g.addWire(paths[k]);
  }
  for (let j = 0; j < k; j++) g.removeWire(paths[j]);
  return n;
}

// the best positions of a channel's runs, by their crossings, then by how even they are: an order of the runs (every
// one, or neighbours swapped from the present one) at the even positions, or at the positions the runs have now
function best(g, ch) {
  const n = ch.runs.length, now = ch.runs.map(r => r.pos);
  const sets = [spread(n, ch.lo, ch.hi), now.slice().sort((a, b) => a - b)];
  const score = pos => ({ pos, c: cost(g, ch, pos), u: unevenness(pos, ch.lo, ch.hi) });
  const better = (x, y) => x.c < y.c || (x.c === y.c && x.u < y.u);
  const order0 = [...now.keys()].sort((a, b) => now[a] - now[b]);
  let top = { ...score(now), order: order0 };
  const tryOrder = order => {
    let any = false;
    for (const at of sets) {
      const pos = new Array(n);
      order.forEach((r, k) => { pos[r] = at[k]; });
      const s = score(pos);
      if (better(s, top)) { top = { ...s, order }; any = true; }
    }
    return any;
  };
  if (n <= PERMUTE) {
    const perm = (pre, rest) => {
      if (!rest.length) { tryOrder(pre); return; }
      rest.forEach((x, k) => perm([...pre, x], [...rest.slice(0, k), ...rest.slice(k + 1)]));
    };
    perm([], order0);
  } else {
    tryOrder(order0);
    for (let s = 0, any = true; s < SWEEPS && any; s++) {
      any = false;
      for (let k = 0; k + 1 < n; k++) {
        const o = top.order.slice();
        [o[k], o[k + 1]] = [o[k + 1], o[k]];
        if (tryOrder(o)) any = true;
      }
    }
  }
  return top;
}

/**
 * The channels of the wires of `only` (ids; null: every wire) ordered and spread (the document mutated): the vertical
 * runs, then the horizontal ones. Returns the ids of the wires that changed.
 */
export function spreadChannels(doc, { modules = {}, only = null } = {}) {
  const changed = new Set();
  for (const vert of [true, false]) {
    const wires = doc.wires.filter(w => (!only || only.has(w.id)) && w.points.length >= 4);
    const chans = channelsOf(runsOf(doc, wires, vert, modules));
    if (!chans.length) continue;
    const g = wireGrid(doc, { modules });
    for (const ch of chans) {
      // (a wire with two runs in the channel, or in two channels already changed: its path as it is now)
      if (new Set(ch.runs.map(r => r.w)).size < ch.runs.length || ch.runs.some(r => changed.has(r.w.id) && JSON.stringify(cleanPath(r.w.points)) !== JSON.stringify(r.pts))) continue;
      for (const r of ch.runs) g.removeWire(r.w.points);
      const { pos, c } = best(g, ch);
      const take = c !== Infinity && pos.some((x, k) => x !== ch.runs[k].pos);
      if (take) ch.runs.forEach((r, k) => { if (pos[k] !== r.pos) { r.w.points = moved(r.pts, r.i, r.vert, pos[k]); changed.add(r.w.id); } });
      for (const r of ch.runs) g.addWire(r.w.points);
    }
  }
  return [...changed];
}

/**
 * The measures of a sheet's channels: { channels, runs, uneven (the channels whose gaps differ by more than a grid
 * step), spread (the sum over the channels of their largest gap less their smallest, in grid steps) }.
 */
export function channelStats(doc, { modules = {} } = {}) {
  const out = { channels: 0, runs: 0, uneven: 0, spread: 0 };
  for (const vert of [true, false]) {
    for (const ch of channelsOf(runsOf(doc, doc.wires.filter(w => w.points.length >= 4), vert, modules))) {
      const u = unevenness(ch.runs.map(r => r.pos), ch.lo, ch.hi) / GRID;
      out.channels++; out.runs += ch.runs.length; out.spread += u;
      if (u > 1) out.uneven++;
    }
  }
  return out;
}
