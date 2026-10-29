// The critical path's wide decodes collapsed and mapped again (#1360): a cone of LUTs that computes a function of many
// flip-flops (the T80's instruction decode, T80_MCode's case of IR, ISet and MCycle) keeps the shape the HDL wrote it
// in, and ABC's cut-based mapping only sees the cuts of the graph as it is. The T80's IncDec_16, a function of 19
// flip-flops, takes 7 LUT levels where XST's takes 5; the same function written again from its BDD and mapped alone
// takes 5. Here, on the mapped netlist (Yosys's JSON, LUT1-LUT4, INV and BUF cells), on each path near the critical one,
// from its end down its latest inputs, the first signal whose cone of LUTs reads at most BDD_RULE.leaves signals (the
// leaves: flip-flops, ports and the like, none a multiplexer's, a carry's or a distributed RAM's) is collapsed to a BDD of its leaves (built from the LUTs'
// tables, so the same function by construction), under a few orders of its variables, each written as a tree of
// multiplexers; Yosys and ABC (DEPTH_ABC2) map each tree alone, and the shallowest mapping takes the place of the
// cone when it has fewer levels than the signal has now: its LUTs new, the signal's own fan-out kept, the old LUTs
// removed once nothing reads them. Every cone is checked against the old one (all the rows up to 2^12, else random
// ones). A round does every path's cone it can; the rounds go on while the critical path's estimate gets no longer and
// the LUTs stay within BDD_RULE.growth of the netlist's (and BDD_RULE.extraLuts more: a small design). DEPTH_RULE keeps
// the result or not.
import { DEPTH_ABC2, abcPlain } from './synth-open.js';
import { pathEnds } from './synth-open-path.js';
import { netlistLevels } from './lut-resynth.js';

export const BDD_RULE = { leaves: 22, minLevel: 4, orders: 8, rounds: 8, margin: 0.05, tie: 0.05, visits: 5000, growth: 0.08, extraLuts: 16, checks: 512, nodes: 4096, cones: 64 };

const isLut = t => /^(LUT[1-4]|INV|BUF)$/.test(t);
const lutInputs = c => (c.type === 'INV' || c.type === 'BUF' ? [c.connections.I[0]] : Array.from({ length: +c.type[3] }, (_, i) => c.connections[`I${i}`][0]));
function lutTable(c) {
  if (c.type === 'INV') return [1, 0];
  if (c.type === 'BUF') return [0, 1];
  const k = +c.type[3], s = String(c.parameters?.INIT ?? '');
  const bits = /^[01]+$/.test(s) ? s : (Number(s) >>> 0).toString(2);
  return Array.from({ length: 1 << k }, (_, i) => +(bits[bits.length - 1 - i] ?? 0));
}
const topModule = (nl, top) => nl.modules[top] || Object.values(nl.modules).find(m => m.attributes?.top) || Object.values(nl.modules)[0];
const lutCount = mod => Object.values(mod.cells).filter(c => /^LUT[1-4]$/.test(c.type)).length;

// a leaf of a cone that arrives late: a multiplexer's, a carry chain's or a distributed RAM's read (the cone's levels then
// say nothing of its arrival: a cone made shallower may put it deeper)
const lateLeaf = c => !!c && (/^(MUXF[5-8]|MUXCY|XORCY)$/.test(c.type) || /^RAM\d+X/.test(c.type));

// the LUT cone of a signal: its LUTs (in the order to evaluate them), its leaves and whether one of them arrives late, or
// null past max leaves
function lutCone(cells, driver, root, max) {
  const leaves = [], order = [], seen = new Set();
  let late = false;
  const walk = b => {
    if (seen.has(b)) return true;
    seen.add(b);
    const c = typeof b === 'number' && cells[driver.get(b)];
    if (!c || !isLut(c.type)) { if (typeof b === 'number') { leaves.push(b); late ||= lateLeaf(c); } return leaves.length <= max; }
    for (const x of lutInputs(c)) if (!walk(x)) return false;
    order.push(b);
    return true;
  };
  if (!walk(root)) return null;
  // its depth in LUTs from its leaves (an INV, a BUF or a LUT1 none)
  const depth = new Map();
  for (const b of order) { const c = cells[driver.get(b)]; depth.set(b, (/^LUT[2-4]$/.test(c.type) ? 1 : 0) + Math.max(0, ...lutInputs(c).map(x => depth.get(x) ?? 0))); }
  return { leaves, order, depth: depth.get(root), late };
}

