// Silinx - placement and routing of a schematic made from HDL (#405: out of schdoc.js): the symbols and I/O markers
// laid out by layers (or by the graph layout given), then the wires routed square between their pins, around the
// symbols (a path that came out overlapping routed again, core/schpath.js, #948). schdoc.js re-exports what it exported. Isomorphic ES module: no DOM and no Node APIs.
import {
  SIDE_V, joinWires, key, netlist, onSeg, portBox, r10, snap, symbolBox, symbolDef, symbolPins
} from './schdoc.js';
import { segPoints, untangleWires, wireGrid } from './schpath.js';

// ===================================================================== placement & routing
function epPos(doc, ep, modules, cache) {
  if (ep.port) { const p = doc.ports.find(q => q.id === ep.port); return { x: p.x, y: p.y, side: p.dir === 'in' ? 'E' : 'W' }; }
  const s = doc.symbols.find(q => q.id === ep.sym);
  let pins = cache.get(s.id);
  if (!pins) cache.set(s.id, pins = symbolPins(s, modules));
  const p = pins.find(q => q.name === ep.pin);
  return p ? { x: p.x, y: p.y, side: p.side } : { x: s.x, y: s.y, side: 'W' };
}

// Merge the segments of one net into a clean set of polylines split at junctions.
export function mergeNetWires(polys) {
  const H = new Map(), Vv = new Map();
  const pts = new Set();
  const addPt = (x, y) => pts.add(key(x, y));
  for (const P of polys) {
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      if (a.y === b.y) { let l = H.get(a.y); if (!l) H.set(a.y, l = []); l.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]); }
      else if (a.x === b.x) { let l = Vv.get(a.x); if (!l) Vv.set(a.x, l = []); l.push([Math.min(a.y, b.y), Math.max(a.y, b.y)]); }
      addPt(a.x, a.y); addPt(b.x, b.y);
    }
  }
  const merge = l => { l.sort((p, q) => p[0] - q[0]); const out = []; for (const iv of l) { const last = out[out.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else out.push([...iv]); } return out; };
  const pieces = [];   // [a, b]
  const allPts = [...pts].map(k => k.split(',').map(Number));
  for (const [y, l] of H) for (const [x0, x1] of merge(l)) {
    const cuts = [...new Set([x0, x1, ...allPts.filter(([x, yy]) => yy === y && x > x0 && x < x1).map(([x]) => x)])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) pieces.push([{ x: cuts[i], y }, { x: cuts[i + 1], y }]);
  }
  for (const [x, l] of Vv) for (const [y0, y1] of merge(l)) {
    const cuts = [...new Set([y0, y1, ...allPts.filter(([xx, y]) => xx === x && y > y0 && y < y1).map(([, y]) => y)])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) pieces.push([{ x, y: cuts[i] }, { x, y: cuts[i + 1] }]);
  }
  // also cut horizontal pieces at vertical piece end points and vice versa (T junctions)
  // join pieces through degree-2 vertices into polylines
  const adj = new Map();
  pieces.forEach((pc, i) => { for (const p of pc) { const k = key(p.x, p.y); let a = adj.get(k); if (!a) adj.set(k, a = []); a.push(i); } });
  const usedP = new Set();
  const out = [];
  const walk = (i, from) => {
    const line = [from];
    let cur = i, at = from;
    for (;;) {
      usedP.add(cur);
      const pc = pieces[cur];
      const nxt = pc[0].x === at.x && pc[0].y === at.y ? pc[1] : pc[0];
      line.push(nxt);
      const a = adj.get(key(nxt.x, nxt.y));
      if (a.length !== 2) break;
      const other = a.find(j => j !== cur);
      if (usedP.has(other)) break;
      cur = other; at = nxt;
    }
    return line;
  };
  for (const [k, a] of adj) if (a.length !== 2) for (const i of a) if (!usedP.has(i)) { const [x, y] = k.split(',').map(Number); out.push(walk(i, { x, y })); }
  for (let i = 0; i < pieces.length; i++) if (!usedP.has(i)) out.push(walk(i, pieces[i][0]));
  // drop collinear interior points
  return out.map(line => line.filter((p, i) => {
    if (i === 0 || i === line.length - 1) return true;
    const a = line[i - 1], b = line[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  }));
}

function orthoRoute(start, bends, end) {
  const pts = [start];
  let prev = start;
  const raw = [start, ...bends, end];
  for (let i = 1; i < raw.length - 1; i++) {
    const o = raw[i], op = raw[i - 1];
    const horiz = Math.abs(o.y - op.y) < Math.abs(o.x - op.x);
    const q = horiz ? { x: snap(o.x), y: prev.y } : { x: prev.x, y: snap(o.y) };
    pts.push(q); prev = q;
  }
  // final approach
  const last = pts[pts.length - 1];
  if (last.x !== end.x && last.y !== end.y) {
    const n = raw.length;
    const lastHoriz = n >= 2 && Math.abs(raw[n - 1].y - raw[n - 2].y) < Math.abs(raw[n - 1].x - raw[n - 2].x);
    if (lastHoriz) {
      if (pts.length > 1) { const q = pts[pts.length - 1]; const pq = pts[pts.length - 2]; if (pq.x === q.x) q.y = end.y; else pts.push({ x: q.x, y: end.y }); }
      else pts.push({ x: last.x, y: end.y });
    } else pts.push({ x: end.x, y: last.y });
  }
  pts.push(end);
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l.x !== p.x || l.y !== p.y) out.push({ ...p }); }
  // fix any remaining diagonal
  const fixed = [out[0]];
  for (let i = 1; i < out.length; i++) { const a = fixed[fixed.length - 1], b = out[i]; if (a.x !== b.x && a.y !== b.y) fixed.push({ x: b.x, y: a.y }); fixed.push(b); }
  return fixed;
}

