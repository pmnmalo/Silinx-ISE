// Carry chains of logic written as gates (#77, #52): adders and comparators that a design writes bit by bit
// (the EPFL adder and max benchmarks, a schematic of full adders, a ripple-carry adder in HDL) reach Yosys as
// gates, which ABC maps onto LUTs bit after bit (the EPFL adder: 75 ns where ISE's XST gets 12 ns). Here, on
// the netlist of Yosys's coarse synthesis (its JSON, before synth_xilinx's fine step), such a chain is found
// and rewritten as one $alu, which synth_xilinx maps onto the carry chain (MUXCY / XORCY):
//   - a carry is a majority of three nets, c[i+1] = MAJ(x[i], y[i], c[i]) (each of them maybe inverted, the
//     result too): a sum's carry, a comparison's (a < b: MAJ(~a, b, c)), a bit-0 AND / OR (c = 0 / 1);
//   - a chain: carries each of which takes the one before as its third input, MIN_CHAIN of them at least;
//   - a sum: XOR3(x[i], y[i], c[i]) (or its inverse) of a bit of a chain.
// The functions are found by k-cut enumeration (k = 3) with their truth tables, as ABC and Yosys's
// extract_fa do; the 1-bit logic cells of the coarse netlist are read ($and, $or, $xor, $not, $mux…, and
// their fine $_AND_… forms); the other cells and the inputs are leaves. The chain's carries and sums are
// then driven by the $alu (through an inverter where their polarity asks for one); their old logic is
// left without loads, for opt_clean.
//
//   const r = rewriteCarryChains(json, { top })   // json: Yosys's write_json; r = { json, chains: [lengths],
//                                                 //   sums: [the sums of each chain made the $alu's] }
// { adders: true }: only the chains of adders (half of their bits with a sum at least), effort Normal's (#377).

export const MIN_CHAIN = 4;
// effort Normal's (#377): an adder's chain of ADDER_MIN bits at least (the EPFL adder's 128: 98 ns on LUTs,
// 17 ns on the carry chain; the short ones of the EPFL sin and voter, 4 to 20 bits, slower than on LUTs)
export const ADDER_MIN = 8;
// the designs looked at: those with GATE_MIN 1-bit gates at least (a gate-level adder has several per
// bit); the others are synthesized as before, in one run of Yosys
export const GATE_MIN = 24;

/** The 1-bit gates (&, |, ^, ~ and their inverses) of the assignments of 1-bit values in a design. */
export function gateAssignments(design) {
  let n = 0;
  const seen = new Set();
  const GATE_OPS = new Set(['&', '|', '^', '~^', '^~', 'and', 'or', 'xor', 'nand', 'nor', 'xnor', '~', '!', 'not']);
  const gates = v => (!v || typeof v !== 'object' || (v.k !== 'bin' && v.k !== 'un') ? 0
    : (GATE_OPS.has(String(v.o).toLowerCase()) ? 1 : 0) + gates(v.a) + gates(v.b));
  const walk = o => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.k === 'asg' && (o.target?.t?.w === 1 || o.target?.sig?.t?.w === 1)) n += gates(o.value);
    for (const [k, v] of Object.entries(o)) if (k !== 'sig' && k !== 't' && k !== 'val') walk(v);
  };
  for (const p of design.procs || []) walk(p.body);
  return n;
}
const K = 3, MAX_CUTS = 48;

