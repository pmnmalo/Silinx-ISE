// Silinx - Beautify (#1481): a schematic's wires drawn again so that the drawing is easier to read. The symbols, the
// I/O markers and the net names stay where they are, and so does every point of a wire that something is attached to
// (its two ends, where it connects, and the net names on it): only the paths between them are routed again,
// on core/schpath.js's grid with its router (orthogonal, around the bodies, never along another wire, never bending on
// one). A wire takes its new path only when the path is clear and has no more bends and no more crossings than the old
// one, and fewer of either or a shorter length (a wire that broke a rule, or had a diagonal, takes any clear path): the
// connections, the netlist and the generated HDL are the same, and the drawing never gets worse by these measures.
//
// Isomorphic ES module (browser + Node).
import { GRID, key, netlist, symbolBox, symbolPins } from './schdoc.js';
import { cleanPath, pathViolations, routePath, segPoints, wireGrid } from './schpath.js';
import { spreadChannels } from './schchannels.js';

const onGrid = p => p.x % GRID === 0 && p.y % GRID === 0;
const diagonal = pts => pts.some((a, i) => i + 1 < pts.length && a.x !== pts[i + 1].x && a.y !== pts[i + 1].y);
const bendsOf = pts => Math.max(0, cleanPath(pts).length - 2);
const lengthOf = pts => pts.reduce((n, a, i) => n + (i ? Math.abs(a.x - pts[i - 1].x) + Math.abs(a.y - pts[i - 1].y) : 0), 0);

// the inner points of a path's segments, horizontal and vertical (its bends and ends not)
function inner(pts, f) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a.x === b.x) === (a.y === b.y)) continue;
    const P = segPoints(a, b);
    for (let j = 1; j < P.length - 1; j++) f(key(P[j].x, P[j].y), a.y === b.y);
  }
}
// the crossings of a path with the wires of the grid (a horizontal step over a vertical wire's inside, and the reverse)
function crossingsOf(g, pts) {
  let n = 0;
  inner(pts, (k, hz) => { n += (hz ? g.v : g.h).get(k) || 0; });
  return n;
}

/**
 * The measures of a document's wires: { bends, crossings, diagonals, clashes } (clashes: core/schpath.js's
 * pathViolations of every wire against the others, by kind: { overlap, pin, touch, label, body, self }).
 */
export function wireStats(doc, { modules = {} } = {}) {
  const g = wireGrid(doc, { modules });
  const out = { bends: 0, crossings: 0, diagonals: 0, clashes: {} };
  const H = new Map(), V = new Map();
  for (const w of doc.wires) {
    out.bends += bendsOf(w.points);
    if (diagonal(w.points)) out.diagonals++;
    inner(w.points, (k, hz) => { const m = hz ? H : V; m.set(k, (m.get(k) || 0) + 1); });
    g.removeWire(w.points);
    for (const v of pathViolations(g, w.points)) out.clashes[v.kind] = (out.clashes[v.kind] || 0) + 1;
    g.addWire(w.points);
  }
  for (const [k, n] of H) out.crossings += n * (V.get(k) || 0);
  return out;
}

// a bus's taps (an ISE schematic's slices and joins) sit on the bus: a bus through their bodies is how they are drawn
const TAPS = new Set(['slice', 'busjoin']);
function tapsOf(doc, modules) {
  return doc.symbols.filter(s => TAPS.has(s.type)).map(s => symbolBox(s, modules));
}

// the points of a wire something is attached to, in order along it: its two ends (where it connects, #678: a junction
// is the end of every wire there) and the net names on it (a name names the wire under it: it stays where it is)
function anchorsOf(doc, w) {
  const at = new Set(doc.labels.map(l => key(l.x, l.y)));
  const pts = w.points, out = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const P = segPoints(pts[i], pts[i + 1]);
    for (let j = 1; j < P.length; j++) {
      const q = P[j], last = i + 1 === pts.length - 1 && j === P.length - 1;
      if (last || at.has(key(q.x, q.y))) out.push({ x: q.x, y: q.y });
    }
  }
  return out;
}
// the old path between two of its anchors (a and b in order along it)
function piece(pts, a, b) {
  const all = [];
  for (let i = 0; i + 1 < pts.length; i++) segPoints(pts[i], pts[i + 1]).forEach((q, j) => { if (j > 0 || !all.length) all.push(q); });
  const ia = all.findIndex(q => q.x === a.x && q.y === a.y);
  const ib = all.findIndex((q, i) => i > ia && q.x === b.x && q.y === b.y);
  return cleanPath(all.slice(ia, ib + 1));
}

