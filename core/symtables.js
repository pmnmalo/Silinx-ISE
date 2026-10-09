// Symbol Info: truth tables of the combinational symbols, computed exactly by building a schematic
// that holds the symbol alone (an I/O marker on each pin), generating its HDL (generateHdl) and
// simulating it (core/schlive.js: compile + elaborate + Simulator) for every input combination.
//
//   import { truthTable, symbolSim } from '/core/symtables.js';
//   const t = truthTable('mux4', { width: 1 });
//   // { kind: 'exhaustive', inCols: [{ label, pin, bit }], outCols, rows: [{ in: '010011', out: '1' }],
//   //   compact: [{ in: '01X1XX', out: '1' }], full: true, perBit: false }
//   // kind 'samples' (too many input bits): { inCols: [{ label, pins }], outCols, rows: [{ in: [text], out: [text] }] }
//   // kind 'none' (sequential symbols, modules, HDL blocks) | 'error' ({ error })
import { SYMBOLS, defaultParams } from './schdoc.js';
import { buildLiveSim } from './schlive.js';
import { oneSymbolDoc } from './symdocs.js';
import * as V from './values.js';

export const MAX_FULL = 6;          // input bits of a complete table shown row by row
export const MAX_EXHAUSTIVE = 8;    // input bits simulated exhaustively (larger: representative rows)
export const MAX_COMPACT = 16;      // rows of a compact table of more than MAX_FULL input bits
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const isSeq = type => !!SYMBOLS[type]?.ff || type === 'register' || type === 'counter';
const bitwise = type => !!SYMBOLS[type]?.gate || ['mux2', 'mux4', 'demux'].includes(type);
const big = n => BigInt(n);

/**
 * The symbol alone in a live simulation: { ok, error, ins, outs, apply({pin: bigint}), read() -> {pin: value} }.
 * ins / outs: the I/O markers ({ id, name, dir, width, pin }).
 */
export function symbolSim(type, params = {}, { modules = {}, lang = 'vhdl', hdl, sources = [] } = {}) {
  const { doc, ports } = oneSymbolDoc(type, params, { lang, modules, hdl });
  const r = buildLiveSim(doc, { modules, sources, lang });
  if (!r.ok) return { ok: false, error: r.errors.join('; ') || 'cannot simulate', code: r.code };
  const live = r.live;
  const ins = ports.filter(p => p.dir === 'in'), outs = ports.filter(p => p.dir === 'out');
  for (const p of ins) if (!live.input(p.id)) return { ok: false, error: `input ${p.name} not found in the simulation` };
  return {
    ok: true, live, ins, outs, code: r.code,
    apply(values) {
      for (const p of ins) {
        if (!(p.pin in values)) continue;
        const i = live.input(p.id);
        i.value = BigInt.asUintN(i.width, BigInt(values[p.pin]));
        live.sim.force(i.sig, V.mk(i.width, i.value));
      }
      live.settle();
    },
    read() { return Object.fromEntries(outs.map(p => [p.pin, live.portValue(p.id)])); },
  };
}

// table columns: bus pins split into bits (MSB first); the order of the Xilinx tables (select
// first for multiplexers, indexed pins of decoders / encoders / demultiplexers from the highest)
function orderPins(type, list) {
  const out = [...list];
  if (type === 'mux2' || type === 'mux4') out.sort((a, b) => (/^S/.test(b.pin) ? 1 : 0) - (/^S/.test(a.pin) ? 1 : 0));
  if (['decoder', 'encoder', 'demux'].includes(type)) {
    // reverse each run of indexed single pins (A0 A1 A2 -> A2 A1 A0), keep the runs in place
    const res = [];
    for (let i = 0; i < out.length;) {
      const m = /^([A-Z]+)(\d+)$/.exec(out[i].pin);
      let j = i + 1;
      if (m) while (j < out.length && new RegExp(`^${m[1]}\\d+$`).test(out[j].pin)) j++;
      res.push(...out.slice(i, j).reverse());
      i = j;
    }
    return res;
  }
  return out;
}
function bitCols(type, ports) {
  const cols = [];
  for (const p of orderPins(type, ports)) {
    if (p.width === 1) cols.push({ label: p.pin, pin: p.pin, bit: 0 });
    else for (let b = p.width - 1; b >= 0; b--) cols.push({ label: `${p.pin}(${b})`, pin: p.pin, bit: b });
  }
  return cols;
}
const binOf = (v, w) => (v == null || Array.isArray(v) ? 'X'.repeat(w) : V.toBin(v).toUpperCase().padStart(w, '0').slice(-w));