export async function placeAndRoute(doc, conns, { layout, modules, nk }) {
  const portW = p => portBox(p).w;
  let done = false;
  if (typeof layout === 'function' && (doc.symbols.length + doc.ports.length) > 0) {
    try {
      const SIDE = { W: 'WEST', E: 'EAST', N: 'NORTH', S: 'SOUTH' };
      const children = doc.symbols.map(s => {
        const def = symbolDef(s, modules);
        return {
          id: s.id, width: def.w, height: def.h,
          layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
          ports: def.pins.map(p => ({ id: `${s.id}\u0001${p.name}`, x: p.x, y: p.y, width: 0, height: 0, layoutOptions: { 'elk.port.side': SIDE[p.side] } })),
        };
      });
      for (const p of doc.ports) {
        const w = portW(p);
        children.push({
          id: p.id, width: w, height: 20,
          layoutOptions: { 'elk.portConstraints': 'FIXED_POS', 'elk.layered.layering.layerConstraint': p.dir === 'in' ? 'FIRST' : 'LAST' },
          ports: [{ id: `${p.id}\u0001p`, x: p.dir === 'in' ? w : 0, y: 10, width: 0, height: 0, layoutOptions: { 'elk.port.side': p.dir === 'in' ? 'EAST' : 'WEST' } }],
        });
      }
      const pid = ep => (ep.port ? `${ep.port}\u0001p` : `${ep.sym}\u0001${ep.pin}`);
      const edges = [];
      conns.forEach((n, k) => {
        const src = n.drivers[0] || n.eps[0];
        n.eps.filter(e => e !== src).forEach((e, j) => edges.push({ id: `e${k}_${j}`, sources: [pid(src)], targets: [pid(e)], _net: k }));
      });
      const graph = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
          'elk.spacing.nodeNode': '40', 'elk.layered.spacing.nodeNodeBetweenLayers': '70',
          'elk.spacing.edgeEdge': '20', 'elk.spacing.edgeNode': '20',
          'elk.layered.spacing.edgeEdgeBetweenLayers': '20', 'elk.layered.spacing.edgeNodeBetweenLayers': '20',
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          'elk.layered.unnecessaryBendpoints': 'false', 'elk.padding': '[top=60,left=60,bottom=60,right=60]',
          'elk.separateConnectedComponents': 'false',
          // large graphs (technology schematics: hundreds of LUTs / flip-flops): cheaper placement
          ...(children.length > 100 || edges.length > 500 ? {
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.layered.thoroughness': '1',
            'elk.layered.crossingMinimization.greedySwitch.type': 'OFF', 'elk.layered.considerModelOrder.strategy': 'NONE',
          } : {}),
        },
        children, edges: edges.map(({ _net, ...e }) => e),
      };
      const res = await layout(graph);
      const pos = new Map((res.children || []).map(c => [c.id, c]));
      for (const s of doc.symbols) { const c = pos.get(s.id); if (c) { s.x = snap(c.x); s.y = snap(c.y); } }
      for (const p of doc.ports) { const c = pos.get(p.id); if (c) { p.x = snap(c.x + (p.dir === 'in' ? portW(p) : 0)); p.y = snap(c.y + 10); } }
      const cache = new Map();
      const resEdges = new Map((res.edges || []).map(e => [e.id, e]));
      const perNet = new Map();
      for (const e of edges) {
        const r = resEdges.get(e.id);
        const n = conns[e._net];
        const src = n.drivers[0] || n.eps[0];
        const dst = n.eps.filter(x => x !== src)[+e.id.split('_')[1]];
        const a = epPos(doc, src, modules, cache), b = epPos(doc, dst, modules, cache);
        const sec = r?.sections?.[0];
        const bends = sec ? (sec.bendPoints || []) : [{ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }];
        const poly = orthoRoute({ x: a.x, y: a.y }, bends, { x: b.x, y: b.y });
        let l = perNet.get(e._net); if (!l) perNet.set(e._net, l = []); l.push(poly);
      }
      const wires = [], labels = [];
      const netWires = [];   // [net, its wire ids]
      const labelAt = [];    // [{ L: the wire's points from the driver, ids: its net's wires, net }]
      perNet.forEach((polys, k) => {
        const n = conns[k];
        const lines = mergeNetWires(polys);
        const ids = new Set();
        for (const pts of lines) { ids.add(`W${wires.length + 1}`); wires.push({ id: `W${wires.length + 1}`, points: pts, ...(n.width > 1 ? { bus: true } : {}) }); }
        netWires.push([n, ids]);
        if (!n.name.startsWith('__n') && !n.eps.some(e => e.port)) {
          const src = n.drivers[0] || n.eps[0];
          const a = epPos(doc, src, modules, cache);
          // put the label on the wire that starts at the driver pin, a little away from it (where, once all the
          // wires are drawn: on no other net's wire, #948)
          const w0 = lines.find(L => (L[0].x === a.x && L[0].y === a.y) || (L[L.length - 1].x === a.x && L[L.length - 1].y === a.y)) || lines[0];
          if (w0) labelAt.push({ L: w0[0].x === a.x && w0[0].y === a.y ? w0 : w0.slice().reverse(), ids, net: n.name });
        }
      });
      labels.push(...netLabels(doc, wires, labelAt, modules));
      doc.wires = wires; doc.labels = labels;
      // each net's wires joined where they branch and at its pins (#678)
      for (const [n, ids] of netWires) joinWires(doc, n.eps.map(e => epPos(doc, e, modules, cache)), ids);
      // a path snapped onto another wire, over a pin or through a body routed again around them (#948)
      untangleWires(doc, { modules });
      done = true;
      // verify connectivity; fall back to labelled stubs for nets that came out wrong
      const bad = verifyImport(doc, conns, modules, nk);
      if (bad.size) {
        stubNets(doc, conns, bad, modules);
        if (verifyImport(doc, conns, modules, nk).size) stubNets(doc, conns, new Set(conns.map((_, k) => k)), modules);
      }
    } catch (e) {
      done = false;
    }
  }
  if (!done) {
    columnLayout(doc, conns, modules);
    stubNets(doc, conns, new Set(conns.map((_, k) => k)), modules);
  }
  // sheet size
  let mx = 0, my = 0;
  for (const s of doc.symbols) { const b = symbolBox(s, modules); mx = Math.max(mx, b.x + b.w); my = Math.max(my, b.y + b.h); }
  for (const p of doc.ports) { const b = portBox(p); mx = Math.max(mx, b.x + b.w); my = Math.max(my, b.y + b.h); }
  for (const w of doc.wires) for (const p of w.points) { mx = Math.max(mx, p.x); my = Math.max(my, p.y); }
  doc.sheet = { w: Math.max(1700, r10(mx + 120)), h: Math.max(1100, r10(my + 120)) };
}