// a new path for wire w (its anchors kept): each piece between two anchors routed again on the grid (the wire's other
// pieces in it), the best clear one of the routings from either end (and, when neither is clear, of the ones arriving
// from each side); a piece with no clear path keeps its old one
function reroute(g, w, anchors, maxNodes) {
  const now = anchors.slice(0, -1).map((a, i) => piece(w.points, a, anchors[i + 1]));
  now.forEach(p => g.addWire(p));
  const clear = p => p && !pathViolations(g, p).length;
  const score = p => bendsOf(p) * 4 + crossingsOf(g, p) * 3 + lengthOf(p) / GRID / 100;
  for (let i = 0; i < now.length; i++) {
    g.removeWire(now[i]);
    const a = anchors[i], b = anchors[i + 1];
    let tries = [routePath(g, a, b, { maxNodes }), routePath(g, b, a, { maxNodes })?.reverse()].filter(clear);
    if (!tries.length) tries = [0, 1, 2, 3].map(d => routePath(g, a, b, { endDir: d, maxNodes })).filter(clear);
    if (tries.length) now[i] = tries.reduce((x, y) => (score(y) < score(x) ? y : x));
    g.addWire(now[i]);
  }
  now.forEach(p => g.removeWire(p));
  return cleanPath(now.flatMap((p, i) => (i ? p.slice(1) : p)));
}

// the meaning of the wires: the nets (their names, their pins and markers)
function nets(doc, modules) {
  try {
    return JSON.stringify(netlist(doc, { modules }).nets.map(n => `${n.name}: ${n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')}`).sort());
  } catch { return null; }
}

// every wire of `list` routed again from scratch (rip-up and reroute): all their pieces off the grid, their anchors kept
// on it, then routed the shortest first. Taken when every piece found a clear path and the sheet has no more bends, no
// more crossings and no more clashes, and fewer of one of them; otherwise the wires are left as they were. Returns the
// ids of the wires that changed.
function ripUp(doc, list, modules, maxNodes) {
  const s0 = wireStats(doc, { modules });
  const g = wireGrid(doc, { modules, skip: new Set(list.map(w => w.id)) });
  const jobs = [];
  for (const w of list) {
    const A = anchorsOf(doc, w);
    A.forEach(a => g.addWire([a]));
    A.slice(0, -1).forEach((a, i) => jobs.push({ w, i, a, b: A[i + 1], d: Math.abs(a.x - A[i + 1].x) + Math.abs(a.y - A[i + 1].y) }));
  }
  jobs.sort((x, y) => x.d - y.d);
  const paths = new Map(list.map(w => [w, []]));
  for (const j of jobs) {
    const p = routePath(g, j.a, j.b, { maxNodes });
    if (!p || pathViolations(g, p).length) return [];
    g.addWire(p);
    paths.get(j.w)[j.i] = p;
  }
  const old = list.map(w => w.points);
  list.forEach(w => { w.points = cleanPath(paths.get(w).flatMap((p, i) => (i ? p.slice(1) : p))); });
  const s1 = wireStats(doc, { modules });
  const n = s => Object.values(s.clashes).reduce((a, b) => a + b, 0);
  if (s1.bends <= s0.bends && s1.crossings <= s0.crossings && n(s1) <= n(s0) && (s1.bends < s0.bends || s1.crossings < s0.crossings || n(s1) < n(s0))) {
    return list.filter((w, i) => JSON.stringify(w.points) !== JSON.stringify(old[i])).map(w => w.id);
  }
  list.forEach((w, i) => { w.points = old[i]; });
  return [];
}

/**
 * Beautify: the wires of `only` (ids; null: every wire of the sheet) drawn again (the document mutated): all of them
 * routed again from scratch when that makes the sheet better, then each one in turn while one gets better. A wire
 * whose new path would change a connection is never changed: the nets are compared at the end, and if they are not the
 * same the document is left as it was. Then the wires side by side in a channel are ordered with the fewest crossings
 * and spread at an even pitch (core/schchannels.js, #1994). A rerouted wire's own curve (Curved wires, #1144) is
 * dropped: it is drawn from the new path. (channels: false, the channels as they come: to compare.) Returns { changed: [ids] }.
 */
