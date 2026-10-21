// Silinx - the router: a placed XDL design in, the same design with every net's PIPs out (browser + Node).
//
// Algorithm: PathFinder (McMurchie and Ebeling, 1995), negotiated congestion. Every net is routed
// as a tree over the device's routing nodes (core/fpga/device.js), each sink found by an A* search
// from the whole tree built so far. At first nets may share nodes; after each pass the cost of a
// node that is used by more than one net goes up (present congestion, growing every pass) and
// stays higher (history), so nets negotiate who gets the contested wires until no node is shared.
//
// Special nets:
// - Global clocks (driven by a BUFGMUX): the clock pins of the slices can also be reached from
//   general routing, but a clock must use the dedicated global network (the GCLK wires of the
//   clock spine, as ISE does), so their search only uses nodes with a GCLK wire (and the one switch
//   off them into the sink: a DCM's CLKIN / CLKFB through DCM_CLKIN, #93), with general routing
//   kept as a fallback for a sink the global network cannot reach (e.g. a LUT input).
// - Carry chains: COUT -> CIN is an ordinary PIP of the CLB (COUT0 -> CIN2, or COUT_N to the
//   tile above), found like any other.
// - VCC / GND nets come from ISE with a source the converter makes up ("XDL_DUMMY_<tile>_<site>",
//   e.g. the VCC site of a tile, pin VCCOUT, or an unused slice); the site is taken from the name.
//   A VCC net without a source is tied to the nearest VCC site (VCC_PINWIRE of the tile).
// - Route-through PIPs (paths through a site: a LUT, the carry chain, a BUFGMUX) are used only out
//   of the net's own source site onto a free output pin: a carry chain whose last COUT does not go
//   to a CIN leaves the slice through YB (COUT -> YB), as ISE routes it. Through any other site they
//   would need that site configured for it, so they are never used.
// - Timing (opts.timing): PathFinder's criticality term, as in VPR's timing-driven router. Each
//   connection (driver pin -> load pin) has a criticality c (0..1) from a static timing analysis of
//   the design (core/fpga/timing.js: the delay model of the device, the logic of the slices); the
//   cost of a node for it is c x its delay + (1 - c) x its congestion cost, and the search starts
//   from the tree with each node's delay from the source, so a critical load gets a direct, fast path
//   while the others share wires. The criticalities start from the distances and are recomputed
//   from the routed delays after each pass; the most critical loads of a net are routed first.
//   A new branch off the tree loads the node it leaves (the model's branch delays: the driver's pin
//   most): the new connection pays that load and the routed connections below the node theirs, by
//   their criticalities, so a net's critical loads keep a lightly loaded path. Once the routing is legal, more passes reroute the critical nets as long as the analysis says
//   the critical path gets shorter, at a lower present factor so that a critical connection may take a
//   wire another net holds; the best legal routing is kept. Then the polish (#662): the critical path's
//   connections one at a time, each one's own branch routed again on the wires no other net uses, or on
//   less critical nets' wires, those nets routed again around it, kept when the critical path is no
//   longer (a critical connection's fast wire, an OMUX or a double next to its load, or the LUT input
//   its fast connect reaches, is often held by a net routed before it); a critical connection's whole net
//   routed again (a reset or an enable whose loads are all critical, #651); and, when stuck, a short
//   lookahead: one connection faster though another path gets longer, then the polish from there.
// - LUT inputs (opts.swapLutPins, default on): the four inputs of a LUT are interchangeable, so a
//   net may end on any input of its LUT no other net takes (as ISE's router swaps them): the one
//   its fastest or least congested path reaches; the LUT's equation is rewritten for the inputs
//   taken (not the carry's data input CY0F / CY0G, nor the pins of nets the router does not route).
// - Known switches only (opts.allowPip): the router can be restricted to the PIPs a bitstream writer
//   knows the bits of (core/fpga/bitgen.js knownRouting(db)), so the routed design can be turned
//   into a complete bitstream without Xilinx's bitgen; a sink that cannot be reached that way makes
//   its net fail (listed in `failed`), never a route through an unknown switch.

import { PIP_ROUTETHRU } from './device.js';
import { timingGraph, nodeDelays, nodeClasses, pathDelay, distanceDelay, SPEED_4 } from './timing.js';

// ------------------------------------------------------------------ the nets of a design
/** The site of an instance, or of the made-up source of a power net ("XDL_DUMMY_<tile>_<site>"). */
function siteOfInst(name, instByName, device) {
  const inst = instByName.get(name);
  if (inst) return inst.placed ? inst.site : null;
  const m = /^XDL_DUMMY_(.+)$/.exec(name);
  if (!m) return null;
  // the tile name has underscores too: try each split point
  const s = m[1];
  for (let i = s.indexOf('_'); i > 0; i = s.indexOf('_', i + 1)) {
    const tile = s.slice(0, i), site = s.slice(i + 1);
    if (device.tile(tile) !== undefined && device.site(site)) return site;
  }
  return null;
}

/**
 * The routing problem of a parsed design (core/xdl.js parseXdl): for each net its source nodes and
 * sink nodes. Problems (unplaced instances, pins the device does not have) are listed in `errors`.
 */
export function netEndpoints(design, device) {
  const instByName = new Map(design.insts.map(i => [i.name, i]));
  const nets = [], errors = [];
  const pinNode = (p, what, net) => {
    const site = siteOfInst(p.inst, instByName, device);
    if (!site) { errors.push(`net ${net.name}: ${what} ${p.inst}.${p.pin}: instance not placed or unknown`); return -1; }
    const n = device.sitePinNode(site, p.pin);
    if (n < 0) errors.push(`net ${net.name}: ${what} ${p.inst}.${p.pin}: site ${site} has no pin ${p.pin}`);
    return n;
  };
  for (const net of design.nets) {
    const sources = net.outpins.map(p => pinNode(p, 'outpin', net)).filter(n => n >= 0);
    const sourceSites = net.outpins.map(p => siteOfInst(p.inst, instByName, device)).filter(Boolean);
    const sinks = net.inpins.map(p => ({ pin: p, node: pinNode(p, 'inpin', net) })).filter(s => s.node >= 0);
    const driverTypes = net.outpins.map(p => instByName.get(p.inst)?.type);
    nets.push({
      net, name: net.name, type: net.type || 'wire', sources, sourceSites, sinks,
      clock: driverTypes.some(t => t === 'BUFGMUX' || t === 'BUFG'),
    });
  }
  return { nets, errors };
}