/**
 * The net names of a drawing made from HDL, one per entry of labelAt ({ L: the wire's points from the driver, ids: its
 * net's wire ids, net }), in that order: each on the first point of L at least 20 away from the driver that is on no
 * other net's wire, end or bend, no pin or marker and no net name placed before (else the first such point, else L's
 * third point). One grid of all the wires, a net's own taken out while its name is placed (#2970: a grid built for
 * each name made the time grow as the names times the wires).
 */
export function netLabels(doc, wires, labelAt, modules) {
  const labels = [];
  const g = wireGrid({ symbols: doc.symbols, ports: doc.ports, labels: [], wires }, { modules });
  const byId = new Map(wires.map(w => [w.id, w]));
  for (const { L, ids, net } of labelAt) {
    const own = [...ids].map(id => byId.get(id)).filter(Boolean);
    for (const w of own) g.removeWire(w.points);
    const pts = [];
    for (let i = 0; i + 1 < L.length; i++) for (const q of segPoints(L[i], L[i + 1])) if (!pts.some(p => p.x === q.x && p.y === q.y)) pts.push(q);
    const free = pts.slice(1).filter(q => { const k = key(q.x, q.y); return !g.h.has(k) && !g.v.has(k) && !g.vtx.has(k) && !g.labels.has(k) && !g.fixed.has(k); });
    const q = free.find(p => Math.abs(p.x - L[0].x) + Math.abs(p.y - L[0].y) >= 20) || free[0] || pts[Math.min(2, pts.length - 1)];
    for (const w of own) g.addWire(w.points);
    labels.push({ id: `L${labels.length + 1}`, x: q.x, y: q.y, net });
    g.labels.set(key(q.x, q.y), (g.labels.get(key(q.x, q.y)) || 0) + 1);
  }
  return labels;
}