export function beautifyWires(doc, { modules = {}, only = null, passes = 3, maxNodes = 60000, channels = true } = {}) {
  const ids = only ? new Set(only) : null;
  const before = nets(doc, modules);
  const saved = doc.wires.map(w => ({ w, points: w.points, curve: w.curve }));
  const mine = () => doc.wires.filter(w => (!ids || ids.has(w.id)) && w.points.length >= 2 && w.points.every(onGrid));
  const changed = new Set(ripUp(doc, mine(), modules, maxNodes));
  const g = wireGrid(doc, { modules });
  const taps = tapsOf(doc, modules);
  const onTap = v => v.kind === 'body' && taps.some(b => v.x > b.x && v.x < b.x + b.w && v.y > b.y && v.y < b.y + b.h);
  for (let pass = 0; pass < passes; pass++) {
    let any = false;
    // the wires with the most bends and crossings first
    const list = mine().map(w => ({ w, s: bendsOf(w.points) * 4 + crossingsOf(g, w.points) * 3 })).sort((a, b) => b.s - a.s).map(x => x.w);
    for (const w of list) {
      g.removeWire(w.points);
      const anchors = anchorsOf(doc, w), at = new Set(anchors.map(a => key(a.x, a.y)));
      // (what the path meets at its anchors is what it is attached to there: a net name)
      const clashes = p => pathViolations(g, p).filter(v => !at.has(key(v.x, v.y)) || v.kind === 'body' || v.kind === 'overlap' || v.kind === 'self');
      const old = w.points, bad = diagonal(old) || clashes(old).some(v => !onTap(v));
      const pts = reroute(g, w, anchors, maxNodes);
      let take = false;
      if (JSON.stringify(pts) !== JSON.stringify(cleanPath(old)) && !clashes(pts).length) {
        const b0 = bendsOf(old), b1 = bendsOf(pts), c0 = crossingsOf(g, old), c1 = crossingsOf(g, pts);
        take = bad || (b1 <= b0 && c1 <= c0 && (b1 < b0 || c1 < c0 || lengthOf(pts) < lengthOf(old)));
      }
      if (take) { w.points = pts; changed.add(w.id); any = true; }
      g.addWire(w.points);
    }
    if (!any) break;
  }
  const moved = () => saved.some(s => changed.has(s.w.id) && JSON.stringify(s.w.points) !== JSON.stringify(s.points));
  if (moved() && nets(doc, modules) !== before) {
    for (const s of saved) s.w.points = s.points;
    return { changed: [] };
  }
  // then the wires side by side in a channel ordered with the fewest crossings and spread evenly (#1994; not taken if
  // it changed a connection)
  const pre = doc.wires.map(w => [w, w.points]);
  const spread = !channels ? [] : spreadChannels(doc, { modules, only: new Set(mine().map(w => w.id)) });
  if (spread.length && nets(doc, modules) !== before) for (const [w, p] of pre) w.points = p;
  else spread.forEach(id => changed.add(id));
  const out = saved.filter(s => changed.has(s.w.id) && JSON.stringify(s.w.points) !== JSON.stringify(s.points));
  for (const s of out) delete s.w.curve;
  return { changed: out.map(s => s.w.id) };
}

/**
 * The wires a selection takes in for Rearrange Wires: its wires (ids), and the wires that end on a pin of its symbols or
 * on its I/O markers (ids). Returns a Set of wire ids.
 */
export function selectionWires(doc, { wires = [], symbols = [], ports = [] } = {}, modules = {}) {
  const ids = new Set(wires), at = new Set();
  for (const id of symbols) { const s = doc.symbols.find(x => x.id === id); if (s) for (const p of symbolPins(s, modules)) at.add(key(p.x, p.y)); }
  for (const id of ports) { const p = doc.ports.find(x => x.id === id); if (p) at.add(key(p.x, p.y)); }
  for (const w of doc.wires) if ([w.points[0], w.points[w.points.length - 1]].some(p => at.has(key(p.x, p.y)))) ids.add(w.id);
  return ids;
}

/** Rearrange Wires' message (the interface's and the MCP server's): `what`: the command, n: the wires drawn again. */
export const wiresNote = (what, n) => (n ? `${what}: ${n} wire${n === 1 ? '' : 's'} drawn again` : `${what}: the wires are already as clear as they can be`);