// the inputs a signal's arrival comes through: a LUT's or a multiplexer's, a carry's, a distributed RAM's address
const throughPins = c => Object.entries(c.connections || {}).filter(([p]) => c.port_directions?.[p] === 'input'
  && (/^RAM\d+X/.test(c.type) ? /^(A\d*|DPRA\d*)$/.test(p) : /^(LUT[1-4]|INV|BUF|MUXF[5-8]|MUXCY|XORCY)$/.test(c.type)));

/** The signals to collapse in a netlist (its top module): on the critical path of each end within rule.margin of the
 *  worst (pathEnds: back through every cell's latest input), the first signal from the end with a cone of at most
 *  rule.leaves leaves, none of them late (lateLeaf), and rule.minLevel LUT levels or more (from its leaves). [{ root, level, leaves, order, depth }]. */
export function collapseCandidates(mod, { worst, ends, arrival }, rule = BDD_RULE) {
  const { driver } = netlistLevels(mod);
  const cells = mod.cells, out = new Map(), seen = new Set();
  // back from a signal through its latest inputs (and those within rule.tie of it: parallel paths), to the first
  // signal of each with a small enough cone
  const back = x => {
    if (typeof x !== 'number' || seen.has(x) || seen.size > rule.visits) return;
    seen.add(x);
    const d = cells[driver.get(x)];
    if (!d) return;
    if (isLut(d.type)) {
      const cone = lutCone(cells, driver, x, rule.leaves);
      if (cone && !cone.late && cone.leaves.length >= 5 && cone.depth >= rule.minLevel) { out.set(x, { root: x, level: cone.depth, ...cone }); return; }
    }
    const ins = throughPins(d).flatMap(([, v]) => v).filter(b => typeof b === 'number');
    const t = Math.max(...ins.map(arrival));
    for (const b of ins) if (arrival(b) >= t - rule.tie) back(b);
  };
  for (const e of ends) {
    if (e.ns < worst * (1 - rule.margin) || !cells[e.cell]) continue;
    const bits = (cells[e.cell].connections[e.port] || []).filter(b => typeof b === 'number');
    const t = Math.max(...bits.map(arrival));
    for (const b of bits) if (arrival(b) >= t - rule.tie) back(b);
  }
  return [...out.values()];
}

// a BDD of the cone (the LUTs' tables applied by ite), its variables in the order rank[leaf] (0 at the top), written
// as a Verilog module of multiplexers on input x (x[i] the cone's leaf i); null past maxNodes nodes (an adder's or a
// multiplier's XORs: a BDD of exponential size in a bad order)
function bddVerilog(cells, driver, cone, rank, name, maxNodes = Infinity) {
  const V = [-1, -1], LO = [0, 1], HI = [0, 1], uniq = new Map(), memo = new Map();
  const mk = (v, lo, hi) => {
    if (lo === hi) return lo;
    const k = `${v},${lo},${hi}`;
    let n = uniq.get(k);
    if (n === undefined) {
      if (V.length > maxNodes) throw TOO_LARGE;
      n = V.length; V.push(v); LO.push(lo); HI.push(hi); uniq.set(k, n);
    }
    return n;
  };
  const top = (f, g, h) => Math.min(...[f, g, h].map(x => (x > 1 ? V[x] : Infinity)));
  const cof = (x, v, b) => (x > 1 && V[x] === v ? (b ? HI[x] : LO[x]) : x);
  const ite = (f, g, h) => {
    if (f === 1) return g;
    if (f === 0) return h;
    if (g === h) return g;
    if (g === 1 && h === 0) return f;
    const k = `${f},${g},${h}`;
    const r0 = memo.get(k);
    if (r0 !== undefined) return r0;
    const v = top(f, g, h);
    const r = mk(v, ite(cof(f, v, 0), cof(g, v, 0), cof(h, v, 0)), ite(cof(f, v, 1), cof(g, v, 1), cof(h, v, 1)));
    memo.set(k, r);
    return r;
  };
  const val = new Map(cone.leaves.map((b, i) => [b, mk(rank[i], 0, 1)]));
  const sig = b => (typeof b === 'number' ? val.get(b) : b === '1' ? 1 : 0);
  try {
    for (const b of cone.order) {
      const c = cells[driver.get(b)], t = lutTable(c), xs = lutInputs(c).map(sig);
      // the LUT as multiplexers over its inputs, its last input at the top
      const tree = (k, base) => (k < 0 ? t[base] : ite(xs[k], tree(k - 1, base | (1 << k)), tree(k - 1, base)));
      val.set(b, tree(xs.length - 1, 0));
    }
  } catch (e) {
    if (e === TOO_LARGE) return null;
    throw e;
  }
  const r = val.get(cone.root ?? cone.order[cone.order.length - 1]);
  const reach = new Set(), st = [r];
  while (st.length) { const x = st.pop(); if (x < 2 || reach.has(x)) continue; reach.add(x); st.push(LO[x], HI[x]); }
  const leafAt = [];
  rank.forEach((lv, i) => { leafAt[lv] = i; });
  const nm = x => (x === 0 ? "1'b0" : x === 1 ? "1'b1" : `n${x}`);
  const lines = [...reach].sort((a, b) => V[b] - V[a]).map(x => `  wire n${x} = x[${leafAt[V[x]]}] ? ${nm(HI[x])} : ${nm(LO[x])};`);
  return `module ${name}(input [${cone.leaves.length - 1}:0] x, output y);\n${lines.join('\n')}\n  assign y = ${nm(r)};\nendmodule\n`;
}