// ------------------------------------------------------------------ binary heap of (cost, node)
class Heap {
  constructor() { this.k = new Float64Array(1024); this.v = new Int32Array(1024); this.n = 0; }
  clear() { this.n = 0; }
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

// ------------------------------------------------------------------ the router
/** Nodes of the I/O tiles' clock wires (IOIS_CLK0-7: the clock multiplexers before the I/O registers' clock pins). */
function ioClockMask(device) {
  if (device._ioClockMask) return device._ioClockMask;
  const mask = new Uint8Array(device.nodeCount);
  const name = device.names.map(n => /^IOIS_CLK\d$/.test(n));
  for (let w = 0; w < device.wireCount; w++) {
    const k = device.wireTile[w], tp = device.templates[device.tileTemplate[k]];
    if (name[tp.wires[w - device.tileWireBase[k]]]) mask[device.nodeOf[w]] = 1;
  }
  return (device._ioClockMask = mask);
}

/** Nodes of the dedicated global clock network: nodes with a GCLK wire (CLKT_GCLK_MAIN, GCLKVC, GCLKH, the CLBs' GCLK0-7…). */
function globalClockMask(device) {
  if (device._gclkMask) return device._gclkMask;
  const mask = new Uint8Array(device.nodeCount);
  const gclkName = device.names.map(n => /GCLK/.test(n));
  for (let w = 0; w < device.wireCount; w++) {
    const k = device.wireTile[w], tp = device.templates[device.tileTemplate[k]];
    if (gclkName[tp.wires[w - device.tileWireBase[k]]]) mask[device.nodeOf[w]] = 1;
  }
  return (device._gclkMask = mask);
}

/**
 * Route a placed design. `design` is parseXdl()'s structure (its existing PIPs are ignored and
 * replaced); `device` a Device (loadDevice). Options: maxIterations (50), log (fn),
 * allowPip(tileName, from, to) (PIPs the router may use, wires in the direction of the signal;
 * default all), allowConstSource('vcc' | 'gnd', site) (sites that may be made the source of a
 * VCC / GND net without one; site: { name, tileName, type }; default all), timing (false: route
 * for wirelength and congestion only; true: timing-driven, with the delay model of
 * core/fpga/timing.js), timingPasses (4: passes after the routing is legal, for timing only), timingPf (1: the present
 * congestion factor of those passes; null: as the passes before left it), polish (300: the changes the polish of the critical path may make;
 * 0: none), stealCost (1: the cost, in units of 0.3 ns at criticality 1, of a wire of another net in
 * the polish; 0: free wires only), stealNets (8: the nets it may route again around a connection),
 * polishNet (true: the polish may route a critical connection's whole net again, #651) and lookahead
 * (16: the changes of the polish's lookahead when it is stuck, #651; 0: none), maxCriticality (0.99), model (timing.js SPEED_4), branchLoad (1: the weight of the branch loads
 * a new branch puts on the routed connections; 0: not counted), swapLutPins (true: LUT inputs may
 * be permuted; the returned design then has the LUT equations and inpins rewritten), searchCap
 * (400 000: the nodes one search from a net's tree to a sink may expand) and searchCapRetry
 * (8 000 000: a second search for a sink the first did not reach; #33: on the XC3S1200E a slice's
 * BY input reached only past 400 000, which failed EPFL priority and adder); boxMargin (3: a search
 * first stays in the net's region, the bounding box of its pins and this many tiles around it, then
 * looks anywhere; null: anywhere at once), seedAll (200) and seedCrit (0.5): the search for a sink of
 * criticality at most seedCrit from a tree of more than seedAll nodes starts from the sources and the
 * tree's nodes near the sink only (VPR's high-fanout routing; #55: much less work on large nets).
 * Returns { design (a copy with the PIPs of every routed net), routed, failed: [names],
 * unreached: [{ net, inst, pin }] (the sinks of the failed nets not reached), iterations,
 * overused (nodes still shared at the end: 0 when successful), errors, pips, timeMs,
 * period (timing: the critical path of the routing returned by the model, ns) }.
 */
export function routeDesign(design, device, opts = {}) {
  const t0 = Date.now();
  const log = opts.log || (() => {});
  const maxIter = opts.maxIterations ?? 50;
  const { nets: all, errors } = netEndpoints(design, device);
  const E = device.routingEdges();
  const N = device.nodeCount;
  const gclk = globalClockMask(device);
  const timing = !!opts.timing;
  const model = opts.model || SPEED_4;
  const ndel = timing ? nodeDelays(device, model) : null;
  const ncls = timing ? nodeClasses(device) : null;
  const BRANCH = opts.branchLoad ?? 1;
  const D0 = 0.3, H_DELAY = 0.1;     // ns per unit of congestion cost; the A* estimate's delay per tile (a little over the fastest wires': faster search)
  const maxCrit = opts.maxCriticality ?? 0.99;
  const SEARCH_CAP = opts.searchCap ?? 400000, SEARCH_CAP_RETRY = opts.searchCapRetry ?? 8000000;
  // the PIPs the router may use (opts.allowPip), decided once per edge when the search first meets it
  const allowPip = opts.allowPip || null;
  const allowed = allowPip ? new Uint8Array(E.edgeTo.length) : null;   // 0 not decided, 1 yes, 2 no
  const edgeOk = e => {
    if (!allowed) return true;
    if (!allowed[e]) { const [a, b] = device.pipWires(E.edgeTile[e], E.edgePip[e]); allowed[e] = allowPip(device.tileNames[E.edgeTile[e]], a, b) ? 1 : 2; }
    return allowed[e] === 1;
  };

  // power nets without a source (as a placer writes them): tied to made-up sources, as ISE does
  const work = [];
  const sourceless = { vcc: [], gnd: [] };
  const tied = new Set();     // the sourceless nets replaced by one net per made-up source
  for (const n of all) {
    if (!n.sinks.length) continue;
    if (!n.sources.length) {
      const kind = /^(vcc|power|vdd)$/i.test(n.type) ? 'vcc' : /^(gnd|ground)$/i.test(n.type) ? 'gnd' : null;
      if (kind) sourceless[kind].push(n); else errors.push(`net ${n.name}: no source`);
      continue;
    }
    work.push(n);
  }
  if (sourceless.vcc.length || sourceless.gnd.length) {
    const usedSites = new Set(design.insts.filter(i => i.placed).map(i => i.site));
    for (const n of all) for (const site of n.sourceSites) usedSites.add(site);   // ISE's made-up sources too
    for (const n of [...sourceless.vcc, ...sourceless.gnd]) tied.add(n.net);
    const tie = { device, usedSites, errors, allowPip, allowSource: opts.allowConstSource || null };
    work.push(...tieConstants(sourceless.vcc, 'vcc', tie), ...tieConstants(sourceless.gnd, 'gnd', tie));
  }
  // pins belong to their net: no other net may route through them
  const owner = new Int32Array(N).fill(-1);
  const isSource = new Int32Array(N);     // net index + 1 of the source pins
  work.forEach((n, i) => { for (const s of n.sources) { owner[s] = i; isSource[s] = i + 1; } for (const s of n.sinks) owner[s.node] = i; });
  // LUT inputs are interchangeable (opts.swapLutPins): a net may reach any free input of its LUT,
  // whose equation is rewritten for the inputs taken (as ISE's router swaps them)
  const lutGroups = opts.swapLutPins === false ? [] : lutPinGroups(design, work, device);
  for (const grp of lutGroups) for (const p of grp.free) owner[grp.node[p]] = -1;
  // a pin reached through one wire only (a slice's BX / BY input, from its BX / BY wire) owns that
  // wire too: another net may not pass through it (BY1 -> F1_B3), or the pin's net can be left with
  // no way in (#82: on the XC3S1200E a Y -> BY net between neighbouring slices failed at some seeds)
  for (const [entry, i] of soleEntries(E, work, owner, N)) owner[entry] = i;

  const occ = new Int32Array(N);
  const hist = new Float32Array(N);
  const trees = work.map(() => null);      // Map node -> entering edge (-1 for a source)
  const g = new Float64Array(N), stamp = new Int32Array(N), prev = new Int32Array(N), done = new Int32Array(N), tmark = new Int32Array(N);
  let curStamp = 0;
  // the polish (after the routing): a search on the nodes no other net uses (blockUsed), or on theirs too
  // at stealPen each (cost units)
  // belowMax: a new branch's load on the routed connections below its node weighted by the most critical
  // of them, not by the sum of their criticalities (the polish's whole-net move)
  let blockUsed = false, stealPen = 0, belowMax = false;
  // the from-node of each edge (the CSR keeps only edgeTo), to walk a path back
  const edgeFrom = new Int32Array(E.edgeTo.length);
  for (let n = 0; n < N; n++) edgeFrom.fill(n, E.edgeStart[n], E.edgeStart[n + 1]);
  const heap = new Heap();
  const { edgeStart, edgeTo, edgeFlags } = E, { nodeR0, nodeR1, nodeC0, nodeC1 } = device;
  const failed = new Set();
  const unreached = new Map();     // net index -> sinks not reached in its last routing

  // A* from the tree to one sink; returns the list of edges of the new branch (sink first) or null.
  // crit (timing): the criticality of the connection; a node costs crit x delay / D0 + (1 - crit) x
  // congestion, and a tree node starts at crit x its delay from the source (tdel) / D0
  // the region of the net being routed (rows, columns): its pins' bounding box and BOX_MARGIN tiles
  // around it; a search in the region leaves out nodes entirely outside it (VPR's bounding boxes)
  const BOX_MARGIN = opts.boxMargin ?? 3;
  let boxR0 = 0, boxR1 = 0, boxC0 = 0, boxC1 = 0;
  // a search from a tree of more than SEED_ALL nodes starts near the sink (sources: the net's; not
  // for the global clocks, on their own network)
  const SEED_ALL = opts.seedAll ?? 200, SEED_CRIT = opts.seedCrit ?? 0.5, SEED_REACH = Math.max(device.rows, device.cols);
  let sources = [];
  const search = (tree, sink, netIdx, pf, restrict, crit = 0, tdel = null, targets = null, start = null, cap = SEARCH_CAP, inBox = false) => {
    curStamp++;
    heap.clear();
    // equivalent pins (a LUT's inputs): any of them not yet in the tree ends the search
    if (targets) for (const t of targets) if (!tree.has(t)) tmark[t] = curStamp;
    const tr = nodeR0[sink], tc = nodeC0[sink];
    const cw = 1 - crit, dw = crit / D0, hf = 0.3 * cw + dw * H_DELAY;
    // the A* estimate: hf x the rows and columns from the node's span to the sink
    const h = m => {
      const dr = tr < nodeR0[m] ? nodeR0[m] - tr : tr > nodeR1[m] ? tr - nodeR1[m] : 0;
      const dc = tc < nodeC0[m] ? nodeC0[m] - tc : tc > nodeC1[m] ? tc - nodeC1[m] : 0;
      return hf * (dr + dc);
    };
    const seed = n => { stamp[n] = curStamp; g[n] = start ? start(n, dw) : dw && tdel ? dw * tdel.get(n) : 0; prev[n] = -1; done[n] = 0; heap.push(g[n] + h(n), n); };
    if (tree.size <= SEED_ALL || crit > SEED_CRIT || restrict) for (const n of tree.keys()) seed(n);
    else {
      // a large tree (a net of many loads): the search starts from the sources and the tree's
      // nodes near the sink (within r tiles, r doubling until there are some), not from all of it
      // (VPR's high-fanout routing); the other tree nodes may still be met on the way
      for (const s of sources) seed(s);
      for (let r = 4, found = 0; !found && r < 4 * SEED_REACH; r *= 2) {
        for (const n of tree.keys()) {
          if (stamp[n] === curStamp || nodeR1[n] < tr - r || nodeR0[n] > tr + r || nodeC1[n] < tc - r || nodeC0[n] > tc + r) continue;
          seed(n); found++;
        }
      }
    }
    let expanded = 0;
    const own = netIdx + 1;
    while (heap.n) {
      const n = heap.pop();
      if (done[n] === curStamp) continue;
      done[n] = curStamp;
      if (targets ? tmark[n] === curStamp : n === sink) {
        const path = [];
        for (let m = n; !tree.has(m); m = edgeFrom[prev[m]]) path.push(prev[m]);
        return path;
      }
      if (++expanded > cap) return null;
      const gn = g[n], fromSource = prev[n] === -1 && isSource[n] === own;
      for (let e = edgeStart[n], e1 = edgeStart[n + 1]; e < e1; e++) {
        const m = edgeTo[e];
        // a route-through (a path through a site) only out of the net's own source site, onto an
        // output pin no other net uses: the carry chain's last COUT out through YB, as ISE does;
        // never through a LUT or another site, which would need that site configured for it
        if (edgeFlags[e] & PIP_ROUTETHRU && !(fromSource && owner[m] < 0)) continue;
        if (done[m] === curStamp) continue;
        if (owner[m] >= 0 && owner[m] !== netIdx) continue;
        if (blockUsed && occ[m] > 0 && !stealPen) continue;
        // (on the clock network: its nodes, and the one switch off it into the sink, a DCM's CLKIN /
        // CLKFB through DCM_CLKIN, #93, an I/O register's clock pin through its tile's IOIS_CLKj, #671)
        if (restrict && !restrict[m] && m !== sink && !((dcmClockPin.has(sink) || ioClock[m]) && into(m, sink))) continue;
        if (inBox && (nodeR1[m] < boxR0 || nodeR0[m] > boxR1 || nodeC1[m] < boxC0 || nodeC0[m] > boxC1)) continue;
        if (allowed && allowed[e] !== 1 && !edgeOk(e)) continue;
        const over = occ[m];      // other nets on this node (this net is ripped up)
        const c = cw * (1 + hist[m]) * (1 + pf * over) + (dw ? dw * ndel[m] : 0) + (over && stealPen);
        const gm = gn + c;
        if (stamp[m] !== curStamp || gm < g[m]) {
          stamp[m] = curStamp; g[m] = gm; prev[m] = e; done[m] = 0;
          const dr = tr < nodeR0[m] ? nodeR0[m] - tr : tr > nodeR1[m] ? tr - nodeR1[m] : 0;
          const dc = tc < nodeC0[m] ? nodeC0[m] - tc : tc > nodeC1[m] ? tc - nodeC1[m] : 0;
          heap.push(gm + hf * (dr + dc), m);
        }
      }
    }
    return null;
  };
  // the DCMs' clock inputs, the I/O tiles' clock wires (IOIS_CLKj -> ICLK1 / OTCLK1…), and a node with a
  // switch straight into the sink
  const ioClock = ioClockMask(device);
  const dcmClockPin = new Set(device.sites('DCM').flatMap(d => ['CLKIN', 'CLKFB'].map(p => device.sitePinNode(d.name, p))).filter(n => n >= 0));
  const into = (m, sink) => { for (let e = edgeStart[m], e1 = edgeStart[m + 1]; e < e1; e++) if (edgeTo[e] === sink && !(edgeFlags[e] & PIP_ROUTETHRU) && (!allowed || allowed[e] === 1 || edgeOk(e))) return true; return false; };
  const ripUp = i => { if (trees[i]) for (const n of trees[i].keys()) occ[n]--; trees[i] = null; };
  const routeNet = (i, pf) => {
    const net = work[i];
    const tree = new Map();
    for (const s of net.sources) tree.set(s, -1);
    // the delay of each tree node from the source (timing)
    const tdel = timing ? new Map(net.sources.map(s => [s, 0])) : null;
    // the most critical sinks first (timing), then the nearest, so later sinks branch off a tree
    // that already spans the region
    const src = net.sources[0];
    const dist = s => Math.abs(device.nodeR0[s.node] - device.nodeR0[src]) + Math.abs(device.nodeC0[s.node] - device.nodeC0[src]);
    const critOf = s => (timing && s.conn >= 0 ? sinkCrit[s.conn] : 0);
    const sinks = [...net.sinks].sort((a, b) => critOf(b) - critOf(a) || dist(a) - dist(b));
    // timing: a new branch off a tree node loads it (the model's branch delay: model.source at the
    // driver's pin, model.branch[class] at a wire), which slows the new connection (its delay to the
    // node with the loads of the branches already there) and every routed connection below the node
    // (x their criticalities)
    let start = null;
    const kids = timing && BRANCH ? new Map() : null, below = kids ? new Map() : null;
    if (kids) {
      const srcSet = new Set(net.sources);
      const br = n => (srcSet.has(n) ? model.source : model.branch[ncls[n]]);
      start = (n, dw) => {
        let load = 0;
        for (let m = n; m >= 0; m = tree.get(m) < 0 ? -1 : edgeFrom[tree.get(m)]) { const k = kids.get(m) || 0; if (k > 1) load += br(m) * (k - 1); }
        const k = kids.get(n) || 0;
        return dw * (tdel.get(n) + load + br(n) * k) + (k ? BRANCH * br(n) * (below.get(n) || 0) / D0 : 0);
      };
    }
    let ok = true;
    unreached.delete(i);
    sources = net.sources;
    const boxed = BOX_MARGIN !== null;
    if (boxed) {
      boxR0 = Infinity; boxR1 = -Infinity; boxC0 = Infinity; boxC1 = -Infinity;
      const add = n => { boxR0 = Math.min(boxR0, nodeR0[n]); boxR1 = Math.max(boxR1, nodeR1[n]); boxC0 = Math.min(boxC0, nodeC0[n]); boxC1 = Math.max(boxC1, nodeC1[n]); };
      for (const s of net.sources) add(s);
      for (const s of net.sinks) add(s.node);
      boxR0 -= BOX_MARGIN; boxR1 += BOX_MARGIN; boxC0 -= BOX_MARGIN; boxC1 += BOX_MARGIN;
    }
    for (const s of sinks) {
      if (!s.targets && tree.has(s.node)) continue;
      let path = net.clock ? search(tree, s.node, i, pf, gclk) : null;
      // in the net's region first, then anywhere
      if (!path && boxed) path = search(tree, s.node, i, pf, null, critOf(s), tdel, s.targets, start, SEARCH_CAP, true);
      if (!path) path = search(tree, s.node, i, pf, null, critOf(s), tdel, s.targets, start);
      // a sink the bounded search did not reach (a long way round on the larger devices): once more
      // with a search that may look much further
      if (!path && SEARCH_CAP_RETRY > SEARCH_CAP) path = search(tree, s.node, i, pf, null, critOf(s), tdel, s.targets, start, SEARCH_CAP_RETRY);
      if (!path) { ok = false; unreached.set(i, [...(unreached.get(i) || []), s.pin]); continue; }
      if (s.targets) s.node = E.edgeTo[path[0]];     // the LUT input it took
      for (let j = path.length - 1; j >= 0; j--) {
        const e = path[j], m = E.edgeTo[e];
        tree.set(m, e);
        if (tdel) tdel.set(m, tdel.get(edgeFrom[e]) + ndel[m]);
      }
      if (kids) {
        const top = edgeFrom[path[path.length - 1]];
        kids.set(top, (kids.get(top) || 0) + 1);
        for (let j = path.length - 1; j > 0; j--) kids.set(E.edgeTo[path[j]], 1);
        const c = critOf(s);
        for (let m = s.node; m >= 0; m = tree.get(m) < 0 ? -1 : edgeFrom[tree.get(m)]) below.set(m, belowMax ? Math.max(below.get(m) || 0, c) : (below.get(m) || 0) + c);
      }
    }
    for (const n of tree.keys()) occ[n]++;
    trees[i] = tree;
    return ok;
  };

  // timing: each sink's connection in the timing graph, and its criticality: from the distances at
  // first, then from the routed delays after each pass (core/fpga/timing.js)
  let tg = null, sinkCrit = null, period = null, exp = 1;
  if (timing) {
    tg = timingGraph(design, model);
    for (const w of work) for (const s of w.sinks) s.conn = w.synthetic ? -1 : tg.connIndex.get(`${w.name}\u0000${s.pin.inst}\u0000${s.pin.pin}`) ?? -1;
  }
  const connDelays = () => {
    const d = new Float64Array(tg.conns.length);
    work.forEach((w, i) => {
      const tree = trees[i];
      const parent = new Map(), children = new Map();
      if (tree) for (const [n, e] of tree) { const p = e < 0 ? -1 : edgeFrom[e]; parent.set(n, p); if (p >= 0) children.set(p, (children.get(p) || 0) + 1); }
      for (const s of w.sinks) {
        if (s.conn < 0) continue;
        if (!parent.has(s.node)) { d[s.conn] = distanceDelay(w.sources[0], s.node, device, model); continue; }
        const path = [];
        for (let n = s.node; n !== -1; n = parent.get(n)) path.push(n);
        d[s.conn] = pathDelay(path.reverse(), { children }, device, model);
      }
    });
    return d;
  };
  const updateCrit = () => {
    const r = tg.analyze(connDelays());
    sinkCrit = r.crit.map(c => Math.min(maxCrit, c ** exp));
    return r.period;
  };
  if (timing) period = updateCrit();

  let iter = 0, overused = 0, pf = 0.5;
  let toRoute = work.map((_, i) => i);
  let best = null;     // timing: the best legal routing so far
  let timingPasses = timing ? opts.timingPasses ?? 4 : 0;
  const TIMING_PF = opts.timingPf === undefined ? 1 : opts.timingPf, POLISH = opts.polish ?? 300, STEAL_COST = opts.stealCost ?? 1, STEAL_NETS = opts.stealNets ?? 8;
  const POLISH_NET = opts.polishNet ?? true, LOOKAHEAD = opts.lookahead ?? 16, LOOK_CONNS = 3;
  for (iter = 1; iter <= maxIter; iter++) {
    for (const i of toRoute) { ripUp(i); if (routeNet(i, pf)) failed.delete(i); else failed.add(i); }
    // congestion: nodes used by more than one net
    overused = 0;
    const hot = new Uint8Array(N);
    for (let n = 0; n < N; n++) if (occ[n] > 1) { overused++; hot[n] = 1; hist[n] += 0.5 * (occ[n] - 1); }
    if (timing) {
      exp = Math.min(8, exp + 1);
      period = updateCrit(false);
      if (!overused && (!best || period < best.period)) best = { period, trees: trees.map(t => t && new Map(t)), nodes: work.map(w => w.sinks.map(s => s.node)), failed: new Set(failed), unreached: new Map(unreached) };
    }
    log(`iteration ${iter}: ${toRoute.length} nets routed, ${overused} nodes overused, ${failed.size} unroutable${timing ? `, critical path ${period.toFixed(3)} ns` : ''}`);
    if (!overused) {
      if (timingPasses-- <= 0) break;
      // timing only: the nets of the critical connections again, with the new criticalities
      toRoute = work.map((_, i) => i).filter(i => work[i].sinks.some(s => s.conn >= 0 && sinkCrit[s.conn] > 0.5));
      // (at a lower present factor: a critical connection may take a wire another net holds, #662)
      if (TIMING_PF !== null) pf = TIMING_PF;
      if (!toRoute.length) break;
      continue;
    }
    toRoute = [];
    work.forEach((_, i) => { if (trees[i] && [...trees[i].keys()].some(n => hot[n])) toRoute.push(i); });
    pf *= 1.6;
  }
  if (best && (overused || best.period < period)) {
    // back to the best legal routing found
    for (let i = 0; i < trees.length; i++) ripUp(i);
    best.trees.forEach((t, i) => { trees[i] = t; if (t) for (const n of t.keys()) occ[n]++; });
    best.nodes.forEach((ns, i) => work[i].sinks.forEach((s, j) => { s.node = ns[j]; }));
    failed.clear(); for (const i of best.failed) failed.add(i);
    unreached.clear(); for (const [k, v] of best.unreached) unreached.set(k, v);
    overused = 0; period = best.period;
  }
  // the polish (#662): the critical path's connections one at a time, the slowest first, each one's own
  // branch routed again on the wires no other net uses, else on less critical nets' wires (stealCost
  // each), those nets (at most stealNets) then routed again around it; a change is kept when the
  // critical path is shorter, or as long with that connection faster (paths of the same delay), until
  // no connection of the critical path gains (at most `polish` changes). Two more moves (#651): the whole net
  // of a connection of the path routed again on free nodes, with its branch loads weighted by the most
  // critical load below a node (polishNet: a reset or an enable whose loads are all critical gets a tree of
  // short branches instead of a chain of shared doubles, which no change of one load at a time improves:
  // each new branch slows the others); and, when no change gains, a lookahead (`lookahead` changes at
  // most): a connection of the path made faster though another path gets longer, then the polish from
  // there, all of it kept when the critical path ends shorter, else every net back as it was
  if (timing && POLISH && !overused && !failed.size) {
    const connOfPin = new Map(tg.conns.map((c, k) => [`${c.toPin.inst}\u0000${c.toPin.pin}`, k]));
    const sinkOfConn = new Map();
    work.forEach((w, i) => { for (const s of w.sinks) if (s.conn >= 0) sinkOfConn.set(s.conn, [i, s]); });
    // the branch of a sink no other sink of its net uses: its nodes, from the sink up to the tree
    const branchOf = (tree, node, sinkSet) => {
      const kids = new Map();
      for (const [n, e] of tree) if (e >= 0) { const q = edgeFrom[e]; kids.set(q, (kids.get(q) || 0) + 1); }
      const out = [];
      for (let n = node; ;) {
        const e = tree.get(n);
        if (e === undefined || e < 0) break;
        out.push(n);
        const q = edgeFrom[e];
        if ((kids.get(q) || 0) > 1 || sinkSet.has(q)) break;
        n = q;
      }
      return out;
    };
    const tdelOf = tree => {
      const d = new Map();
      const get = n => { if (d.has(n)) return d.get(n); const e = tree.get(n); const v = e < 0 ? 0 : get(edgeFrom[e]) + ndel[n]; d.set(n, v); return v; };
      for (const n of tree.keys()) get(n);
      return d;
    };
    // the branch loads of a net's tree for a search from it (as routeNet's, weighted by the most critical
    // load below a node): a new branch pays the loads on its way and the one it adds
    const loadStart = (i, tree, tdel) => {
      const net = work[i], srcSet = new Set(net.sources);
      const br = n => (srcSet.has(n) ? model.source : model.branch[ncls[n]]);
      const kids = new Map(), below = new Map();
      for (const e of tree.values()) if (e >= 0) kids.set(edgeFrom[e], (kids.get(edgeFrom[e]) || 0) + 1);
      for (const x of net.sinks) {
        if (!tree.has(x.node)) continue;
        const c = x.conn >= 0 ? sinkCrit[x.conn] : 0;
        for (let m = x.node; m >= 0; m = tree.get(m) < 0 ? -1 : edgeFrom[tree.get(m)]) below.set(m, Math.max(below.get(m) || 0, c));
      }
      const up = m => (tree.get(m) < 0 ? -1 : edgeFrom[tree.get(m)]);
      return (n, dw) => {
        let load = 0;
        for (let m = up(n); m >= 0; m = up(m)) { const k = kids.get(m) || 0; if (k > 1) load += br(m) * (k - 1); }
        const k = kids.get(n) || 0;
        return dw * (tdel.get(n) + load + br(n) * k) + (k ? BRANCH * br(n) * (below.get(n) || 0) / D0 : 0);
      };
    };
    // kept: the critical path shorter, or as long with connection c faster (force: c faster, the lookahead)
    const keeps = (r2, r, c, cd, force) => r2 && ((!force && r2.period < r.period - 1e-9) || ((force || r2.period <= r.period + 1e-9) && connDelays()[c] < cd[c] - 1e-6));
    const snapshot = idx => idx.map(v => ({ v, tree: trees[v], nodes: work[v].sinks.map(x => x.node) }));
    const restore = snap => {
      for (const { v } of snap) ripUp(v);
      for (const { v, tree, nodes } of snap) { trees[v] = tree; if (tree) for (const n of tree.keys()) occ[n]++; work[v].sinks.forEach((x, j) => { x.node = nodes[j]; }); }
    };
    // one connection's branch routed again on its own, on free nodes (steal: also on other nets'
    // nodes at a cost, those nets then routed again around it); the analysis if kept, else null
    const attempt = (c, r, cd, steal, force = false) => {
      const [i, s] = sinkOfConn.get(c);
      const sinkSet = new Set(work[i].sinks.filter(x => x !== s).map(x => x.node));
      const br = branchOf(trees[i], s.node, sinkSet);
      if (!br.length || [...trees[i].values()].some(e => e >= 0 && edgeFrom[e] === s.node)) return null;
      const snap = snapshot([i]);
      const t = new Map(trees[i]);
      ripUp(i);
      for (const n of br) t.delete(n);
      trees[i] = t; for (const n of t.keys()) occ[n]++;
      blockUsed = true; stealPen = steal ? STEAL_COST : 0;
      const targets = s.targets && (steal ? s.targets : s.targets.filter(x => occ[x] === 0));
      const td = tdelOf(t);
      const path = search(t, s.node, i, pf, null, maxCrit, td, targets, BRANCH ? loadStart(i, t, td) : null);
      stealPen = 0;
      const pathNodes = path ? path.map(e => E.edgeTo[e]) : [];
      const victims = steal && path ? work.map((_, v) => v).filter(v => v !== i && trees[v] && pathNodes.some(n => trees[v].has(n))) : [];
      if (!path || (steal && (!victims.length || victims.length > STEAL_NETS))) { blockUsed = false; restore(snap); return null; }
      const vsnap = snapshot(victims);
      for (const v of victims) ripUp(v);
      if (s.targets) s.node = pathNodes[0];
      for (let j = path.length - 1; j >= 0; j--) { const e = path[j]; t.set(E.edgeTo[e], e); occ[E.edgeTo[e]]++; }
      let ok = true;
      for (const v of victims) if (!routeNet(v, pf)) { ok = false; break; }
      blockUsed = false;
      const r2 = ok ? tg.analyze(connDelays()) : null;
      if (keeps(r2, r, c, cd, force)) return r2;
      restore(vsnap); restore(snap);
      return null;
    };
    // the whole net of a connection routed again on free nodes (and its own), belowMax
    const netAttempt = (c, r, cd, force = false) => {
      const [i] = sinkOfConn.get(c);
      const snap = snapshot([i]);
      ripUp(i);
      blockUsed = true; belowMax = true;
      const ok = routeNet(i, pf);
      blockUsed = false; belowMax = false;
      const r2 = ok ? tg.analyze(connDelays()) : null;
      if (keeps(r2, r, c, cd, force)) return r2;
      restore(snap);
      return null;
    };
    // the connections of an analysis's critical path, the slowest first
    const pathConns = r => {
      const worst = r.clocks.reduce((a, k) => (!a || k.period > a.period ? k : a), null);
      if (!worst) return null;
      const conns = worst.path.filter(st => st.kind === 'net').map(st => connOfPin.get(`${st.inst}\u0000${st.pin}`)).filter(c => c !== undefined && sinkOfConn.has(c));
      const cd = connDelays();
      conns.sort((a, b) => cd[b] - cd[a]);
      return { conns, cd };
    };
    // one change that gains: a branch on free nodes, on other nets' nodes, the whole net
    const step = r => {
      const p = pathConns(r);
      if (!p) return null;
      let r2 = null;
      for (const c of p.conns) if ((r2 = attempt(c, r, p.cd, false))) return r2;
      if (STEAL_COST) for (const c of p.conns) if ((r2 = attempt(c, r, p.cd, true))) return r2;
      if (POLISH_NET) for (const c of p.conns) if ((r2 = netAttempt(c, r, p.cd))) return r2;
      return null;
    };
    // the lookahead from the path's slowest connections (LOOK_CONNS): each made faster on free nodes, else
    // on other nets', whatever the critical path does, then up to LOOKAHEAD changes that gain
    const lookahead = r => {
      const p = pathConns(r);
      if (!p) return null;
      for (const c of p.conns.slice(0, LOOK_CONNS)) {
        const saved = { trees: trees.slice(), nodes: work.map(w => w.sinks.map(x => x.node)) };
        let cur = attempt(c, r, p.cd, false, true) || (STEAL_COST ? attempt(c, r, p.cd, true, true) : null);
        for (let j = 0; cur && j < LOOKAHEAD && !(cur.period < r.period - 1e-9); j++) cur = step(cur);
        if (cur && cur.period < r.period - 1e-9) return cur;
        // (every net back as it was: the trees are replaced, never changed in place)
        occ.fill(0);
        saved.trees.forEach((t, v) => { trees[v] = t; if (t) for (const n of t.keys()) occ[n]++; });
        saved.nodes.forEach((ns, v) => work[v].sinks.forEach((x, j) => { x.node = ns[j]; }));
      }
      return null;
    };
    let r = tg.analyze(connDelays());
    for (let k = 0; k < POLISH; k++) {
      const r2 = step(r) || (LOOKAHEAD ? lookahead(r) : null);
      if (!r2) break;
      r = r2; period = r2.period;
    }
  }

  // the routed design: each net's PIPs (ISE's own power nets keep their names; made-up ones are added)
  // the made-up sources are declared as instances, as ISE writes them (xdl -xdl2ncd rejects an
  // outpin on an undeclared "XDL_DUMMY_…" instance)
  const dummies = work.filter(w => w.synthetic && !design.insts.some(i => i.name === w.outpins[0].inst)).map(w => w.dummy);
  const { insts: swapped, pinOf } = applyLutSwaps(design.insts, lutGroups);
  const out = { ...design, insts: [...swapped, ...dummies], nets: [] };
  const routedBy = new Map();
  work.forEach((n, i) => routedBy.set(n.net, [...(routedBy.get(n.net) || []), i]));
  let pipCount = 0;
  const pipsOf = i => {
    const pips = [];
    for (const e of trees[i]?.values() || []) {
      if (e < 0) continue;
      const p = device.pip(E.edgeTile[e], E.edgePip[e]);
      pips.push({ tile: p.tile, from: p.from, dir: p.dir, to: p.to });
    }
    pipCount += pips.length;
    return pips;
  };
  for (const net of design.nets) {
    const idx = routedBy.get(net);
    if (!idx) { if (!tied.has(net)) out.nets.push({ ...net, pips: [] }); continue; }
    for (const i of idx) {
      const w = work[i];
      if (w.synthetic) out.nets.push({ ...net, name: w.name, outpins: w.outpins, inpins: w.sinks.map(s => s.pin), pips: pipsOf(i) });
      else out.nets.push({ ...net, inpins: net.inpins.map(p => (pinOf.has(p) ? { ...p, pin: pinOf.get(p) } : p)), pips: pipsOf(i) });
    }
  }
  return {
    design: out, routed: work.length - failed.size, failed: [...failed].map(i => work[i].name),
    unreached: [...failed].flatMap(i => (unreached.get(i) || []).map(p => ({ net: work[i].name, inst: p.inst, pin: p.pin }))),
    iterations: Math.min(iter, maxIter), overused, errors, pips: pipCount, timeMs: Date.now() - t0, period,
  };
}

/**
 * The wires that are the only way into a net's sink pin (the predecessor node of a pin with one, not
 * through a site): a Map entry node -> net index, for the pins owned by one net (owner) whose entry no
 * net owns yet; an entry two nets' pins would share is left out.
 */
function soleEntries(E, work, owner, N) {
  const { edgeStart, edgeTo, edgeFlags } = E;
  const sink = new Uint8Array(N);
  for (const w of work) for (const s of w.sinks) if (owner[s.node] >= 0) sink[s.node] = 1;
  const pred = new Map();     // sink node -> its one predecessor, or -1 for more than one
  for (let n = 0; n < N; n++) {
    for (let e = edgeStart[n], e1 = edgeStart[n + 1]; e < e1; e++) {
      const t = edgeTo[e];
      if (!sink[t] || edgeFlags[e] & PIP_ROUTETHRU) continue;
      const p = pred.get(t);
      pred.set(t, p === undefined || p === n ? n : -1);
    }
  }
  const out = new Map(), shared = new Set();
  for (const [t, p] of pred) {
    if (p < 0 || owner[p] >= 0) continue;
    if (out.has(p) && out.get(p) !== owner[t]) shared.add(p);
    out.set(p, owner[t]);
  }
  for (const p of shared) out.delete(p);
  return out;
}

// ------------------------------------------------------------------ LUT input swapping
const LUT_PIN = /^[FG][1-4]$/;
/**
 * The LUTs whose inputs the router may permute: every input pin of a LUT (F1-F4 or G1-G4 of a slice
 * whose F / G is a #LUT equation) reached by a routed net (not a clock, not a made-up power net) is
 * movable; the pins of other nets and the carry's data input (CY0F / CY0G = F1 / F2…) stay. Each
 * movable sink gets `targets` (the nodes of the LUT's movable pins) and `orig` (its pin). Returns
 * [{ inst, letter, node: { F1: node… }, fixed: Set, free: [pins], sinks }].
 */
function lutPinGroups(design, work, device) {
  const instByName = new Map(design.insts.map(i => [i.name, i]));
  const groups = new Map();
  const groupOf = (instName, pin) => {
    const key = `${instName}\u0000${pin[0]}`;
    if (groups.has(key)) return groups.get(key);
    let grp = null;
    const inst = instByName.get(instName);
    const cfg = inst && inst.placed && /^SLICE[LM]$/.test(inst.type) ? inst.cfg || [] : [];
    const lut = cfg.find(c => c.attr === pin[0]);
    if (lut && /^#LUT:/.test(lut.value)) {
      const node = {};
      for (let k = 1; k <= 4; k++) { const n = device.sitePinNode(inst.site, `${pin[0]}${k}`); if (n >= 0) node[`${pin[0]}${k}`] = n; }
      if (Object.keys(node).length > 1) {
        // (a pin the site does not have keeps its variable)
        const fixed = new Set([1, 2, 3, 4].map(k => `${pin[0]}${k}`).filter(p => !(p in node)));
        // the carry's data input (CY0F / CY0G) on pin 1 or 2: its net may take either (#25), the
        // setting follows it; on another pin it stays
        const cy = cfg.find(c => c.attr === `CY0${pin[0]}`);
        const cyPins = [`${pin[0]}1`, `${pin[0]}2`];
        let cyPin = null;
        if (cy && LUT_PIN.test(cy.value)) { if (cyPins.includes(cy.value) && cyPins.every(p => p in node)) cyPin = cy.value; else fixed.add(cy.value); }
        grp = { inst, letter: pin[0], node, fixed, sinks: [], cyPin, cySink: null };
      }
    }
    groups.set(key, grp);
    return grp;
  };
  const movable = new Set(work.filter(w => !w.synthetic && !w.clock).flatMap(w => w.sinks));
  for (const w of work) for (const s of w.sinks) {
    if (!LUT_PIN.test(s.pin.pin)) continue;
    const grp = groupOf(s.pin.inst, s.pin.pin);
    if (!grp) continue;
    if (movable.has(s) && !grp.fixed.has(s.pin.pin)) { grp.sinks.push(s); if (s.pin.pin === grp.cyPin) grp.cySink = s; } else grp.fixed.add(s.pin.pin);
  }
  // the pins of nets the router does not route (no source…) stay too
  for (const n of design.nets) for (const p of n.inpins) {
    if (!LUT_PIN.test(p.pin)) continue;
    const grp = groups.get(`${p.inst}\u0000${p.pin[0]}`);
    if (grp && !grp.sinks.some(s => s.pin === p)) grp.fixed.add(p.pin);
  }
  const out = [];
  for (const grp of groups.values()) {
    if (!grp || !grp.sinks.length) continue;
    grp.free = Object.keys(grp.node).filter(p => !grp.fixed.has(p));
    if (grp.free.length < 2) continue;
    // (the carry's data input: pin 1 or 2 only, when both are free; else it stays where it is)
    const cyPins = grp.cyPin && [`${grp.letter}1`, `${grp.letter}2`];
    if (grp.cyPin && !(grp.cySink && cyPins.every(p => !grp.fixed.has(p)))) {
      if (grp.cySink) grp.sinks = grp.sinks.filter(s => s !== grp.cySink);
      grp.fixed.add(grp.cyPin); grp.cyPin = null; grp.cySink = null;
      grp.free = Object.keys(grp.node).filter(p => !grp.fixed.has(p));
      if (grp.free.length < 2 || !grp.sinks.length) continue;
    }
    const tFree = grp.free.map(p => grp.node[p]);
    for (const s of grp.sinks) { s.targets = s === grp.cySink ? cyPins.map(p => grp.node[p]) : tFree; s.orig = s.pin.pin; }
    out.push(grp);
  }
  return out;
}

/**
 * The instances with the LUT equations rewritten for the inputs the router chose (Ak of the
 * equation is the input on pin k): returns { insts (the changed ones copied, their cfg rewritten),
 * pinOf: Map inpin -> its new pin name }.
 */
function applyLutSwaps(insts, groups) {
  const pinOf = new Map();
  const changed = new Map();   // inst -> { letter: perm (old k -> new k) }
  for (const grp of groups) {
    const pinName = n => Object.keys(grp.node).find(p => grp.node[p] === n);
    const perm = {};
    for (const s of grp.sinks) {
      const to = pinName(s.node);
      if (!to) continue;
      perm[s.orig[1]] = to[1];
      if (to !== s.orig) pinOf.set(s.pin, to);
    }
    if (!Object.entries(perm).some(([a, b]) => a !== b)) continue;
    // the other variables (fixed pins, unused inputs) onto the pins left
    for (const p of grp.fixed) perm[p[1]] = p[1];
    const left = ['1', '2', '3', '4'].filter(k => !Object.values(perm).includes(k));
    for (const k of ['1', '2', '3', '4']) if (!(k in perm)) perm[k] = left.shift();
    if (!changed.has(grp.inst)) changed.set(grp.inst, {});
    changed.get(grp.inst)[grp.letter] = perm;
    // the carry's data input follows its net (#25)
    if (grp.cyPin) changed.get(grp.inst)[`CY0${grp.letter}`] = `${grp.letter}${perm[grp.cyPin[1]]}`;
  }
  if (!changed.size) return { insts, pinOf };
  return {
    pinOf,
    insts: insts.map(inst => {
      const perms = changed.get(inst);
      if (!perms) return inst;
      const cfg = inst.cfg.map(c => (typeof perms[c.attr] === 'string' ? { ...c, value: perms[c.attr] }
        : perms[c.attr] && /^#LUT:/.test(c.value) ? { ...c, value: c.value.replace(/A([1-4])/g, (_, k) => `A${perms[c.attr][k]}`) } : c));
      const { cfgRaw, ...rest } = inst;
      return { ...rest, cfg };
    }),
  };
}

// Sources for the constant nets a placer leaves without one, the way ISE writes them in XDL:
// - VCC: a VCC site (pin VCCOUT, wire VCC_PINWIRE / IOIS_VCC_WIRE…; every CLB and I/O tile has one,
//   wired by a PIP to the pins of its tile that may need a 1): the one of the sink's own tile when it
//   reaches the sink directly, else the nearest. Source "XDL_DUMMY_<tile>_<VCC site>" VCCOUT.
// - GND: the Y output of an unused slice nearby, "XDL_DUMMY_<tile>_<slice>" Y; xdl -xdl2ncd turns
//   it into a slice whose G LUT gives 0 (ISE's own designs read back this way give the same
//   bitstream as ISE's: research/s3e-route/README.md).
// Each source is declared as an instance with ISE's configuration for it:
//   inst "XDL_DUMMY_CLB_X9Y1_SLICE_X17Y1" "SLICEL", placed CLB_X9Y1 SLICE_X17Y1, cfg "_NO_USER_LOGIC:: _GND_SOURCE::Y ";
//   inst "XDL_DUMMY_CLKB_X13Y0_VCC_X15Y0" "VCC", placed CLKB_X13Y0 VCC_X15Y0, cfg "_NO_USER_LOGIC:: _VCC_SOURCE::VCCOUT ";
// All the sourceless nets of one kind are the same signal, so they are merged and split again
// into one net per source. allowSource / allowPip (routeDesign's options): the sites that may be a
// source and the PIPs that may be used (a VCC site reaches a sink "directly" through an allowed PIP).
function tieConstants(nets, kind, { device, usedSites, errors, allowPip, allowSource }) {
  if (!nets.length) return [];
  const pin = kind === 'vcc' ? 'VCCOUT' : 'Y';
  const cands = (kind === 'vcc' ? device.sites('VCC') : [...device.sites('SLICEL'), ...device.sites('SLICEM')])
    .filter(s => !usedSites.has(s.name) && (!allowSource || allowSource(kind, s)))
    .map(s => ({ ...s, node: device.sitePinNode(s.name, pin) }))
    .filter(s => s.node >= 0);
  // the PIPs (1 or 2; 3: more) from a VCC site to a sink: a slice pin is one PIP from its tile's
  // VCC_PINWIRE; a block RAM's or multiplier's pin two, through the input wire of its interconnect
  // tile (BRAM_VCC_WIRE -> BRAM_DIB_B18 of the second interconnect tile, then BRAM_DIB_B18_INT1 ->
  // MULT18X18SIO_B6 in the site tile), so only the VCC site of the pin's own interconnect tile
  // reaches it on known switches (issue #35: the nearest by position, a tile away, did not)
  const ok = (k, i, f) => !(f & PIP_ROUTETHRU) && (!allowPip || allowPip(device.tileNames[k], ...device.pipWires(k, i)));
  const hops = (src, sink) => {
    let h = 3;
    device.forEachPip(src, (to, k, i, f) => {
      if (h === 1 || !ok(k, i, f)) return;
      if (to === sink) { h = 1; return; }
      if (h === 2) return;
      device.forEachPip(to, (to2, k2, i2, f2) => { if (to2 === sink && ok(k2, i2, f2)) h = 2; });
    });
    return h;
  };
  const groups = new Map();
  for (const n of nets) for (const s of n.sinks) {
    const r = device.nodeR0[s.node], c = device.nodeC0[s.node];
    let best = null, bd = Infinity;
    for (const v of cands) {
      let d = Math.abs(device.tileRow[v.tile] - r) + Math.abs(device.tileCol[v.tile] - c);
      // (a VCC site reaches only the pins of its own tile, or of the block-RAM site tile beside its
      // four interconnect tiles: the sites farther away are not tried)
      if (kind === 'vcc') d += [0, 0, 500, 1000][d <= 5 ? hops(v.node, s.node) : 3];
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) { errors.push(`net ${n.name}: no free site for a ${kind} source`); continue; }
    if (!groups.has(best.name)) groups.set(best.name, { site: best, net: n, sinks: [] });
    groups.get(best.name).sinks.push(s);
  }
  let k = 0;
  return [...groups.values()].map(({ site, net, sinks }) => ({
    net: net.net, name: `${nets[0].name}_${k++}`, type: kind, sources: [site.node], sinks, clock: false, synthetic: true,
    outpins: [{ inst: `XDL_DUMMY_${site.tileName}_${site.name}`, pin }],
    dummy: {
      name: `XDL_DUMMY_${site.tileName}_${site.name}`, type: site.type, placed: true, tile: site.tileName, site: site.name,
      cfg: [{ attr: '_NO_USER_LOGIC', name: '', value: '' }, { attr: kind === 'vcc' ? '_VCC_SOURCE' : '_GND_SOURCE', name: '', value: pin }],
      cfgRaw: `_NO_USER_LOGIC:: ${kind === 'vcc' ? '_VCC_SOURCE' : '_GND_SOURCE'}::${pin} `,
    },
  }));
}

// the wires of general routing (doubles, hexes, long lines): the dedicated clock paths do not enter them
const GENERAL_TO = /^([NSEW](2|6)(BEG|MID|END|[A-D])\d|L[HV]\d)/;

/**
 * The slices whose clock pin a global clock buffer reaches through the dedicated clock network
 * (GCLK nodes) and, with allowPip(tileName, from, to), only through allowed PIPs: a Set of slice site
 * names, and the clock pins of the block RAMs, multipliers and DCMs it reaches as `site.pin` (RAMB16_X0Y1.CLKA,
 * RAMB16_X0Y1.CLKB, MULT18X18_X0Y1.CLK, DCM_X0Y0.CLKIN, DCM_X0Y0.CLKFB). For the placer (place()'s clockSites option): with the
 * switches of known bits, a clock line reaches the CLK pins of only some slices of a CLB
 * (research/s3e-route/README.md), and a bottom buffer's lines not every block RAM's (#56).
 */
export function clockReach(device, bufgSite, allowPip = null) {
  const E = device.routingEdges();
  const gclk = globalClockMask(device);
  const start = device.sitePinNode(bufgSite, 'O');
  const seen = new Uint8Array(device.nodeCount), reached = new Set();
  if (start < 0) return new Set();
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const n = q.pop();
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
      const m = E.edgeTo[e];
      if (seen[m] || E.edgeFlags[e] & PIP_ROUTETHRU) continue;
      const [from, to] = device.pipWires(E.edgeTile[e], E.edgePip[e]);
      // (not into general routing: a node of the clock network may hold a general wire's switch, as
      // the side clock tiles' CLKL_GCLKH_MAINk -> IOIS_Xk -> N6BEG0 does, #95)
      if (GENERAL_TO.test(to)) continue;
      if (allowPip && !allowPip(device.tileNames[E.edgeTile[e]], from, to)) continue;
      seen[m] = 1;
      if (gclk[m]) q.push(m); else reached.add(m);   // off the clock network: an end (a site pin)
    }
  }
  const out = new Set();
  for (const s of [...device.sites('SLICEL'), ...device.sites('SLICEM')]) if (reached.has(device.sitePinNode(s.name, 'CLK'))) out.add(s.name);
  // a block RAM's / multiplier's clock pin: one switch further, in its site tile (BRAM_CLK2_INT1 -> RAMB16_CLKA)
  const beyond = new Set();
  for (const n of reached) {
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
      if (E.edgeFlags[e] & PIP_ROUTETHRU) continue;
      if (allowPip && !allowPip(device.tileNames[E.edgeTile[e]], ...device.pipWires(E.edgeTile[e], E.edgePip[e]))) continue;
      beyond.add(E.edgeTo[e]);
    }
  }
  // (and a DCM's clock inputs, CLKIN / CLKFB: a cascade, the feedback, #47)
  for (const [type, pins] of [['RAMB16', ['CLKA', 'CLKB']], ['MULT18X18SIO', ['CLK']], ['DCM', ['CLKIN', 'CLKFB']]]) {
    for (const s of device.sites(type)) for (const p of pins) {
      const n = device.sitePinNode(s.name, p);
      if (reached.has(n) || beyond.has(n)) out.add(`${s.name}.${p}`);
    }
  }
  return out;
}