function verifyImport(doc, conns, modules, nk) {
  const nl = netlist(doc, { modules });
  const bad = new Set();
  const owner = new Map();
  conns.forEach((n, k) => {
    const nets = new Set(n.eps.map(e => (e.port ? nl.portNet.get(e.port) : nl.pinNet.get(`${e.sym}/${e.pin}`))));
    if (nets.size !== 1 || nets.has(undefined)) bad.add(k);
    // a named net must keep its name (#225: a signal with a single pin, e.g. an instance's output
    // read by a task only, has no wire: without a label it would be an anonymous net, the signal
    // left undriven)
    else if (!n.name.startsWith('__n') && [...nets][0].auto) bad.add(k);
    for (const x of nets) if (x) { if (owner.has(x) && owner.get(x) !== k) { bad.add(k); bad.add(owner.get(x)); } else owner.set(x, k); }
  });
  return bad;
}

// replace the wires of the given nets by short stubs with net-name labels
function stubNets(doc, conns, which, modules) {
  const cache = new Map();
  if (which.size >= conns.length) { doc.wires = []; doc.labels = []; }
  else {
    const nl = netlist(doc, { modules });
    const badNetObjs = new Set();
    for (const k of which) for (const e of conns[k].eps) { const n = e.port ? nl.portNet.get(e.port) : nl.pinNet.get(`${e.sym}/${e.pin}`); if (n) badNetObjs.add(n); }
    doc.wires = doc.wires.filter(w => !badNetObjs.has(nl.wireNet.get(w.id)));
    doc.labels = doc.labels.filter(l => !badNetObjs.has(nl.labelNet.get(l.id)));
  }
  // occupancy: pins, marker points and existing wire geometry
  const pinPts = new Set();
  for (const s of doc.symbols) for (const p of symbolPins(s, modules)) pinPts.add(key(p.x, p.y));
  for (const p of doc.ports) pinPts.add(key(p.x, p.y));
  const segs = [];
  const endPts = new Set();
  for (const w of doc.wires) { for (let i = 0; i + 1 < w.points.length; i++) segs.push([w.points[i], w.points[i + 1]]); for (const p of w.points) endPts.add(key(p.x, p.y)); }
  const free = (a, b) => {
    if (pinPts.has(key(b.x, b.y)) || endPts.has(key(b.x, b.y))) return false;
    for (const [p, q] of segs) if (onSeg(b, p, q) || onSeg(a, p, q) && !(a.x === p.x && a.y === p.y) && !(a.x === q.x && a.y === q.y)) return false;
    // nothing else may touch the stub
    for (const k of [...pinPts, ...endPts]) {
      if (k === key(a.x, a.y)) continue;
      const [x, y] = k.split(',').map(Number);
      if (onSeg({ x, y }, a, b)) return false;
    }
    return true;
  };
  let wk = doc.wires.reduce((m, w) => Math.max(m, +String(w.id).replace(/\D/g, '') || 0), 0);
  let lk = doc.labels.reduce((m, l) => Math.max(m, +String(l.id).replace(/\D/g, '') || 0), 0);
  const taken = new Set(conns.map(c => c.name));
  for (const k of [...which].sort((a, b) => a - b)) {
    const n = conns[k];
    if (n.name.startsWith('__n')) { let j = 1; while (taken.has(`n_${j}`)) j++; n.name = `n_${j}`; taken.add(n.name); }
    for (const e of n.eps) {
      const p = epPos(doc, e, modules, cache);
      const [dx, dy] = SIDE_V[p.side] || [-1, 0];
      let q = null;
      for (const len of [30, 40, 20, 50, 60, 70, 80, 100]) {
        const c = { x: p.x + dx * len, y: p.y + dy * len };
        if (free(p, c)) { q = c; break; }
      }
      if (!q) q = { x: p.x + dx * 30, y: p.y + dy * 30 };
      doc.wires.push({ id: `W${++wk}`, points: [{ x: p.x, y: p.y }, q], ...(n.width > 1 ? { bus: true } : {}) });
      segs.push([{ x: p.x, y: p.y }, q]); endPts.add(key(q.x, q.y)); endPts.add(key(p.x, p.y));
      if (!e.port || nk2(doc, e.port) !== n.name) doc.labels.push({ id: `L${++lk}`, x: q.x, y: q.y, net: n.name });
    }
  }
}
function nk2(doc, portId) { return doc.ports.find(p => p.id === portId)?.name; }

