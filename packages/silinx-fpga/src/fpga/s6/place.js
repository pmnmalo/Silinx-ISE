// Silinx - the Spartan-6 placer (#729; the plan: research/s6/README.md, #1): the instances of a physical design
// (core/fpga/s6/phys.js) on the sites of the device (core/fpga/s6/sites.js), legally, by simulated annealing in the
// manner of the Spartan-3E placer (core/fpga/place.js, VPR) (browser + Node).
//
// The objects: every slice, every carry chain (its slices up a column of SLICEL / SLICEM, each the next stage of
// the one below: COUT -> CIN in the routing graph), every IOB without a LOC, every block RAM and DSP48A1 (a cascade
// of DSP48A1s up its column, PCOUT -> PCIN). A SLICEX instance fits any slice, a SLICEL one a SLICEL or a SLICEM, a
// SLICEM one a SLICEM only. A RAMB16BWER takes a block RAM tile, a RAMB8BWER one of its halves. IOBs with a LOC
// are on their pads (bonded, one each, the banks' VCCO the same for all their I/Os); a global buffer driven by a pad
// is on the BUFGMUX that pad's dedicated clock path reaches (a GCLK pin; a clock input without a LOC takes such a
// pad), other ones on the free BUFGMUX in order; a clock on a pad no dedicated path leaves is a warning.
// The cost: the half-perimeter wirelength of the nets (clocks and power nets left out; VPR's correction for the
// nets of many pins), in tiles, and (timing, the weight lambda) the estimated delay of every connection weighted by
// its criticality (place-timing.js), each normalised and mixed, the criticalities recomputed at each temperature.
// A move takes an object to a site in a window around it (swapping with what is there when that fits); the
// window shrinks to keep about 44 % of the moves accepted. One seeded random generator: a seed, one placement.
//
//   const r = placeS6(phys, s6Sites(device), { seed, effort, timing, nl })
//     r = { site: [site name by inst], tile: [tile name by inst], pos: [[px, py]], wirelength, delay (the estimate's
//           critical path, ns), warnings, stats: { moves, temps, seconds, objects, initialWirelength, initialDelay } }
import { PlaceError, crossing, rng, vccoOfStandard } from '../place.js';
import { timingGraphS6, analyzeS6 } from './place-timing.js';
import { mountMovesS6 } from './place-moves.js';

export { PlaceError };

/** Does a slice site of kind `site` take an instance that needs `need` (X, L, M)? */
export const sliceFits = (need, site) => need === 'X' || site === need || (need === 'L' && site === 'M');
const needOf = inst => inst.type.slice(5);
// the expected wirelength of a net of n pins against its bounding box (VPR's crossing count)
export { crossing };   // (core/fpga/place.js's)
/** The VCCO of an IOB: its I/O standard's (ISE's default LVCMOS25). */
export const vccoOfIob = inst => vccoOfStandard(inst.cons?.iostandard || 'LVCMOS25');

/** The sites of a chain whose bottom stage is on `base` (null when the column ends first). */
export function chainSites(base, n, next) {
  const out = [base];
  while (out.length < n) { const up = next(out[out.length - 1]); if (!up) return null; out.push(up); }
  return out;
}

/**
 * Place a physical design. Options: seed (1), effort (4: the moves per temperature scale with it), timing (0.1:
 * the weight lambda of the timing cost, 0: the wirelength only; heavier weights gave the examples longer wires and
 * no shorter estimated critical path, whose carry chains decide it), nl (the netlist, for the timing estimate;
 * without it the placement is wirelength-driven), log (a function for progress lines).
 */