/**
 * The global clock buffers (BUFGMUX site names) whose I0 an output pin of a site (a DCM's CLK0,
 * CLKFX…) reaches through the device's dedicated paths: PIPs (with allowPip: allowed ones only, no
 * route-throughs) not entering general routing, for the placer (place()'s bufgSites option).
 */
export function bufgReach(device, siteName, pin, allowPip = null, [toType, toPin] = ['BUFGMUX', 'I0']) {
  const E = device.routingEdges();
  const start = device.sitePinNode(siteName, pin);
  if (start < 0) return [];
  const targets = new Map(device.sites(toType).map(s => [device.sitePinNode(s.name, toPin), s.name]));
  const seen = new Uint8Array(device.nodeCount), out = [];
  const q = [start];
  seen[start] = 1;
  for (let steps = 0; q.length && steps < 20000; steps++) {
    const n = q.shift();
    if (targets.has(n)) { out.push(targets.get(n)); continue; }
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
      const m = E.edgeTo[e];
      if (seen[m] || E.edgeFlags[e] & PIP_ROUTETHRU) continue;
      const [from, to] = device.pipWires(E.edgeTile[e], E.edgePip[e]);
      // the dedicated clock paths only (DCM outputs, the clock tiles' wires): not into general routing
      if (GENERAL_TO.test(to)) continue;
      if (allowPip && !allowPip(device.tileNames[E.edgeTile[e]], from, to)) continue;
      seen[m] = 1;
      q.push(m);
    }
  }
  return out;
}

