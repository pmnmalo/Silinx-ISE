// Silinx toolchain - the router's polish (#405: out of routeDesign in core/fpga/route.js, #662, #651): the critical
// path's connections routed again one at a time, the slowest first (on free wires, else on less critical nets'),
// whole nets of the path with their branch loads weighted by the most critical, and a lookahead; a change kept when
// the critical path ends shorter.


/** routeDesign's polish, done on its routing (belowMax(), blockUsed(), overused(), period(), sinkCrit(), stealPen(), tg():
 *  its current values; the setters write them). */
export function mountPolish(ctx) {
  const {
    BRANCH, D0, E, LOOKAHEAD, LOOK_CONNS, POLISH, POLISH_NET, STEAL_COST, STEAL_NETS, belowMax, blockUsed, connDelays,
    edgeFrom, failed, maxCrit, model, ncls, ndel, occ, overused, period, pf, ripUp, routeNet, search, sinkCrit,
    stealPen, tg, timing, trees, work, setBlockUsed, setStealPen, setBelowMax, setPeriod
  } = ctx;

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
  if (timing && POLISH && !overused() && !failed.size) {
    const connOfPin = new Map(tg().conns.map((c, k) => [`${c.toPin.inst}\u0000${c.toPin.pin}`, k]));
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
        const c = x.conn >= 0 ? sinkCrit()[x.conn] : 0;
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
      setBlockUsed(true); setStealPen(steal ? STEAL_COST : 0);
      const targets = s.targets && (steal ? s.targets : s.targets.filter(x => occ[x] === 0));
      const td = tdelOf(t);
      const path = search(t, s.node, i, pf, null, maxCrit, td, targets, BRANCH ? loadStart(i, t, td) : null);
      setStealPen(0);
      const pathNodes = path ? path.map(e => E.edgeTo[e]) : [];
      const victims = steal && path ? work.map((_, v) => v).filter(v => v !== i && trees[v] && pathNodes.some(n => trees[v].has(n))) : [];
      if (!path || (steal && (!victims.length || victims.length > STEAL_NETS))) { setBlockUsed(false); restore(snap); return null; }
      const vsnap = snapshot(victims);
      for (const v of victims) ripUp(v);
      if (s.targets) s.node = pathNodes[0];
      for (let j = path.length - 1; j >= 0; j--) { const e = path[j]; t.set(E.edgeTo[e], e); occ[E.edgeTo[e]]++; }
      let ok = true;
      for (const v of victims) if (!routeNet(v, pf)) { ok = false; break; }
      setBlockUsed(false);
      const r2 = ok ? tg().analyze(connDelays()) : null;
      if (keeps(r2, r, c, cd, force)) return r2;
      restore(vsnap); restore(snap);
      return null;
    };
    // the whole net of a connection routed again on free nodes (and its own), belowMax()
    const netAttempt = (c, r, cd, force = false) => {
      const [i] = sinkOfConn.get(c);
      const snap = snapshot([i]);
      ripUp(i);
      setBlockUsed(true); setBelowMax(true);
      const ok = routeNet(i, pf);
      setBlockUsed(false); setBelowMax(false);
      const r2 = ok ? tg().analyze(connDelays()) : null;
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
    let r = tg().analyze(connDelays());
    for (let k = 0; k < POLISH; k++) {
      const r2 = step(r) || (LOOKAHEAD ? lookahead(r) : null);
      if (!r2) break;
      r = r2; setPeriod(r2.period);
    }
  }
}