const TOO_LARGE = new Error('BDD too large');

// the orders tried: the leaves as found, then shuffled (a fixed sequence: the same netlist every time)
function orders(n, count) {
  let seed = 1;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: count }, (_, o) => {
    const p = Array.from({ length: n }, (_, i) => i);
    if (o) for (let i = n - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [p[i], p[k]] = [p[k], p[i]]; }
    return p;
  });
}

/** The commands that map the trees of bddFile (modules bdd_<k>_<o>) onto LUT4s, each alone, into out. */
export const bddMapCommands = (bddFile, out) => `read_verilog ${bddFile}; proc; opt; techmap; opt; abc -lut 4 -script ${abcPlain(DEPTH_ABC2)}; opt_clean; write_json ${out}`;
export const BDD_FILE = 'silinx_bdd.v';
const BDD_OUT = 'silinx_bdd.json';

// a mapped tree's LUTs and its depth (from Yosys's $lut cells)
function mapped(mm) {
  const luts = Object.values(mm.cells || {});
  if (luts.some(c => c.type !== '$lut')) return null;
  const drv = new Map(luts.map(c => [c.connections.Y[0], c])), memo = new Map();
  const depth = b => {
    if (memo.has(b)) return memo.get(b);
    const c = drv.get(b);
    const d = c ? 1 + Math.max(0, ...c.connections.A.map(depth)) : 0;
    memo.set(b, d);
    return d;
  };
  return { luts, depth: depth(mm.ports.y.bits[0]), x: mm.ports.x.bits, y: mm.ports.y.bits[0] };
}

// the netlist's largest bit number
function maxBit(mod) {
  let m = 0;
  for (const x of Object.values(mod.netnames || {})) for (const b of x.bits) if (typeof b === 'number' && b > m) m = b;
  for (const c of Object.values(mod.cells)) for (const v of Object.values(c.connections || {})) for (const b of v) if (typeof b === 'number' && b > m) m = b;
  return m;
}

// a cone's value for leaf values (a Map bit -> 0 / 1)
function evaluate(cells, driver, order, root, leafVal) {
  const val = new Map(leafVal);
  const get = b => (typeof b === 'number' ? val.get(b) : b === '1' ? 1 : 0);
  for (const b of order) {
    const c = cells[driver.get(b)];
    let i = 0;
    lutInputs(c).forEach((q, k) => { i |= get(q) << k; });
    val.set(b, lutTable(c)[i]);
  }
  return val.get(root);
}

// the mapped tree in place of the cone of `root`: true when spliced (it computes the same function on every row
// checked), false when not (the netlist as it was)
function splice(mod, cand, m, rule, next) {
  const cells = mod.cells;
  const oldDriver = Object.entries(cells).find(([, c]) => isLut(c.type) && c.connections.O[0] === cand.root)?.[0];
  if (!oldDriver) return false;
  const map = new Map(m.x.map((b, i) => [b, cand.leaves[i]]));
  if (map.has(m.y)) return false;   // (the function is one of its leaves)
  map.set(m.y, cand.root);
  const bit = b => (typeof b === 'string' ? b : map.has(b) ? map.get(b) : (map.set(b, next()), map.get(b)));
  const old = cells[oldDriver].connections.O;
  const id = next();   // (the new cells' names: a cone collapsed again in a later round gets cells of its own)
  cells[oldDriver].connections.O = [next()];
  const added = m.luts.map((c, k) => {
    const w = c.connections.A.length;
    const cell = { hide_name: 1, type: `LUT${w}`, parameters: { INIT: String(c.parameters.LUT).padStart(1 << w, '0') }, attributes: {}, port_directions: { O: 'output' }, connections: { O: [bit(c.connections.Y[0])] } };
    c.connections.A.forEach((a, i) => { cell.port_directions[`I${i}`] = 'input'; cell.connections[`I${i}`] = [bit(a)]; });
    const name = `$silinx_bdd$${id}$${k}`;
    cells[name] = cell;
    return name;
  });
  // the check: the new cone against the old one (its LUTs still there, the old root renamed)
  const { driver } = netlistLevels(mod);
  const newCone = lutCone(cells, driver, cand.root, Infinity);
  const oldDrv = new Map(driver);
  oldDrv.set(cand.root, oldDriver);
  const L = cand.leaves.length, rows = L <= 12 ? 1 << L : rule.checks;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let r = 0; r < rows; r++) {
    const v = new Map(cand.leaves.map((b, i) => [b, L <= 12 ? (r >> i) & 1 : (rnd() < 0.5 ? 1 : 0)]));
    if (evaluate(cells, oldDrv, cand.order, cand.root, v) !== evaluate(cells, driver, newCone.order, cand.root, v)) {
      for (const n of added) delete cells[n];
      cells[oldDriver].connections.O = old;
      return false;
    }
  }
  return true;
}