// ------------------------------------------------------------------ compact table (X = any value)
// rows with the same outputs merged into cubes (prime implicants of the input space, then a cover)
export function compactRows(rows, nIn) {
  if (!nIn) return rows.map(r => ({ ...r }));
  const groups = new Map();
  for (const r of rows) { let g = groups.get(r.out); if (!g) groups.set(r.out, g = []); g.push(r.in); }
  const out = [];
  for (const [o, mins] of groups) {
    // prime implicants by repeated merging of cubes that differ in one specified position
    let level = new Set(mins);
    const primes = new Set();
    while (level.size) {
      const next = new Set(), used = new Set();
      const arr = [...level];
      const byMask = new Map();
      for (const c of arr) { const k = c.replace(/[01]/g, '-'); let l = byMask.get(k); if (!l) byMask.set(k, l = []); l.push(c); }
      for (const list of byMask.values()) {
        const set = new Set(list);
        for (const c of list) {
          for (let i = 0; i < c.length; i++) {
            if (c[i] !== '0') continue;
            const d = c.slice(0, i) + '1' + c.slice(i + 1);
            if (set.has(d)) { next.add(c.slice(0, i) + 'X' + c.slice(i + 1)); used.add(c); used.add(d); }
          }
        }
      }
      for (const c of arr) if (!used.has(c)) primes.add(c);
      level = next;
    }
    const covers = (c, m) => [...c].every((x, i) => x === 'X' || x === m[i]);
    const P = [...primes];
    const left = new Set(mins);
    const chosen = [];
    // essential primes first, then the prime covering most of what is left
    for (const m of mins) {
      const cs = P.filter(c => covers(c, m));
      if (cs.length === 1 && !chosen.includes(cs[0])) chosen.push(cs[0]);
    }
    for (const c of chosen) for (const m of [...left]) if (covers(c, m)) left.delete(m);
    while (left.size) {
      let best = null, bn = -1;
      for (const c of P) { if (chosen.includes(c)) continue; let k = 0; for (const m of left) if (covers(c, m)) k++; if (k > bn || (k === bn && (c.split('X').length > best.split('X').length))) { best = c; bn = k; } }
      chosen.push(best);
      for (const m of [...left]) if (covers(best, m)) left.delete(m);
    }
    for (const c of chosen) out.push({ in: c, out: o });
  }
  const key = s => [...s].map(ch => (ch === 'X' ? 'a' : ch === '0' ? 'b' : 'c')).join('');
  out.sort((a, b) => (key(a.in) < key(b.in) ? -1 : key(a.in) > key(b.in) ? 1 : 0));
  return out;
}