// ------------------------------------------------------------------ checking a routed design
/**
 * Check the routing of a design against the device: every PIP exists, every sink is reached from
 * a source through the net's PIPs, no PIP hangs off the tree (antenna), no node is used by two nets.
 * Returns { ok, nets: count, problems: [strings] }.
 */
export function checkRouting(design, device) {
  const { nets, errors } = netEndpoints(design, device);
  const problems = [...errors];
  const usedBy = new Map();
  for (const n of nets) {
    const pips = n.net.pips;
    if (!n.sinks.length && !pips.length) continue;
    // the net's graph: from-node -> to-nodes (a bidirectional PIP either way: its text does not say)
    const adj = new Map(), nodes = new Set();
    const edge = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); nodes.add(a); nodes.add(b); };
    for (const p of pips) {
      const k = device.tile(p.tile);
      const i = k === undefined ? -1 : device.findPip(k, p.from, p.to);
      if (i < 0) { problems.push(`net ${n.name}: no PIP ${p.tile} ${p.from} ${p.dir} ${p.to}`); continue; }
      const [a, b] = device.pipNodes(k, i);
      edge(a, b);
      if (device.pipIsBidi(k, i)) edge(b, a);
    }
    // walk from the sources; a node of the net reached by the walk but leading to nothing new is an antenna
    const reached = new Set(n.sources), q = [...n.sources], children = new Map();
    while (q.length) {
      const a = q.pop();
      for (const b of adj.get(a) || []) if (!reached.has(b)) { reached.add(b); q.push(b); children.set(a, (children.get(a) || 0) + 1); }
    }
    for (const s of n.sinks) if (!reached.has(s.node)) problems.push(`net ${n.name}: sink ${s.pin.inst}.${s.pin.pin} not reached`);
    const sinkSet = new Set(n.sinks.map(s => s.node));
    for (const a of nodes) {
      if (!reached.has(a)) problems.push(`net ${n.name}: ${device.nodeName(a)} not connected to the source`);
      else if (!children.get(a) && !sinkSet.has(a)) problems.push(`net ${n.name}: ${device.nodeName(a)} leads nowhere (antenna)`);
    }
    for (const a of nodes) {
      const o = usedBy.get(a);
      if (o !== undefined && o !== n.name) problems.push(`node ${device.nodeName(a)} used by ${o} and ${n.name}`);
      else usedBy.set(a, n.name);
    }
  }
  return { ok: problems.length === 0, nets: nets.length, problems };
}