// the LUTs (and INV, BUF) nothing reads any more
function removeDead(mod) {
  const ports = new Set(Object.values(mod.ports || {}).flatMap(p => p.bits));
  for (let again = true; again;) {
    again = false;
    const read = new Set();
    for (const c of Object.values(mod.cells)) for (const [p, v] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'input') for (const b of v) read.add(b);
    for (const [n, c] of Object.entries(mod.cells)) if (isLut(c.type) && !read.has(c.connections.O[0]) && !ports.has(c.connections.O[0])) { delete mod.cells[n]; again = true; }
  }
}

/** The critical path's wide decodes collapsed and mapped again (run: core/synth-open.js's Yosys runner): { json, rounds,
 *  cones, luts: [before, after], ns: [before, after] }, or null when no cone gets shallower. */
export async function bddRemap(json, top, run, rule = BDD_RULE, log = () => {}) {
  const nl = typeof json === 'string' ? JSON.parse(json) : structuredClone(json);
  const mod = topModule(nl, top);
  const luts0 = lutCount(mod), ns0 = pathEnds(nl, top).worst;
  let rounds = 0, cones = 0, ns = ns0;
  let nb = maxBit(mod);
  const next = () => ++nb;
  while (rounds < rule.rounds) {
    const cands = collapseCandidates(mod, pathEnds(nl, top), rule).slice(0, rule.cones);
    if (!cands.length) break;
    const { driver } = netlistLevels(mod);
    const os = cands.map(c => orders(c.leaves.length, rule.orders));
    const v = cands.flatMap((c, k) => os[k].map((p, o) => bddVerilog(mod.cells, driver, c, p, `bdd_${k}_${o}`, rule.nodes))).filter(Boolean).join('\n');
    if (!v) break;
    const out = await run(['-q', '-p', bddMapCommands(BDD_FILE, BDD_OUT)], { [BDD_FILE]: v }, () => {});
    const mods = JSON.parse(out[BDD_OUT]).modules;
    const before = structuredClone(mod.cells);   // (a large netlist's cells: past a string's length)
    let done = 0;
    for (const [k, c] of cands.entries()) {
      let best = null;
      for (let o = 0; o < os[k].length; o++) {
        const m = mods[`bdd_${k}_${o}`] && mapped(mods[`bdd_${k}_${o}`]);
        if (m && (!best || m.depth < best.depth || (m.depth === best.depth && m.luts.length < best.luts.length))) best = m;
      }
      const ok = best && best.depth < c.level && splice(mod, c, best, rule, next);
      log(`cone ${c.root}: ${c.leaves.length} leaves, ${c.level} levels -> ${best ? `${best.depth} (${best.luts.length} LUTs)` : 'none'}${ok ? '' : ', not spliced'}`);
      if (ok) done++;
    }
    removeDead(mod);
    rounds++;
    // a round kept when it shortens the estimate within the LUTs allowed; else the netlist as before it, and the end
    const nsNow = pathEnds(nl, top).worst;
    log(`round ${rounds}: ${done} cone(s), ${lutCount(mod)} LUTs, ${ns.toFixed(2)} -> ${nsNow.toFixed(2)} ns`);
    if (!done || lutCount(mod) > luts0 * (1 + rule.growth) + rule.extraLuts || nsNow > ns + 1e-9) {
      mod.cells = before;
      break;
    }
    cones += done;
    ns = nsNow;
  }
  if (!cones || ns >= ns0 - 1e-9) return null;
  return { json: nl, rounds, cones, luts: [luts0, lutCount(mod)], ns: [ns0, ns] };
}