export function placeS6(phys, sites, { seed = 1, effort = 4, timing = 0.1, nl = null, log = null } = {}) {
  const t0 = Date.now();
  const random = rng(seed);
  const ri = n => Math.floor(random() * n);
  const { insts } = phys;
  const N = insts.length;
  const site = new Array(N).fill(null);       // inst -> site name
  const pos = Array.from({ length: N }, () => [0, 0]);
  const owner = new Map();                    // site name -> inst
  const warnings = [];
  const slices = sites.slices;
  const nextSlice = s => slices.get(s)?.above ?? null;
  const dspBy = new Map(sites.dsps.map(d => [d.name, d]));
  const nextDsp = s => dspBy.get(s)?.above ?? null;
  const padOf = new Map(sites.pads);
  const bramSite = new Map();                 // RAMB16 / RAMB8 site name -> its tile entry
  for (const t of sites.brams) { if (t.r16) bramSite.set(t.r16, t); for (const s of t.r8) bramSite.set(s, t); }
  const posOfSite = name => {
    const s = slices.get(name) || padOf.get(name) || dspBy.get(name) || bramSite.get(name) || sites.bufgs.find(b => b.name === name);
    return [s.px, s.py];
  };
  const setAt = (i, name) => {
    if (site[i] !== null && owner.get(site[i]) === i) owner.delete(site[i]);
    site[i] = name;
    if (name !== null) { owner.set(name, i); const p = posOfSite(name); pos[i][0] = p[0]; pos[i][1] = p[1]; }
  };

  // ---------------------------------------------------------------- objects
  const objOf = new Int32Array(N).fill(-1);
  const objs = [];
  const add = o => { o.id = objs.length; for (const m of o.members) objOf[m] = o.id; objs.push(o); return o; };
  for (const ch of phys.chains) add({ kind: 'chain', members: ch, next: nextSlice });
  // DSP48A1 cascades: a DSP whose PCIN / BCIN another's PCOUT / BCOUT drives sits above it
  const dspUp = new Map();
  for (const net of phys.nets) {
    if (!net.driver || insts[net.driver.inst].kind !== 'dsp' || !/^(PCOUT|BCOUT)/.test(net.driver.pin)) continue;
    for (const l of net.loads) if (insts[l.inst].kind === 'dsp' && /^(PCIN|BCIN)/.test(l.pin)) dspUp.set(net.driver.inst, l.inst);
  }
  const dspBelow = new Set(dspUp.values());
  for (const [b] of dspUp) {
    if (dspBelow.has(b)) continue;
    const members = [b];
    while (dspUp.has(members[members.length - 1])) members.push(dspUp.get(members[members.length - 1]));
    add({ kind: 'chain', members, next: nextDsp, dsp: true });
  }
  insts.forEach((inst, i) => {
    if (objOf[i] >= 0) return;
    if (inst.kind === 'slice') add({ kind: 'slice', members: [i] });
    else if (inst.kind === 'iob') add({ kind: 'iob', members: [i], fixed: !!inst.loc });
    else if (inst.kind === 'bufg') add({ kind: 'bufg', members: [i], fixed: true });
    else if (inst.kind === 'bram') add({ kind: 'bram', members: [i] });
    else if (inst.kind === 'dsp') add({ kind: 'chain', members: [i], next: nextDsp, dsp: true });
  });

  // ---------------------------------------------------------------- the pads and the banks' VCCO
  const bankV = new Map();   // bank -> { v, n }
  const bankAdd = (pad, v, k) => { const e = bankV.get(pad.bank) || { v, n: 0 }; e.n += k; if (e.n <= 0) bankV.delete(pad.bank); else bankV.set(pad.bank, e); };
  const bankOk = (pad, v) => v == null || !bankV.has(pad.bank) || bankV.get(pad.bank).v === v;
  const placePad = (i, pad) => { setAt(i, pad.name); bankAdd(pad, vccoOfIob(insts[i]), 1); };
  for (const o of objs) {
    if (o.kind !== 'iob' || !o.fixed) continue;
    const i = o.members[0], inst = insts[i], pad = padOf.get(inst.loc);
    if (!pad) throw new PlaceError(`place: ${inst.name}: LOC ${inst.loc} is not a bonded pad of ${sites.part}`);
    if (owner.has(pad.name)) throw new PlaceError(`place: two ports on pad ${pad.name} (${insts[owner.get(pad.name)].name}, ${inst.name})`);
    if (!bankOk(pad, vccoOfIob(inst))) throw new PlaceError(`place: ${inst.name}: pad ${pad.name} is in bank ${pad.bank}, whose other I/Os need VCCO ${bankV.get(pad.bank).v} V, not ${vccoOfIob(inst)} V (I/O standards)`);
    placePad(i, pad);
  }
  const freePads = inst => [...padOf.values()].filter(p => !owner.has(p.name) && bankOk(p, vccoOfIob(inst)));

  // ---------------------------------------------------------------- the global buffers
  const bufgs = objs.filter(o => o.kind === 'bufg');
  if (bufgs.length > sites.bufgs.length) throw new PlaceError(`place: ${bufgs.length} global clock buffers, the ${sites.part} has ${sites.bufgs.length}`);
  const inputOf = i => phys.nets.find(n => n.loads.some(l => l.inst === i && l.pin === 'I0'));
  for (const o of bufgs) {
    const i = o.members[0], src = inputOf(i)?.driver;
    const padInst = src && insts[src.inst].kind === 'iob' ? src.inst : null;
    if (padInst !== null && site[padInst] === null) {
      // a clock input without a LOC: a free clock-capable pad whose buffer is free
      const pad = freePads(insts[padInst]).find(p => p.bufg.some(b => !owner.has(b)));
      if (pad) { placePad(padInst, pad); objs[objOf[padInst]].fixed = true; }
    }
    const pad = padInst !== null && site[padInst] !== null ? padOf.get(site[padInst]) : null;
    let b = pad ? pad.bufg.find(x => !owner.has(x)) : null;
    if (!b) {
      b = sites.bufgs.map(x => x.name).find(x => !owner.has(x));
      if (pad) warnings.push(`${insts[padInst].name}: the clock enters on pad ${pad.name}, ${pad.bufg.length ? 'whose global buffer is taken' : 'not a clock-capable pin (GCLK)'}: its global buffer ${b} is reached through general routing`);
    }
    setAt(i, b);
  }

  // ---------------------------------------------------------------- the initial placement (random, legal)
  for (const o of objs) {
    if (o.kind !== 'iob' || site[o.members[0]] !== null) continue;
    const free = freePads(insts[o.members[0]]);
    if (!free.length) throw new PlaceError(`place: no free pad for ${insts[o.members[0]].name}`);
    placePad(o.members[0], free[ri(free.length)]);
  }
  const bramFree = (t, type, name) => (type === 'RAMB16BWER' ? !owner.has(t.r16) && t.r8.every(s => !owner.has(s)) : !owner.has(t.r16) && !owner.has(name));
  const bramSites = type => sites.brams.flatMap(t => (type === 'RAMB16BWER' ? (t.r16 ? [t.r16] : []) : t.r8));
  for (const o of objs.filter(x => x.kind === 'bram')) {
    const i = o.members[0], type = insts[i].type;
    const free = bramSites(type).filter(s => bramFree(bramSite.get(s), type, s));
    if (!free.length) throw new PlaceError(`place: no free ${type} site for ${insts[i].name} (the ${sites.part} has ${sites.brams.length} block RAM tiles)`);
    setAt(i, free[ri(free.length)]);
  }
  const chainFree = (o, base) => {
    const ss = chainSites(base, o.members.length, o.next);
    if (!ss) return null;
    for (let k = 0; k < ss.length; k++) {
      if (owner.has(ss[k])) return null;
      if (!o.dsp && !sliceFits(needOf(insts[o.members[k]]), slices.get(ss[k]).kind)) return null;
    }
    return ss;
  };
  const sliceNames = [...slices.keys()];
  const dspNames = sites.dsps.map(d => d.name);
  const placeChain = o => {
    const names = o.dsp ? dspNames : sliceNames;
    for (let t = 0; t < 200; t++) { const ss = chainFree(o, names[ri(names.length)]); if (ss) return ss; }
    for (const b of names) { const ss = chainFree(o, b); if (ss) return ss; }
    return null;
  };
  // (the longest chains first)
  for (const o of objs.filter(x => x.kind === 'chain').sort((a, b) => b.members.length - a.members.length || a.id - b.id)) {
    const ss = placeChain(o);
    if (!ss) throw new PlaceError(`place: no room for ${o.dsp ? 'the DSP48A1 cascade' : 'the carry chain'} of ${o.members.length} ${o.dsp ? 'DSP48A1s' : 'slices'} at ${insts[o.members[0]].name} (${o.dsp ? 'a column of DSP48A1 sites' : 'a column of SLICEL / SLICEM'} of the ${sites.part})`);
    o.members.forEach((m, k) => setAt(m, ss[k]));
  }
  for (const o of objs.filter(x => x.kind === 'slice')) {
    const i = o.members[0], need = needOf(insts[i]);
    let s = null;
    for (let t = 0; t < 200 && !s; t++) { const c = sliceNames[ri(sliceNames.length)]; if (!owner.has(c) && sliceFits(need, slices.get(c).kind)) s = c; }
    s ||= sliceNames.find(c => !owner.has(c) && sliceFits(need, slices.get(c).kind));
    if (!s) throw new PlaceError(`place: the design needs more slices${need === 'X' ? '' : ` of kind SLICE${need}`} than the ${sites.part} has`);
    setAt(i, s);
  }

  // ---------------------------------------------------------------- the cost
  const costNets = phys.nets.filter(n => !n.clock && !n.power && n.driver)
    .map(n => [...new Set([n.driver.inst, ...n.loads.map(l => l.inst)])]).filter(m => m.length > 1);
  const NN = costNets.length;
  const netsOf = Array.from({ length: N }, () => []);
  costNets.forEach((m, k) => { for (const i of m) netsOf[i].push(k); });
  const netCost = k => {
    const m = costNets[k];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of m) { const p = pos[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return (x1 - x0 + y1 - y0) * crossing(m.length);
  };
  const netCostOf = new Float64Array(NN);
  // timing: the connections between sites, weighted by criticality ** critExp
  const tg = nl && timing > 0 ? timingGraphS6(nl, phys) : null;
  const lambda = tg ? timing : 0;
  const tconns = tg ? tg.live.filter(j => !phys.conns[j].internal && phys.conns[j].srcInst !== phys.conns[j].dstInst) : [];
  const NC = tconns.length;
  const cW = new Float64Array(NC), cD = new Float64Array(NC);
  const connsOf = Array.from({ length: N }, () => []);
  tconns.forEach((j, k) => { connsOf[phys.conns[j].srcInst].push(k); connsOf[phys.conns[j].dstInst].push(k); });
  const model = tg?.model;
  const cdelay = k => { const x = phys.conns[tconns[k]], a = pos[x.srcInst], b = pos[x.dstInst]; return model.base + model.perTile * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])); };
  let bb = 0, bbNorm = 1, tc = 0, tcNorm = 1, dmax = 0, critExp = 1;
  const reweight = () => {
    bb = 0;
    for (let k = 0; k < NN; k++) { netCostOf[k] = netCost(k); bb += netCostOf[k]; }
    bbNorm = Math.max(bb, 1e-9);
    if (!tg) return;
    const t = analyzeS6(tg, phys, pos);
    dmax = t.dmax;
    tc = 0;
    for (let k = 0; k < NC; k++) { cW[k] = t.crit[tconns[k]] ** critExp; cD[k] = cdelay(k); tc += cW[k] * cD[k]; }
    tcNorm = Math.max(tc, 1e-9);
  };
  reweight();
  const initialWirelength = bb, initialDelay = dmax;

  // ---------------------------------------------------------------- the annealing
  const movable = objs.filter(o => o.kind === 'slice' || o.kind === 'chain' || o.kind === 'bram' || (o.kind === 'iob' && !o.fixed));
  let rlim = Math.max(...sliceNames.map(n => slices.get(n).y)) + 1, moves = 0, temps = 0;
  const rmax = rlim;
  const { propose, delta, commit, revert } = mountMovesS6({
    insts, objs, objOf, movable, site, pos, owner, setAt, slices, sliceNames, padOf, bramSite, bramFree, bramSites, dspBy,
    chainSites, needOf, ri, rlim: () => rlim, bankOk, bankAdd, vccoOfIob, netsOf, netCost, netCostOf, connsOf, cW, cD, cdelay,
    lambda, bb: () => bb, bbNorm: () => bbNorm, tc: () => tc, tcNorm: () => tcNorm,
    setBb: v => { bb = v; }, setTc: v => { tc = v; },
  });
  if (movable.length) {
    const sample = [];
    for (let k = 0; k < Math.max(50, movable.length); k++) if (propose()) sample.push(delta());
    revert();
    const mean = sample.reduce((a, b) => a + b, 0) / Math.max(1, sample.length);
    const sd = Math.sqrt(sample.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sample.length));
    let T = 20 * sd || 1;
    const perT = Math.max(100, Math.round(effort * 6 * Math.pow(movable.length, 4 / 3)));
    const total = () => (1 - lambda) * bb / bbNorm + lambda * tc / tcNorm;
    for (;;) {
      let acc = 0, tried = 0;
      for (let k = 0; k < perT; k++) {
        if (!propose()) continue;
        tried++;
        const d = delta();
        if (d <= 0 || random() < Math.exp(-d / T)) { commit(); acc++; }
      }
      revert();
      moves += perT; temps++;
      critExp = 1 + 7 * Math.max(0, 1 - (rlim - 1) / Math.max(1, rmax - 1));
      reweight();
      const a = tried ? acc / tried : 0;
      // VPR's schedule: cool slowly while many moves are accepted
      T *= a > 0.96 ? 0.5 : a > 0.8 ? 0.9 : a > 0.15 ? 0.95 : 0.8;
      rlim = Math.min(rmax, Math.max(1, rlim * (1 - 0.44 + a)));
      if (log && temps % 10 === 0) log(`T=${T.toFixed(4)} wirelength=${bb.toFixed(1)} delay=${dmax.toFixed(2)} accept=${a.toFixed(2)} rlim=${rlim.toFixed(1)}`);
      if (T < 0.005 * total() / Math.max(1, NN) || temps > 400) break;
    }
    // a last greedy pass (temperature 0)
    for (let k = 0; k < perT; k++) { if (!propose()) continue; if (delta() < 0) commit(); }
    revert();
    reweight();
  }
  const tileOf = name => (slices.get(name) || padOf.get(name) || dspBy.get(name) || bramSite.get(name) || sites.bufgs.find(b => b.name === name)).tile;
  return {
    site: site.slice(), tile: site.map(tileOf), pos: pos.map(p => p.slice()), wirelength: bb, delay: dmax, warnings,
    stats: { moves, temps, seconds: (Date.now() - t0) / 1000, objects: objs.length, movable: movable.length, initialWirelength, initialDelay },
  };
}