function columnLayout(doc, conns, modules) {
  // longest-path layering from drivers to sinks
  const succ = new Map(), pred = new Map();
  const nodeOf = ep => (ep.port ? ep.port : ep.sym);
  for (const n of conns) {
    const src = n.drivers[0];
    if (!src) continue;
    for (const e of n.eps) if (e !== src && nodeOf(e) !== nodeOf(src)) {
      const a = nodeOf(src), b = nodeOf(e);
      if (!succ.has(a)) succ.set(a, new Set()); succ.get(a).add(b);
      if (!pred.has(b)) pred.set(b, new Set()); pred.get(b).add(a);
    }
  }
  const layer = new Map();
  const ids = [...doc.ports.filter(p => p.dir === 'in').map(p => p.id), ...doc.symbols.map(s => s.id)];
  for (const id of ids) layer.set(id, 0);
  for (let it = 0; it < ids.length + 2; it++) {
    let changed = false;
    for (const [a, bs] of succ) for (const b of bs) {
      const la = layer.get(a) ?? 0;
      if (doc.ports.some(p => p.id === b)) continue;
      if ((layer.get(b) ?? 0) < la + 1 && la + 1 <= ids.length) { layer.set(b, la + 1); changed = true; }
    }
    if (!changed) break;
  }
  // cycles may push layers up; compress
  const used = [...new Set(doc.symbols.map(s => layer.get(s.id) ?? 0))].sort((a, b) => a - b);
  const remap = new Map(used.map((l, i) => [l, i + 1]));
  const cols = [];
  for (const s of doc.symbols) { const c = remap.get(layer.get(s.id) ?? 0); (cols[c] ||= []).push(s); }
  let x = 60;
  const inPorts = doc.ports.filter(p => p.dir === 'in'), outPorts = doc.ports.filter(p => p.dir !== 'in');
  const inW = Math.max(60, ...inPorts.map(p => portBox(p).w));
  let y = 60;
  for (const p of inPorts) { p.x = x + inW; p.y = y; y += 60; }
  x += inW + 160;
  for (let c = 1; c < cols.length; c++) {
    const col = cols[c] || [];
    let cy = 60, cw = 0;
    for (const s of col) { const def = symbolDef(s, modules); s.x = snap(x); s.y = snap(cy); cy += def.h + 60; cw = Math.max(cw, def.w); }
    x += cw + 200;
  }
  y = 60;
  for (const p of outPorts) { p.x = snap(x); p.y = y; y += 60; }
}
