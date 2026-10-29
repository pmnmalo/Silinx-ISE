// Silinx - the Spartan-6 router (#730; the plan: research/s6/README.md, #1): a placed design (fpga/s6/xdl.js
// placedXdlS6) routed on the device's routing graph (packages/silinx-fpga/devices/xc6slx*.json.gz) (browser + Node).
//
// PathFinder (McMurchie and Ebeling, 1995), negotiated congestion, as the Spartan-3E router (fpga/route.js):
// every net a tree over the routing nodes, each sink found by an A* search from the whole tree built so far; nodes
// shared by several nets cost more after each pass (present congestion, growing) and keep a history, until no node
// is shared. A node costs 1 plus a tenth of its span in tiles (a quad costs more than a single but goes further),
// the search is led by the distance to the sink. The Spartan-6's special nets and paths:
// - Global clocks (from a BUFGMUX) run on the global network only (the spines, the BUFH of the clock regions, the
//   HCLK rows and the switch boxes' GCLK wires into CLK0 / CLK1), never on the general interconnect; a sink the
//   network does not reach (a LUT input) is then routed as any other, with a warning.
// - A pad into its global buffer takes the dedicated clock path (no general interconnect); failing that, general
//   routing, with a warning (the placer warns already when the pad is not a GCLK pin).
// - The power nets (no source in the placed design) are routed from the TIEOFFs (HARD1 for vcc, HARD0 for gnd) of
//   the switch boxes near their sinks, a net per TIEOFF as ISE writes them (GLOBAL_LOGIC1_<k>, the TIEOFF an
//   XDL_DUMMY instance).
// - Route-through PIPs (a path through a site): through the I/O logic (ILOGIC2, OLOGIC2) and a clock region's BUFH,
//   unused by the design, one net each (an XDL_DUMMY instance each, as ISE); through a slice only out of the net's
//   own source, the carry's COUT to DMUX when DMUX is free (through a LUT in use it would be a second input of the
//   LUT: ISE's PhysDesignRules:2066). No other.
// - Known switches only (opts.allowPip(tile, pip)): for a bitstream writer that knows only some PIPs' bits (#726). A
//   sink no allowed switch reaches is found once (its search sees every node it may reach) and not searched again;
//   the passes end when nothing is shared and only such sinks are left (failedSinks' dead, #732).
//
//   const r = routeS6(design, device, { maxPasses, allowPip, log })
//     r = { trees: [Map node -> edge (-1 a source)] by net, nets (netEndpointsS6's), failed: [net names], warnings,
//           stats: { passes, seconds, overused, pips } }
//   routedXdlS6(design, device, r) -> the routed design for writeXdl (xdl.js)
import { PIP_ROUTETHRU } from '../device.js';
import { routingResources, netEndpointsS6, powerSources, routeThruSite, FREE_ROUTETHRU } from './route-nets.js';
import { mountRoutedS6 } from './route-output.js';

export class RouteError extends Error {}

// a binary heap of (cost, node)
class Heap {
  constructor() { this.k = new Float64Array(1024); this.v = new Int32Array(1024); this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) { const k = new Float64Array(this.n * 2); k.set(this.k); this.k = k; const v = new Int32Array(this.n * 2); v.set(this.v); this.v = v; }
    let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const top = this.v[0], key = this.k[--this.n], val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return top;
  }
}