// the 1-bit logic cells: their inputs, and their function on bits (a, b, s)
const GATES = {
  $not: { ins: ['A'], f: (a) => ~a }, $_NOT_: { ins: ['A'], f: (a) => ~a }, $logic_not: { ins: ['A'], f: (a) => ~a },
  $_BUF_: { ins: ['A'], f: (a) => a }, $pos: { ins: ['A'], f: (a) => a },
  $and: { ins: ['A', 'B'], f: (a, b) => a & b }, $_AND_: { ins: ['A', 'B'], f: (a, b) => a & b }, $logic_and: { ins: ['A', 'B'], f: (a, b) => a & b },
  $or: { ins: ['A', 'B'], f: (a, b) => a | b }, $_OR_: { ins: ['A', 'B'], f: (a, b) => a | b }, $logic_or: { ins: ['A', 'B'], f: (a, b) => a | b },
  $xor: { ins: ['A', 'B'], f: (a, b) => a ^ b }, $_XOR_: { ins: ['A', 'B'], f: (a, b) => a ^ b },
  $xnor: { ins: ['A', 'B'], f: (a, b) => ~(a ^ b) }, $_XNOR_: { ins: ['A', 'B'], f: (a, b) => ~(a ^ b) },
  $_NAND_: { ins: ['A', 'B'], f: (a, b) => ~(a & b) }, $_NOR_: { ins: ['A', 'B'], f: (a, b) => ~(a | b) },
  $_ANDNOT_: { ins: ['A', 'B'], f: (a, b) => a & ~b }, $_ORNOT_: { ins: ['A', 'B'], f: (a, b) => a | ~b },
  $mux: { ins: ['A', 'B', 'S'], f: (a, b, s) => (s & b) | (~s & a) }, $_MUX_: { ins: ['A', 'B', 'S'], f: (a, b, s) => (s & b) | (~s & a) },
};
// the truth tables over three leaves (bit k of the table: leaf j is bit j of k)
const VAR = [0xaa, 0xcc, 0xf0];
const MASK = 0xff;
const maj = (a, b, c) => (a & b) | (a & c) | (b & c);
// MAJ(l0 ^ p0, l1 ^ p1, l2 ^ p2) ^ o for every polarity: table -> { p: [p0, p1, p2], o }
const MAJS = new Map(), XOR3 = new Map();
for (let p = 0; p < 8; p++) for (let o = 0; o < 2; o++) {
  const v = j => (p >> j & 1 ? ~VAR[j] : VAR[j]) & MASK;
  const t = (maj(v(0), v(1), v(2)) ^ (o ? MASK : 0)) & MASK;
  if (!MAJS.has(t)) MAJS.set(t, { p: [p & 1, p >> 1 & 1, p >> 2 & 1], o });
}
XOR3.set((VAR[0] ^ VAR[1] ^ VAR[2]) & MASK, 0);
XOR3.set(~(VAR[0] ^ VAR[1] ^ VAR[2]) & MASK, 1);

