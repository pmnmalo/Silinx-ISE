// Silinx - a routed design checked against the device: every PIP exists, every sink reached, no antenna, no node
// shared (browser + Node); the nets' source and sink nodes it walks, which the router routes too (fpga/route.js).

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
 * The routing problem of a parsed design (xdl.js parseXdl): for each net its source nodes and
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