/** Route a placed design (see above). Options: maxPasses (50), allowPip(tile, pip) (null: every PIP), log. */
export function routeS6(design, device, { maxPasses = 50, allowPip = null, log = null } = {}) {
  const t0 = Date.now();
  const res = routingResources(device);
  const { nets, errors, used } = netEndpointsS6(design, device, res);
  if (errors.length) throw new RouteError(`route: ${errors.join('; ')}`);
  const E = device.routingEdges();
  // the output pins each site drives in the design
  const siteOf = new Map(design.insts.filter(i => i.placed).map(i => [i.name, i.site]));
  const drivenAt = new Map();
  for (const n of design.nets) for (const p of n.outpins) { const st = siteOf.get(p.inst); if (st) (drivenAt.get(st) || drivenAt.set(st, new Set()).get(st)).add(p.pin); }
  const N = device.nodeCount;
  const warnings = [];
  // the route-through sites: a resource each, after the nodes
  const rtIndex = new Map();
  const rtOf = new Int32Array(E.edgeTo.length).fill(-1);   // edge -> route-through site resource (filled on demand)
  const rtSiteName = [];
  const resourceOfRt = e => {
    let r = rtOf[e];
    if (r >= 0) return r;
    const s = routeThruSite(device, res, E.edgeTile[e], E.edgePip[e]);
    if (s === null) return -1;
    if (!rtIndex.has(s)) { rtIndex.set(s, N + rtSiteName.length); rtSiteName.push(s); }
    return (rtOf[e] = rtIndex.get(s));
  };
  const M = N + 4096;   // nodes and route-through sites
  const occ = new Int16Array(M), hist = new Float32Array(M);
  const base = new Float32Array(N);
  for (let n = 0; n < N; n++) base[n] = 1 + 0.1 * ((device.nodeR1[n] - device.nodeR0[n]) + (device.nodeC1[n] - device.nodeC0[n]));
  // may net `w` take edge e? (route-throughs as above; known switches; the clock's and the dedicated paths' nodes)
  const edgeOk = (w, e, restrict) => {
    if (allowPip && !allowPip(E.edgeTile[e], E.edgePip[e])) return false;
    if (restrict && res.general[E.edgeTo[e]] && !w.sinkSet.has(E.edgeTo[e])) return false;
    if (!(E.edgeFlags[e] & PIP_ROUTETHRU)) return true;
    const s = routeThruSite(device, res, E.edgeTile[e], E.edgePip[e]);
    if (s === null) return false;
    const rt = res.rtPins[device.templates[device.tileTemplate[E.edgeTile[e]]].rt[E.edgePip[e]]];
    // (out of its own slice: the carry out to DMUX only, when the slice drives nothing else by DMUX; through a LUT
    // in use it would be a second input of that LUT, PhysDesignRules:2066)
    if (s === w.sourceSite) return !!rt && rt.from === 'COUT' && rt.to === 'DMUX' && !drivenAt.get(s)?.has('DMUX');
    return !!rt && FREE_ROUTETHRU.has(rt.type) && !used.has(s);
  };

  // ---- the work: each net with its sinks; a power net's sinks with their TIEOFF sources
  const work = nets.map(w => ({ ...w, sinkSet: new Set(w.sinks.map(s => s.node)), srcFor: null }));
  for (const w of work) {
    if (!w.power) continue;
    w.srcFor = w.sinks.map(s => powerSources(device, res, s.node, w.power, 4).map(t => t.node).filter(n => n >= 0));
    w.tieoffOf = new Map();
    for (const s of w.sinks) for (const t of powerSources(device, res, s.node, w.power, 4)) w.tieoffOf.set(t.node, t);
  }
  const trees = work.map(() => new Map());   // node -> edge into it (-1: a source)
  const rtUsed = work.map(() => new Map());  // route-through resource -> count of the net's edges through it
  let pf = 0.5;
  const nodeCost = (n, w) => {
    const over = occ[n] + 1 - 1;
    return (base[n] + hist[n]) * (1 + pf * (over > 0 ? over : 0));
  };
  const rtCost = r => { const over = occ[r]; return (1 + hist[r]) * (1 + pf * (over > 0 ? over : 0)); };
  const dist = (n, t) => {
    const r = (device.nodeR0[t] + device.nodeR1[t]) / 2, c = (device.nodeC0[t] + device.nodeC1[t]) / 2;
    const dr = r < device.nodeR0[n] ? device.nodeR0[n] - r : r > device.nodeR1[n] ? r - device.nodeR1[n] : 0;
    const dc = c < device.nodeC0[n] ? device.nodeC0[n] - c : c > device.nodeC1[n] ? c - device.nodeC1[n] : 0;
    return dr + dc;
  };
  const addTree = (wi, n, k) => { occ[n] += k; };
  const ripUp = wi => {
    for (const n of trees[wi].keys()) occ[n]--;
    for (const [r, c] of rtUsed[wi]) if (c > 0) occ[r]--;
    trees[wi] = new Map(); rtUsed[wi] = new Map();
  };
  // the A* search of one sink from the net's tree (and, a power net, from the sink's TIEOFFs)
  const g = new Float64Array(N).fill(Infinity), via = new Int32Array(N), touched = [];
  const heap = new Heap();
  // (exhausted: the last search found no path having seen every node it may reach, not stopped at its limit)
  let exhausted = false;
  const search = (wi, sink, starts, restrict) => {
    const w = work[wi], tree = trees[wi];
    heap.n = 0;
    for (const n of touched) g[n] = Infinity;
    touched.length = 0;
    for (const n of starts) { g[n] = 0; via[n] = -1; touched.push(n); heap.push(0.6 * dist(n, sink), n); }
    let pops = 0;
    exhausted = false;
    while (heap.n) {
      const n = heap.pop();
      if (n === sink) break;
      if (++pops > 2000000) return null;
      const gn = g[n];
      for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
        const m = E.edgeTo[e];
        if (tree.has(m) || !edgeOk(w, e, restrict)) continue;
        // (a sink pin node is a dead end but for this sink)
        let c = gn + nodeCost(m, w);
        if (E.edgeFlags[e] & PIP_ROUTETHRU) { const r = resourceOfRt(e); if (r >= 0 && !(rtUsed[wi].get(r) > 0)) c += rtCost(r); }
        if (c < g[m]) { if (g[m] === Infinity) touched.push(m); g[m] = c; via[m] = e; heap.push(c + 0.6 * dist(m, sink), m); }
      }
    }
    if (g[sink] === Infinity) { exhausted = true; return null; }
    // the path back to the tree (or a start)
    const path = [];
    for (let n = sink; via[n] !== -1 && !tree.has(n); ) { path.push(via[n]); n = fromOf(via[n]); }
    return path;
  };
  // the node an edge leaves (the edges are stored by their from-node: a binary search of edgeStart)
  const fromOf = e => {
    let lo = 0, hi = N - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (E.edgeStart[mid] <= e) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const routeNet = wi => {
    const w = work[wi], tree = trees[wi];
    const failed = [];
    if (!w.power) for (const s of w.sources) if (!tree.has(s)) { tree.set(s, -1); addTree(wi, s, 1); }
    // the sinks nearest the tree first
    const order = w.sinks.map((s, k) => k).sort((a, b) => dist(w.sources[0] ?? w.sinks[a].node, w.sinks[a].node) - dist(w.sources[0] ?? w.sinks[b].node, w.sinks[b].node));
    for (const k of order) {
      const s = w.sinks[k];
      if (tree.has(s.node)) continue;
      // (a sink no path reaches on the switches allowed: not searched again, #732; the congestion changes the costs,
      // not which switches there are)
      if (unreachable.has(`${wi} ${k}`)) { failed.push(s); continue; }
      let starts = [...tree.keys()];
      if (w.power) starts = [...starts, ...w.srcFor[k].filter(n => !tree.has(n))];
      let path = search(wi, s.node, starts, w.clock || w.dedicated);
      if (!path && (w.clock || w.dedicated)) {
        path = search(wi, s.node, starts, false);
        if (path && !w.warned) {
          w.warned = true;
          warnings.push(w.clock ? `net ${w.name}: the global clock reaches ${s.pin.inst}.${s.pin.pin} through general routing (not a clock pin)` : `net ${w.name}: the pad reaches its global buffer through general routing (not a GCLK pin)`);
        }
      }
      if (!path) { if (exhausted) unreachable.add(`${wi} ${k}`); failed.push(s); continue; }
      // the path's start: a node of the tree, or (a power net) a TIEOFF, a new root
      for (let j = path.length - 1; j >= 0; j--) {
        const e = path[j], m = E.edgeTo[e], from = fromOf(e);
        if (!tree.has(from)) { tree.set(from, -1); addTree(wi, from, 1); }
        if (!tree.has(m)) { tree.set(m, e); addTree(wi, m, 1); }
        if (E.edgeFlags[e] & PIP_ROUTETHRU) {
          const r = resourceOfRt(e);
          if (r >= 0) { const c = rtUsed[wi].get(r) || 0; if (!c) occ[r]++; rtUsed[wi].set(r, c + 1); }
        }
      }
    }
    return failed;
  };

  // ---- the passes
  let passes = 0, failedSinks = [];
  const incomplete = new Uint8Array(work.length), unreachable = new Set();
  const overused = () => { let k = 0; for (let n = 0; n < M; n++) if (occ[n] > 1) k++; return k; };
  for (; passes < maxPasses; ) {
    passes++;
    failedSinks = [];
    for (let wi = 0; wi < work.length; wi++) {
      // (from the second pass: only the nets on shared nodes are routed again)
      if (passes > 1 && !incomplete[wi] && ![...trees[wi].keys(), ...rtUsed[wi].keys()].some(n => occ[n] > 1)) continue;
      ripUp(wi);
      const f = routeNet(wi);
      incomplete[wi] = f.length > 0;
      for (const s of f) failedSinks.push({ net: work[wi].name, sink: s, dead: unreachable.has(`${wi} ${work[wi].sinks.indexOf(s)}`) });
    }
    const over = overused();
    if (log) log(`pass ${passes}: ${over} shared nodes, ${failedSinks.length} sinks not reached`);
    // (done when no node is shared and every sink left out has no path at all: more passes would not reach it)
    if (!over && failedSinks.every(f => f.dead)) break;
    for (let n = 0; n < M; n++) if (occ[n] > 1) hist[n] += 0.5 * (occ[n] - 1);
    pf *= 1.8;
  }
  const over = overused();
  if (over) warnings.push(`${over} routing nodes shared after ${passes} passes`);
  const failed = [...new Set(failedSinks.map(f => f.net))];
  const r = { trees, work, failed, failedSinks, warnings, rtSiteName, E, fromOf,
    stats: { passes, seconds: (Date.now() - t0) / 1000, overused: over, pips: 0 } };
  for (const t of trees) for (const e of t.values()) if (e >= 0) r.stats.pips++;
  return r;
}

/** The routed design (for writeXdl): every net's PIPs, the power nets one per TIEOFF, the XDL_DUMMY instances. */
export function routedXdlS6(design, device, r) {
  return mountRoutedS6({ design, device, r, res: routingResources(device) });
}
