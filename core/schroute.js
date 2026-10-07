// Schematic wire routing after moving symbols: the wires attached to moved pins are re-routed on
// the grid (orthogonal, few bends) so that every connection is kept and no new one is made.
//
// Connectivity in a schematic is geometric (core/schdoc.js netlist): a wire vertex on a pin / port /
// another wire vertex connects, and so does a wire end on another wire's segment. A route is
// therefore not allowed to bend on, end on, or run along anything of another net, nor to pass over
// a pin, an I/O marker, a net label or another wire's vertex; it may cross another wire at a right
// angle (crossings do not connect). Symbol bodies are avoided.
//
// Isomorphic module (browser + Node).

import { GRID, symbolBox, symbolPins, portBox, netlist } from './schdoc.js';

const K = (x, y) => `${x},${y}`;

/** Grid points of the segment a-b (orthogonal segments only), including both ends. */
function segPoints(a, b) {
  const out = [];
  if (a.x === b.x) { const s = Math.sign(b.y - a.y) || 1; for (let y = a.y; ; y += s * GRID) { out.push({ x: a.x, y }); if (y === b.y) break; } }
  else if (a.y === b.y) { const s = Math.sign(b.x - a.x) || 1; for (let x = a.x; ; x += s * GRID) { out.push({ x, y: a.y }); if (x === b.x) break; } }
  return out;
}

function onSeg(p, a, b) {
  if (a.x === b.x && p.x === a.x) return p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y && p.y === a.y) return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  return false;
}

/** Minimal binary heap keyed by f. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

const DIRS = [[GRID, 0], [-GRID, 0], [0, GRID], [0, -GRID]];   // 0,1 horizontal; 2,3 vertical

/**
 * Obstacles of a document, without the wires in `skipWires`.
 * point: Map key -> 'block' (never touch) | 'h' | 'v' | 'hv' (wire segments: may only be crossed)
 */
function obstacles(doc, modules, skipWires) {
  const pt = new Map();
  const block = (x, y) => pt.set(K(x, y), 'block');
  const mark = (x, y, o) => { const k = K(x, y), c = pt.get(k); if (c === 'block') return; pt.set(k, !c ? o : c === o ? o : 'hv'); };
  const bodies = [];
  for (const s of doc.symbols) {
    bodies.push(symbolBox(s, modules));
    for (const p of symbolPins(s, modules)) block(p.x, p.y);
  }
  for (const p of doc.ports) { block(p.x, p.y); bodies.push(portBox(p)); }
  for (const l of doc.labels) block(l.x, l.y);
  for (const w of doc.wires) {
    if (skipWires.has(w.id)) continue;
    w.points.forEach(p => block(p.x, p.y));
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const o = a.y === b.y ? 'h' : a.x === b.x ? 'v' : null;
      if (!o) continue;   // diagonal wires: their vertices are blocked above
      for (const q of segPoints(a, b)) mark(q.x, q.y, o);
    }
  }
  return { pt, bodies };
}

const inBody = (bodies, x, y) => bodies.some(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);

/**
 * A* orthogonal route from S to T avoiding obstacles. Returns the polyline (corner points) or null.
 */
