// Silinx - the Spartan-6 router's LUT input swapping (#1152), as the Spartan-3E router's (fpga/route.js swapLutPins)
// and ISE's router: the inputs of a LUT position (A1 … A6 of a slice's A … D) are interchangeable, so a net may end on
// any pin of its position no other net takes, the one its path reaches best; the position's equations (O6 and O5: one
// permutation of the pins for both) are rewritten for the pins taken (routedXdlS6). Not swapped: a position that is
// not #LUT equations (a RAM, a shift register, a route-through), A6 under an O5 (high), the pins of the nets the router
// does not move (a clock's, a dedicated path's, a power net's: a constant input) or does not route (Browser + Node).

const LUT_PIN = /^([A-D])([1-6])$/;

/**
 * The LUT positions whose inputs the router may permute: [{ inst, letter, node: { A1: node … }, fixed: Set of pins,
 * free: [pins], sinks }]; each movable sink gets `targets` (the nodes of its position's free pins) and `orig` (its
 * pin). work: routeS6's nets (netEndpointsS6's).
 */
export function lutSwapGroups(design, device, work) {
  const instByName = new Map(design.insts.map(i => [i.name, i]));
  const groups = new Map();
  const groupOf = (instName, p) => {
    const key = `${instName}\u0000${p}`;
    if (groups.has(key)) return groups.get(key);
    let grp = null;
    const inst = instByName.get(instName), cfg = inst?.placed && /^SLICE[XLM]$/.test(inst.type) ? inst.cfg || [] : [];
    const value = a => { const v = cfg.find(c => c.attr === a)?.value; return v && v !== '#OFF' ? v : null; };
    const o6 = value(`${p}6LUT`), o5 = value(`${p}5LUT`);
    if (o6?.startsWith('#LUT:') && (o5 === null || o5.startsWith('#LUT:')) && !value(`${p}6RAMMODE`) && !value(`${p}5RAMMODE`)
      && !cfg.some(c => c.attr === '_ROUTETHROUGH' && c.name.startsWith(p))) {
      const node = {};
      for (let k = 1; k <= 6; k++) { const n = device.sitePinNode(inst.site, `${p}${k}`); if (n >= 0) node[`${p}${k}`] = n; }
      grp = { inst, letter: p, node, fixed: new Set(o5 !== null || /A6\+~A6/.test(o6) ? [`${p}6`] : []), sinks: [] };
    }
    groups.set(key, grp);
    return grp;
  };
  for (const w of work) {
    const movable = !w.power && !w.clock && !w.dedicated;
    for (const s of w.sinks) {
      const m = LUT_PIN.exec(s.pin.pin), grp = m && groupOf(s.pin.inst, m[1]);
      if (!grp) continue;
      if (movable) grp.sinks.push(s); else grp.fixed.add(s.pin.pin);
    }
  }
  // the pins of the nets the router does not route stay too
  for (const n of design.nets) for (const p of n.inpins) {
    const m = LUT_PIN.exec(p.pin), grp = m && groups.get(`${p.inst}\u0000${m[1]}`);
    if (grp && !grp.sinks.some(s => s.pin === p)) grp.fixed.add(p.pin);
  }
  const out = [];
  for (const grp of groups.values()) {
    if (!grp || !grp.sinks.length) continue;
    grp.sinks = grp.sinks.filter(s => !grp.fixed.has(s.pin.pin));
    grp.free = Object.keys(grp.node).filter(p => !grp.fixed.has(p));
    if (grp.free.length < 2 || !grp.sinks.length) continue;
    const targets = grp.free.map(p => grp.node[p]);
    for (const s of grp.sinks) { s.targets = targets; s.orig = s.pin.pin; }
    out.push(grp);
  }
  return out;
}

/**
 * The instances with their LUT equations rewritten for the pins the router took (Ak of an equation is the input on
 * pin k): { insts (the changed ones copied), pinOf: Map inpin -> its new pin name }.
 */
export function applyLutSwapsS6(insts, groups = []) {
  const pinOf = new Map(), changed = new Map();   // inst -> { letter: perm (old k -> new k) }
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
    const ks = ['1', '2', '3', '4', '5', '6'], left = ks.filter(k => !Object.values(perm).includes(k));
    for (const k of ks) if (!(k in perm)) perm[k] = left.shift();
    (changed.get(grp.inst) ?? changed.set(grp.inst, {}).get(grp.inst))[grp.letter] = perm;
  }
  if (!changed.size) return { insts, pinOf };
  return {
    pinOf,
    insts: insts.map(inst => {
      const perms = changed.get(inst);
      if (!perms) return inst;
      const cfg = inst.cfg.map(c => {
        const perm = /^[A-D][56]LUT$/.test(c.attr) && perms[c.attr[0]];
        return perm && /^#LUT:/.test(c.value) ? { ...c, value: c.value.replace(/A([1-6])/g, (_, k) => `A${perm[k]}`) } : c;
      });
      const { cfgRaw, ...rest } = inst;
      return { ...rest, cfg };
    }),
  };
}