// ------------------------------------------------------------------ representative rows
function samples(type, p, ins) {
  const W = Math.max(1, int(p.width, 1));
  const m = (1n << big(W)) - 1n;
  const pairs = list => list.map(([a, b]) => [BigInt(a) & m, BigInt(b) & m]);
  const uniq = vs => { const seen = new Set(); return vs.filter(v => { const k = JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const half = m >> 1n;
  if (type === 'add') {
    const ps = pairs([[0, 0], [1, 1], [5, 3], [100, 27], [m, 1n], [m, m], [half, 1n]]);
    const vs = ps.map(([a, b], i) => ({ A: a, B: b, ...(p.cin ? { CI: big(i % 3 === 2 ? 1 : 0) } : {}) }));
    if (p.cin) vs.push({ A: m, B: 0n, CI: 1n });
    return uniq(vs);
  }
  if (type === 'sub') return uniq(pairs([[0, 0], [9, 4], [4, 9], [m, m], [0, 1], [half + 1n, 1n]]).map(([A, B]) => ({ A, B })));
  if (type === 'compare') return uniq(pairs([[5, 5], [3, 7], [7, 3], [0, m], [m, 0], [half, half + 1n]]).map(([A, B]) => ({ A, B })));
  // a vector of all the input bits (in pin order) -> pin values
  const total = ins.reduce((s, q) => s + q.width, 0);
  const split = v => { const o = {}; let at = 0; for (const q of ins) { o[q.pin] = (v >> big(at)) & ((1n << big(q.width)) - 1n); at += q.width; } return o; };
  const all = (1n << big(total)) - 1n;
  const alt = n => { let v = 0n; for (let i = 0; i < total; i++) if (i % 2 === n) v |= 1n << big(i); return v; };
  const vs = [0n];
  if (type === 'encoder') {
    for (let i = 0; i < total; i++) vs.push(1n << big(i));
    vs.push(1n | (1n << big(total - 1)), 0b110n, all);
  } else vs.push(all, alt(0), alt(1), all >> big(Math.floor(total / 2)), 1n);
  return uniq(vs.map(split));
}
// value text in a table of representative rows
function fmt(type, p, pin, v, w) {
  if (v == null || Array.isArray(v)) return '?';
  if (typeof v === 'bigint') v = V.mk(w, v);
  const bin = V.toBin(v).toUpperCase();
  if (/[^01]/.test(bin)) return bin;
  if (['add', 'sub', 'compare'].includes(type) && w > 1) {
    const u = V.toDec(v, false);
    const signed = (type === 'compare' && p.signed) || type === 'sub';
    if (signed) { const s = V.toDec(v, true); return s === u ? u : `${u} (${s})`; }
    return u;
  }
  if (w <= 16) return bin;
  return `0x${V.toHex(v).toUpperCase()}`;
}
// single-bit pins with indexed names (I0 … I15) shown as one column
function pinGroups(type, ports) {
  const res = [];
  const ordered = orderPins(type, ports);
  for (let i = 0; i < ordered.length;) {
    const m = /^([A-Z]+)(\d+)$/.exec(ordered[i].pin);
    let j = i + 1;
    if (m && ordered[i].width === 1) while (j < ordered.length && ordered[j].width === 1 && new RegExp(`^${m[1]}\\d+$`).test(ordered[j].pin)) j++;
    const g = ordered.slice(i, j);
    res.push(g.length > 2 ? { label: `${g[0].pin}…${g[g.length - 1].pin}`, pins: g.map(q => q.pin), width: g.length } : null);
    if (g.length <= 2) for (const q of g) res.push({ label: q.width > 1 ? `${q.pin}(${q.width - 1}:0)` : q.pin, pins: [q.pin], width: q.width });
    i = j;
  }
  return res.filter(Boolean);
}

/**
 * Truth table of a combinational symbol at the given parameters (see the module header).
 * opts: { modules, maxFull = MAX_FULL, maxExhaustive = MAX_EXHAUSTIVE, lang }.
 */
export function truthTable(type, params = {}, opts = {}) {
  const { modules = {}, maxExhaustive = MAX_EXHAUSTIVE, maxFull = MAX_FULL } = opts;
  if (!SYMBOLS[type] || isSeq(type) || type === 'module' || type === 'hdlblock') return { kind: 'none' };
  let p = { ...defaultParams(type), ...params };
  let perBit = false;
  let sim = symbolSim(type, p, { modules, lang: opts.lang });
  if (!sim.ok) return { kind: 'error', error: sim.error };
  let nIn = sim.ins.reduce((s, q) => s + q.width, 0);
  if (nIn > maxFull && bitwise(type) && int(p.width, 1) > 1) {
    p = { ...p, width: 1 };
    perBit = true;
    sim = symbolSim(type, p, { modules, lang: opts.lang });
    if (!sim.ok) return { kind: 'error', error: sim.error };
    nIn = sim.ins.reduce((s, q) => s + q.width, 0);
  }
  if (nIn <= maxExhaustive) {
    const inCols = bitCols(type, sim.ins), outCols = bitCols(type, sim.outs);
    const rows = [];
    for (let r = 0; r < 2 ** nIn; r++) {
      const bits = nIn ? r.toString(2).padStart(nIn, '0') : '';
      const vals = Object.fromEntries(sim.ins.map(q => [q.pin, 0n]));
      inCols.forEach((c, j) => { if (bits[j] === '1') vals[c.pin] |= 1n << big(c.bit); });
      sim.apply(vals);
      const o = sim.read();
      const ob = outCols.map(c => { const q = sim.outs.find(x => x.pin === c.pin); const s = binOf(o[c.pin], q.width); return s[q.width - 1 - c.bit]; }).join('');
      rows.push({ in: bits, out: ob });
    }
    const compact = compactRows(rows, nIn);
    // beyond maxFull input bits the table is shown only when it compacts well (decoders, encoders)
    if (nIn <= maxFull || compact.length <= MAX_COMPACT) return { kind: 'exhaustive', params: p, perBit, inCols, outCols, rows, compact, full: nIn <= maxFull, nIn };
  }
  // representative rows
  const inG = pinGroups(type, sim.ins), outG = pinGroups(type, sim.outs);
  const rows = [];
  for (const v of samples(type, p, sim.ins)) {
    sim.apply(v);
    const o = sim.read();
    const cell = (g, src, isIn) => {
      if (g.pins.length > 1) return g.pins.map(pn => (isIn ? String(Number(src[pn] ?? 0n)) : binOf(src[pn], 1))).join('');
      const q = (isIn ? sim.ins : sim.outs).find(x => x.pin === g.pins[0]);
      return fmt(type, p, q.pin, src[q.pin], q.width);
    };
    rows.push({ in: inG.map(g => cell(g, v, true)), out: outG.map(g => cell(g, o, false)), values: v });
  }
  return { kind: 'samples', params: p, perBit, inCols: inG, outCols: outG, rows, nIn };
}
