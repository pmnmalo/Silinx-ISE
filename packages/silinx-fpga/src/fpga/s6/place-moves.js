// Silinx - the Spartan-6 placer's moves (#729, core/fpga/s6/place.js): a move proposed (an object to a site in the
// window, swapping with what is there when that fits), its change of cost applied and measured, kept or undone.
import { sliceFits } from './place.js';

/** { propose, delta, commit, revert } of placeS6. */
export function mountMovesS6(ctx) {
  const {
    insts, objs, objOf, movable, site, owner, setAt, slices, padOf, bramSite, bramFree, bramSites, dspBy,
    chainSites, needOf, ri, rlim, bankOk, bankAdd, netsOf, netCost, netCostOf, connsOf, cW, cD, cdelay,
    lambda, bb, bbNorm, tc, tcNorm, setBb, setTc,
  } = ctx;
  let move = null;      // [[inst, new site]]
  let pending = null;   // the move applied, not yet kept: { old: [[inst, site]], nets, netNew, conns, connNew, dbb, dtc }

  // a slice site near (x, y) within the window: SLICE_X(x ± 2r)Y(y ± r)
  const near = (s, r) => {
    const x = s.x + ri(4 * r + 1) - 2 * r, y = s.y + ri(2 * r + 1) - r;
    return slices.get(`SLICE_X${x}Y${y}`) || null;
  };
  const singleAt = name => { const j = owner.get(name); return j === undefined ? -1 : objs[objOf[j]].kind === 'slice' ? j : -2; };

  const proposeSlice = o => {
    const i = o.members[0], here = slices.get(site[i]), to = near(here, Math.max(1, Math.round(rlim())));
    if (!to || to.name === here.name || !sliceFits(needOf(insts[i]), to.kind)) return false;
    const j = singleAt(to.name);
    if (j === -2) return false;
    if (j >= 0 && !sliceFits(needOf(insts[j]), here.kind)) return false;
    move = j >= 0 ? [[i, to.name], [j, here.name]] : [[i, to.name]];
    return true;
  };
  const proposeChain = o => {
    const n = o.members.length, here = site[o.members[0]];
    let base;
    if (o.dsp) {
      const all = [...dspBy.keys()];
      base = all[ri(all.length)];
    } else {
      const to = near(slices.get(here), Math.max(1, Math.round(rlim())));
      base = to?.name;
    }
    if (!base || base === here) return false;
    const ss = chainSites(base, n, o.next);
    if (!ss) return false;
    const old = o.members.map(m => site[m]), mine = new Set(old);
    const displaced = [];
    for (let k = 0; k < n; k++) {
      if (!o.dsp && !sliceFits(needOf(insts[o.members[k]]), slices.get(ss[k]).kind)) return false;
      const j = owner.get(ss[k]);
      if (j === undefined || mine.has(ss[k])) continue;
      if (o.dsp) { if (objs[objOf[j]].members.length > 1) return false; displaced.push(j); continue; }
      if (objs[objOf[j]].kind !== 'slice') return false;
      displaced.push(j);
    }
    // the displaced singles to the chain's old sites that the new ones leave free
    const newSet = new Set(ss), freed = old.filter(s => !newSet.has(s));
    if (displaced.length > freed.length) return false;
    move = o.members.map((m, k) => [m, ss[k]]);
    for (let k = 0; k < displaced.length; k++) {
      if (!o.dsp && !sliceFits(needOf(insts[displaced[k]]), slices.get(freed[k]).kind)) return false;
      move.push([displaced[k], freed[k]]);
    }
    return true;
  };
  const proposeBram = o => {
    const i = o.members[0], type = insts[i].type, all = bramSites(type), to = all[ri(all.length)];
    if (to === site[i]) return false;
    const j = owner.get(to);
    if (j !== undefined) { if (insts[j].type !== type) return false; move = [[i, to], [j, site[i]]]; return true; }
    // (a RAMB8 beside its own tile's other half: free once it leaves)
    owner.delete(site[i]);
    const ok = bramFree(bramSite.get(to), type, to);
    owner.set(site[i], i);
    if (!ok) return false;
    move = [[i, to]];
    return true;
  };
  const proposeIob = o => {
    const i = o.members[0], all = [...padOf.values()], to = all[ri(all.length)];
    if (to.name === site[i]) return false;
    const j = owner.get(to.name), here = padOf.get(site[i]);
    const v = ctxV(i);
    if (j !== undefined) {
      if (objs[objOf[j]].kind !== 'iob' || objs[objOf[j]].fixed || ctxV(j) !== v) return false;
      move = [[i, to.name], [j, here.name]];
      return true;
    }
    bankAdd(here, v, -1);
    const ok = bankOk(to, v);
    bankAdd(here, v, 1);
    if (!ok) return false;
    move = [[i, to.name]];
    return true;
  };
  const ctxV = i => ctx.vccoOfIob(insts[i]);

  /** Propose a move (false: none this time). Undoes a move measured and not kept. */
  function propose() {
    revert();
    const o = movable[ri(movable.length)];
    move = null;
    return o.kind === 'slice' ? proposeSlice(o) : o.kind === 'chain' ? proposeChain(o) : o.kind === 'bram' ? proposeBram(o) : proposeIob(o);
  }
  // the move's instances on their new sites (owners cleared first: swaps)
  const apply = m => {
    for (const [i] of m) if (owner.get(site[i]) === i) owner.delete(site[i]);
    for (const [i, s] of m) {
      if (insts[i].kind === 'iob') { const p = padOf.get(site[i]); if (p) ctx.bankAdd(p, ctxV(i), -1); }
      site[i] = null; setAt(i, s);
      if (insts[i].kind === 'iob') ctx.bankAdd(padOf.get(s), ctxV(i), 1);
    }
  };
  /** Apply the move proposed and return its change of cost (normalised, mixed by lambda). */
  function delta() {
    const old = move.map(([i]) => [i, site[i]]);
    apply(move);
    const nets = new Set(), conns = new Set();
    for (const [i] of move) { for (const k of netsOf[i]) nets.add(k); for (const k of connsOf[i]) conns.add(k); }
    const netNew = new Map(), connNew = new Map();
    let dbb = 0, dtc = 0;
    for (const k of nets) { const c = netCost(k); netNew.set(k, c); dbb += c - netCostOf[k]; }
    for (const k of conns) { const d = cdelay(k); connNew.set(k, d); dtc += cW[k] * (d - cD[k]); }
    pending = { old, netNew, connNew, dbb, dtc };
    return (1 - lambda) * dbb / bbNorm() + (lambda ? lambda * dtc / tcNorm() : 0);
  }
  /** Keep the move measured. */
  function commit() {
    const p = pending;
    for (const [k, c] of p.netNew) netCostOf[k] = c;
    for (const [k, d] of p.connNew) cD[k] = d;
    setBb(bb() + p.dbb); setTc(tc() + p.dtc);
    pending = null;
  }
  /** Undo a move measured and not kept. */
  function revert() {
    if (!pending) return;
    apply(pending.old);
    pending = null;
  }
  return { propose, delta, commit, revert };
}