function astar(S, T, obs, bounds, { bendCost = 4, crossCost = 2, maxNodes = 250000 } = {}) {
  const start = K(S.x, S.y), goal = K(T.x, T.y);
  const free = (x, y, dir, bending) => {
    if (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1) return false;
    const k = K(x, y);
    if (k === goal) return true;
    if (k === start) return false;
    if (inBody(obs.bodies, x, y)) return false;
    const c = obs.pt.get(k);
    if (!c) return true;
    if (c === 'block' || c === 'hv' || bending) return false;
    return (c === 'h') !== (dir < 2);   // crossing a perpendicular wire only
  };
  const h = (x, y) => Math.abs(x - T.x) + Math.abs(y - T.y);
  const best = new Map();
  const heap = new Heap();
  heap.push({ x: S.x, y: S.y, d: -1, g: 0, f: h(S.x, S.y), prev: null });
  let n = 0;
  while (heap.size && n++ < maxNodes) {
    const cur = heap.pop();
    if (cur.x === T.x && cur.y === T.y) {
      const pts = [];
      for (let c = cur; c; c = c.prev) pts.push({ x: c.x, y: c.y });
      pts.reverse();
      // keep the corners only
      return pts.filter((p, i) => i === 0 || i === pts.length - 1 || !((pts[i - 1].x === p.x && p.x === pts[i + 1].x) || (pts[i - 1].y === p.y && p.y === pts[i + 1].y)));
    }
    const sk = `${cur.x},${cur.y},${cur.d}`;
    if (best.has(sk) && best.get(sk) < cur.g) continue;
    // a corner at the current point must be legal (a free point, not on any wire)
    for (let d = 0; d < 4; d++) {
      if (cur.d >= 0 && (d ^ 1) === cur.d) continue;              // no U-turn
      const turning = cur.d >= 0 && d !== cur.d;
      if (turning && !(cur.x === S.x && cur.y === S.y)) {
        const c = obs.pt.get(K(cur.x, cur.y));
        if (c) continue;                                            // never bend on another wire
      }
      const nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
      if (!free(nx, ny, d, false)) continue;
      const crossing = obs.pt.has(K(nx, ny)) && K(nx, ny) !== goal;
      const g = cur.g + 1 + (turning ? bendCost : 0) + (crossing ? crossCost : 0);
      const k = `${nx},${ny},${d}`;
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      heap.push({ x: nx, y: ny, d, g, f: g + h(nx, ny) / GRID, prev: cur });
    }
  }
  return null;
}

/** Remove repeated and collinear points. */
function clean(pts) {
  const out = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (l && l.x === p.x && l.y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = l;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

/**
 * Connectivity signature of a document: the groups of connected pins/markers (stable ids).
 */
export function connectivity(doc, modules = {}) {
  const nl = netlist(doc, { modules });
  return nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' '))
    .filter(s => s.includes(' ')).sort();
}

/**
 * Re-route wires after a move.
 * @param {object} doc       the document after the move (wires already stretched; mutated)
 * @param {object} orig      { wires } before the move
 * @param {Array}  attached  [{ id, a, b }] wires whose start (a) / end (b) was on a moved point
 * @param {number} dx, dy    the move
 * @returns {{ rerouted: number, failed: string[] }}
 */
export function rerouteAfterMove(doc, { orig, attached, dx, dy, modules = {} }) {
  const skip = new Set(attached.filter(at => !(at.a && at.b)).map(at => at.id));
  const obs = obstacles(doc, modules, skip);
  // routing area: everything on the sheet plus a margin
  const xs = [], ys = [];
  for (const b of obs.bodies) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); }
  for (const w of doc.wires) for (const p of w.points) { xs.push(p.x); ys.push(p.y); }
  const M = 30 * GRID;
  const bounds = { x0: Math.min(...xs) - M, x1: Math.max(...xs) + M, y0: Math.min(...ys) - M, y1: Math.max(...ys) + M };
  const failed = [];
  let rerouted = 0;
  // anchors: points on a wire that something else is attached to (other wire ends, labels, markers)
  const anchorPts = [];
  for (const w of doc.wires) if (!skip.has(w.id)) anchorPts.push(w.points[0], w.points[w.points.length - 1]);
  for (const l of doc.labels) anchorPts.push({ x: l.x, y: l.y });
  for (const p of doc.ports) anchorPts.push({ x: p.x, y: p.y });
  for (const at of attached) {
    if (at.a && at.b) continue;   // moved as a whole
    const w = doc.wires.find(x => x.id === at.id), w0 = orig.wires.find(x => x.id === at.id);
    if (!w || !w0) continue;
    let pts0 = w0.points.map(p => ({ ...p }));
    if (at.b) pts0.reverse();                                  // pts0[0] is the moved end
    const S = { x: pts0[0].x + dx, y: pts0[0].y + dy };
    // keep the original wire from the first anchor on, re-route up to it
    let cut = pts0.length - 1, T = pts0[pts0.length - 1];
    outer: for (let i = 0; i + 1 < pts0.length; i++) {
      for (const q of segPoints(pts0[i], pts0[i + 1])) {
        if (q.x === pts0[0].x && q.y === pts0[0].y) continue;
        if (anchorPts.some(p => p.x === q.x && p.y === q.y) || (i + 1 === pts0.length - 1 && q.x === pts0[i + 1].x && q.y === pts0[i + 1].y)) { cut = i; T = q; break outer; }
      }
    }
    const tail = [T, ...pts0.slice(cut + 1)];
    // the tail stays: the route must not run over it either
    const route = astar(S, T, obs, bounds);
    if (!route) { failed.push(w.id); continue; }
    let pts = clean([...route, ...tail.slice(1)]);
    if (at.b) pts = pts.reverse();
    w.points = pts;
    rerouted++;
    // the new wire is an obstacle for the next ones
    pts.forEach(p => obs.pt.set(K(p.x, p.y), 'block'));
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], o = a.y === b.y ? 'h' : 'v';
      for (const q of segPoints(a, b)) { const k = K(q.x, q.y), c = obs.pt.get(k); if (c !== 'block') obs.pt.set(k, !c ? o : c === o ? o : 'hv'); }
    }
  }
  return { rerouted, failed };
}