/** Find the carry chains of a Yosys JSON module and rewrite them as $alu cells (see the head). */
export function rewriteCarryChains(json, { top, minChain = MIN_CHAIN, adders = false } = {}) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const name = top && j.modules[top] ? top : Object.keys(j.modules).find(k => j.modules[k].attributes?.top) || Object.keys(j.modules)[0];
  const mod = j.modules[name];
  if (!mod) return { json: j, chains: [], sums: [] };
  // the driver of every bit by a 1-bit logic cell
  const drv = new Map();
  let maxBit = 1;
  const seeBit = b => { if (typeof b === 'number' && b > maxBit) maxBit = b; };
  for (const [cn, c] of Object.entries(mod.cells)) {
    for (const bits of Object.values(c.connections)) bits.forEach(seeBit);
    const g = GATES[c.type];
    if (!g || (c.connections.Y || []).length !== 1 || g.ins.some(p => (c.connections[p] || []).length !== 1)) continue;
    if (typeof c.connections.Y[0] === 'number') drv.set(c.connections.Y[0], { cn, c, g });
  }
  for (const n of Object.values(mod.netnames || {})) n.bits.forEach(seeBit);
  for (const p of Object.values(mod.ports || {})) p.bits.forEach(seeBit);

  // k-cuts of every driven bit, with their truth tables (leaves: bits or the constants '0' / '1')
  const cuts = new Map();
  const leafCut = b => [{ leaves: [b], t: VAR[0] }];
  const constT = b => (b === '1' ? MASK : 0);
  const cutsOf = (b, stack = new Set()) => {
    if (typeof b !== 'number') return [{ leaves: [], t: constT(b) }];
    if (cuts.has(b)) return cuts.get(b);
    const d = drv.get(b);
    if (!d || stack.has(b)) return leafCut(b);
    stack.add(b);
    const ins = d.g.ins.map(p => d.c.connections[p][0]);
    const sets = ins.map(i => cutsOf(i, stack));
    stack.delete(b);
    const out = [{ leaves: [b], t: VAR[0] }];
    const seen = new Set(['' + b]);
    const combine = (k, leaves, picks) => {
      if (out.length > MAX_CUTS * 4) return;
      if (k === sets.length) {
        const ls = [...leaves].sort((x, y) => String(x).localeCompare(String(y)));
        const key = ls.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        // each input's table, its leaves mapped to the merged cut's positions
        const tabs = picks.map(pc => remap(pc, ls));
        out.push({ leaves: ls, t: d.g.f(...tabs) & MASK });
        return;
      }
      for (const pc of sets[k]) {
        const u = new Set(leaves);
        for (const l of pc.leaves) u.add(l);
        if (u.size > K) continue;
        combine(k + 1, u, [...picks, pc]);
      }
    };
    combine(0, new Set(), []);
    // the smallest cuts first (the trivial one kept)
    const kept = [out[0], ...out.slice(1).sort((x, y) => x.leaves.length - y.leaves.length).slice(0, MAX_CUTS)];
    cuts.set(b, kept);
    return kept;
  };
  // a cut's table over other leaves (a superset, in order)
  function remap(pc, ls) {
    if (!pc.leaves.length) return pc.t;
    let t = 0;
    for (let k = 0; k < 8; k++) {
      let idx = 0;
      pc.leaves.forEach((l, j) => { if (k >> ls.indexOf(l) & 1) idx |= 1 << j; });
      if (pc.t >> idx & 1) t |= 1 << k;
    }
    return t;
  }
  for (const b of drv.keys()) cutsOf(b);

  // the carries: a bit that is a majority of three leaves, MAJ(l0 ^ p0, l1 ^ p1, l2 ^ p2) ^ o; one of them
  // maybe a constant (a 2-cut: AND = MAJ(a, b, 0), OR = MAJ(a, b, 1), with their polarities)
  const forms = new Map();   // bit -> [{ leaves: [3], p: [3], o }]
  const addForm = (b, f) => (forms.get(b) || forms.set(b, []).get(b)).push(f);
  for (const [b, cs] of cuts) {
    for (const c of cs) {
      if (c.leaves.includes(b)) continue;
      if (c.leaves.length === 3) { const m = MAJS.get(c.t); if (m) addForm(b, { leaves: c.leaves, ...m }); continue; }
      if (c.leaves.length !== 2) continue;
      const g = c.t & 0x0f;   // (over l0, l1)
      for (let p0 = 0; p0 < 2; p0++) for (let p1 = 0; p1 < 2; p1++) for (let o = 0; o < 2; o++) for (const k of [0, 1]) {
        let t = 0;
        for (let i = 0; i < 4; i++) { const a = (i & 1) ^ p0, bb = (i >> 1 & 1) ^ p1; if ((maj(a, bb, k) ^ o) & 1) t |= 1 << i; }
        if (t === g) addForm(b, { leaves: [c.leaves[0], c.leaves[1], String(k)], p: [p0, p1, 0], o });
      }
    }
  }
  // the carries: the bits with a majority of three (non-constant) leaves; a 2-input AND / OR (a form with a
  // constant leaf) only starts a chain (bit 0 of an adder: c1 = a0 & b0)
  const isMaj3 = f => f.leaves.every(l => typeof l === 'number');
  const carries = new Set([...forms].filter(([, fs]) => fs.some(isMaj3)).map(([b]) => b));
  // a carry's inverse (a NOT of it) is the same carry: its leaves are read through it, inverted
  const NOTS = new Set(['$not', '$_NOT_', '$logic_not']);
  const alias = new Map();   // bit -> the carry it inverts
  for (const b of [...carries]) {
    const d = drv.get(b);
    if (d && NOTS.has(d.c.type) && carries.has(d.c.connections.A[0])) { alias.set(b, d.c.connections.A[0]); carries.delete(b); }
  }
  const base = l => (alias.has(l) ? { l: alias.get(l), inv: 1 } : { l, inv: 0 });
  const starts = new Set([...forms].filter(([b, fs]) => !carries.has(b) && fs.some(f => !isMaj3(f))).map(([b]) => b));
  // each carry's link: the form whose third input is another carry (its predecessor) or a start
  const link = new Map();   // bit -> { prev, x, y, px, py, pc, o }
  const linkOf = (b, f, k) => { const order = [0, 1, 2].filter(x => x !== k); const c = base(f.leaves[k]); return { prev: c.l, x: f.leaves[order[0]], y: f.leaves[order[1]], px: f.p[order[0]], py: f.p[order[1]], pc: f.p[k] ^ c.inv, o: f.o }; };
  for (const b of carries) {
    let best = null;
    for (const pass of [carries, starts]) {
      for (const f of forms.get(b).filter(isMaj3)) {
        for (let k = 0; k < 3 && !best; k++) if (base(f.leaves[k]).l !== b && pass.has(base(f.leaves[k]).l)) best = linkOf(b, f, k);
        if (best) break;
      }
      if (best) break;
    }
    // (none: the first carry of a chain whose carry in is a net, a cin port; MAJ is symmetric: its third
    // leaf taken as the carry in)
    if (!best) { const f = forms.get(b).find(isMaj3); best = { ...linkOf(b, f, 2), head: true }; }
    link.set(b, best);
  }
  // a start's own link: its constant carry in
  for (const b of starts) {
    const f = forms.get(b).find(x => !isMaj3(x));
    link.set(b, { prev: f.leaves[2], x: f.leaves[0], y: f.leaves[1], px: f.p[0], py: f.p[1], pc: 0, o: f.o });
  }
  // the chains: from each end (a carry no other carry continues) back along the links, while each carry
  // before is continued by this one only
  const succs = new Map();
  for (const b of carries) { const l = link.get(b); if (l && typeof l.prev === 'number') (succs.get(l.prev) || succs.set(l.prev, []).get(l.prev)).push(b); }
  let chains = [];
  const used = new Set();
  for (const end of carries) {
    if (!link.has(end) || succs.has(end)) continue;   // not linked, or continued: not an end
    const path = [end];
    let b = end;
    for (;;) {
      const prev = link.get(b).prev;
      if (typeof prev !== 'number' || !link.has(prev) || path.includes(prev) || (succs.get(prev) || []).length !== 1 || link.get(b).head) break;
      path.unshift(prev);
      b = prev;
      if (starts.has(prev) || link.get(prev).head) break;   // (a start or a head: the chain's first bit)
    }
    if (path.length >= minChain && !path.some(x => used.has(x))) { path.forEach(x => used.add(x)); chains.push(path); }
  }
  // the sums of a chain's bits (bits: [{ b, x, y, prev }]): the bits b that are XOR3(x, y, carry in) of a
  // bit i of it, or its inverse (k)
  function sumsOf(bits) {
    const carryIn = i => (i ? bits[i - 1].b : bits[0].prev);
    const out = [];
    for (const [b, cs] of cuts) {
      if (bits.some(bt => bt.b === b)) continue;
      for (const c of cs) {
        if (c.leaves.length !== 3) continue;
        const k = XOR3.get(c.t);
        if (k === undefined) continue;
        const i = bits.findIndex((bt, ii) => c.leaves.includes(bt.x) && c.leaves.includes(bt.y) && c.leaves.includes(carryIn(ii)));
        if (i < 0) continue;
        out.push({ b, i, k });
        break;
      }
    }
    return out;
  }
  const bitsOf = path => path.map(b => ({ b, ...link.get(b) }));
  // a chain whose first bit is the sum of another (an AND-inverter graph's XOR is an AND of two inverted nets,
  // so its sum is also a start, c = a & b: the EPFL multiplier's rows, #746): it starts at its next bit, the
  // sum its carry in, rather than both chains driving that bit
  let sums = new Map();   // chain -> its sums
  for (let trimmed = true; trimmed;) {
    sums = new Map(chains.map(path => [path, sumsOf(bitsOf(path))]));
    const sumOf = new Map();   // bit -> the chain of which it is a sum
    for (const [path, ss] of sums) for (const { b } of ss) sumOf.set(b, path);
    trimmed = false;
    chains = chains.map(path => {
      let k = 0;
      while (k < path.length && sumOf.has(path[k]) && sumOf.get(path[k]) !== path) k++;
      if (k) trimmed = true;
      return k ? path.slice(k) : path;
    }).filter(path => path.length >= minChain);
  }
  // (adders: only the chains half of whose bits at least have their sum, comparators left as they are)
  if (adders) chains = chains.filter(path => 2 * sums.get(path).length >= path.length);
  if (!chains.length) return { json: j, chains: [], sums: [] };

  // the rewrite
  let fresh = maxBit;
  const newBit = () => ++fresh;
  let cellN = 0;
  const addCell = (type, conns, dirs, params = {}) => {
    mod.cells[`$silinx$carry$${++cellN}`] = { hide_name: 1, type, parameters: params, attributes: {}, port_directions: dirs, connections: conns };
  };
  const inv = (b) => { if (b === '0') return '1'; if (b === '1') return '0'; const y = newBit(); addCell('$_NOT_', { A: [b], Y: [y] }, { A: 'input', Y: 'output' }); return y; };
  // a bit driven by `src` (inverted when `neg`) in place of its old driver; once only (a bit of two chains,
  // #746: by the first, the same function)
  const redriven = new Set();
  const redrive = (b, src, neg) => {
    if (redriven.has(b)) return false;
    redriven.add(b);
    const d = drv.get(b);
    if (d) d.c.connections.Y = [newBit()];   // the old logic: no loads any more
    addCell(neg ? '$_NOT_' : '$_BUF_', { A: [src], Y: [b] }, { A: 'input', Y: 'output' });
    return true;
  };
  const lengths = [], sumCounts = [];
  for (const path of chains) {
    // bit i of the $alu: the carry path[i] = MAJ(x, y, path[i-1]); the first one's carry in: its own third leaf
    const bits = bitsOf(path);
    const L = bits.length;
    // the true carries t[i] = c[i] ^ q[i]: each bit's form flipped (MAJ(~a, ~b, ~c) = ~MAJ(a, b, c)) so that
    // its carry in has the polarity of the bit before's carry out
    let q = bits[0].pc;
    const A = [], B = [], qs = [q];
    for (const bt of bits) {
      let { px, py, pc, o } = bt;
      if (pc !== q) { px ^= 1; py ^= 1; pc ^= 1; o ^= 1; }
      A.push(px ? inv(bt.x) : bt.x);
      B.push(py ? inv(bt.y) : bt.y);
      bt.q = o;   // the carry out t = c ^ o
      q = o;
      qs.push(o);
    }
    const ci0 = bits[0].prev;
    const CI = qs[0] ? inv(ci0) : ci0;
    const CO = Array.from({ length: L }, newBit), Y = Array.from({ length: L }, newBit), X = Array.from({ length: L }, newBit);
    addCell('$alu', { A, B, CI: [CI], BI: ['0'], X, Y, CO },
      { A: 'input', B: 'input', CI: 'input', BI: 'input', X: 'output', Y: 'output', CO: 'output' },
      { A_SIGNED: '0', B_SIGNED: '0', A_WIDTH: bin(L), B_WIDTH: bin(L), Y_WIDTH: bin(L) });
    bits.forEach((bt, i) => redrive(bt.b, CO[i], bt.q === 1));
    // the sums of the chain's bits: XOR3(x, y, carry in) = Y[i] ^ (px ^ py ^ q[i] ^ k)
    let n = 0;
    for (const { b, i, k } of sums.get(path)) {
      // the polarities of the $alu's A, B and carry in against the leaves
      const pA = A[i] === bits[i].x ? 0 : 1, pB = B[i] === bits[i].y ? 0 : 1;
      if (redrive(b, Y[i], (pA ^ pB ^ qs[i] ^ k) === 1)) n++;
    }
    lengths.push(L);
    sumCounts.push(n);
  }
  return { json: j, chains: lengths, sums: sumCounts };
}
const bin = n => n.toString(2).padStart(32, '0');