/**
 * Do the pins/markers of the moved items touch something they were not attached to (another
 * wire's vertex or segment, another pin or marker)? Used to nudge a dropped component.
 * moved: { symIds:Set, portIds:Set }, attachedIds: Set of wire ids stretched with the move.
 */
export function placementClashes(doc, { moved, attachedIds = new Set(), modules = {} }) {
  const pts = [];
  for (const s of doc.symbols) if (moved.symIds.has(s.id)) pts.push(...symbolPins(s, modules));
  for (const p of doc.ports) if (moved.portIds.has(p.id)) pts.push(p);
  const own = new Set(pts.map(p => K(p.x, p.y)));
  let n = 0;
  for (const p of pts) {
    for (const w of doc.wires) {
      if (attachedIds.has(w.id)) continue;
      if (w.points.some((q, i) => (q.x === p.x && q.y === p.y) || (i + 1 < w.points.length && onSeg(p, q, w.points[i + 1])))) n++;
    }
    for (const s of doc.symbols) if (!moved.symIds.has(s.id)) for (const q of symbolPins(s, modules)) if (q.x === p.x && q.y === p.y) n++;
    // a pin inside another component's body cannot be wired
    for (const s of doc.symbols) if (!moved.symIds.has(s.id)) { const b = symbolBox(s, modules); if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) n++; }
    for (const q of doc.ports) if (!moved.portIds.has(q.id) && q.x === p.x && q.y === p.y && !own.has(K(q.x, q.y))) n++;
  }
  // moved bodies covering wire points (vertices, or the far ends of the stretched wires)
  const covered = [];
  for (const w of doc.wires) {
    if (attachedIds.has(w.id)) covered.push(w.points[0], w.points[w.points.length - 1]);
    else covered.push(...w.points);
  }
  for (const s of doc.symbols) {
    if (!moved.symIds.has(s.id)) continue;
    const b = symbolBox(s, modules);
    for (const q of covered) if (q.x > b.x && q.x < b.x + b.w && q.y > b.y && q.y < b.y + b.h) n++;
  }
  // moved bodies overlapping other bodies
  const boxes = doc.symbols.map(s => ({ s, b: symbolBox(s, modules) }));
  for (const { s, b } of boxes) {
    if (!moved.symIds.has(s.id)) continue;
    for (const o of boxes) if (!moved.symIds.has(o.s.id) && b.x < o.b.x + o.b.w && o.b.x < b.x + b.w && b.y < o.b.y + o.b.h && o.b.y < b.y + b.h) n++;
  }
  return n;
}
