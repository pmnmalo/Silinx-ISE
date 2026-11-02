// Silinx - compiled cycle simulator (#102, #384): the design as one JavaScript function that runs n
// clock cycles, for the Board Emulator's live runs (displays, VGA, long runs at the board's speed).
// The event-driven simulator (core/simulator.js) stays the precise one (X values, delays, waveforms,
// messages); this one computes what the FPGA computes, cycle by cycle, tens of times faster.
//
// The design is read by Yosys at word level: the Verilog Silinx writes for synthesis
// (core/synth-verilog.js toVerilog) through `prep -flatten; memory -nomap` (no technology mapping),
// and its netlist ($add, $eq, $mux, $pmux, $dff, $adff, $mem_v2…, compileNetlist) becomes the code:
//   - every cell output (and input port) is a variable: a number up to 32 bits (its unsigned value),
//     a BigInt above; the combinational cells are computed in topological order as integer operations;
//   - the flip-flops are variables, the memories typed arrays; each starts at its initial value, or 0
//     as on the FPGA after configuration (two-state values: no X, no Z);
//   - the combinational cells in segments, each evaluated only when a value it reads changed (#464: the
//     activity, its guards chosen from a short profile of the code), the results the same;
//   - the main clock's rising edge (and its falling edge, when a flip-flop or the logic uses it) is
//     one step of the loop; every other clock (a counter bit used as a clock, a clock on a button, a
//     gated or inverted clock), the asynchronous resets / loads / sets and the latches are settled
//     after each evaluation: an edge of such a clock fires its flip-flops, the logic is evaluated again
//     until nothing changes;
//   - the Xilinx primitives are Verilog models flattened into the design (core/compiled-prims.js: block
//     RAMs, multipliers, SRL16s, distributed RAMs, clock buffers, and the LUTs, flip-flops, latches and carry
//     chain of a synthesized netlist, #561); a DCM's (or a PLL_BASE's, #845) outputs are variables set by a
//     schedule of their edges in the main clock's cycles (dcmSchedule): the main clock is its input, each
//     cycle's edges are steps of the loop in time order; a DCM whose RST the design drives starts its
//     schedule again after a reset (#465).
// What it cannot compile (a combinational loop, a tristate, an inout port, a primitive with no model
// here, a cascaded DCM with its RST driven) is a CompileError with the reason: the emulator then keeps the
// event-driven simulator.
//
//   const sim = await compileDesign(design, { run })   // run: Yosys (packages/silinx-fpga/src/synth-open-node.js yosysNode, the browser's worker)
//   sim.set('sw', 5); sim.cycle(1000); sim.get('led') -> 0x2an
//
// Isomorphic ES module (browser + Node), no DOM.
import { toVerilog } from './synth-verilog.js';
import { PRIMITIVE_MODELS, bramInit, simprimCell } from './compiled-prims.js';
import { gateModel } from './compiled-tables.js';
import { CompileError, CHUNK, CUT_GAIN, FF, GUARD, HELPERS, PIECE, PMAX, PROFILE, SPLIT, WORTH } from './compiled-helpers.js';
import { mountCells } from './compiled-cells.js';
import { mountExpressions } from './compiled-exprs.js';
import { mountElements } from './compiled-elements.js';
import { mountClocks } from './compiled-clocks.js';
import { mountActivity } from './compiled-activity.js';
import { mountWatch } from './compiled-watch.js';
import { mountSteps } from './compiled-steps.js';
import { mountGenerate } from './compiled-generate.js';
export { VGA_W, VGA_H, VGA_TOTAL_W, VGA_BEFORE_X, VGA_BEFORE_Y, VGA_STATE } from './compiled-vga.js';
export { chunks } from './compiled-helpers.js';

export { CompileError };

/** The Yosys commands that read the design at word level (after read_verilog). */
// (#629: a gate-level model, its LUTs a design's logic bit by bit, with its constants folded after the flatten
// (opt_expr -full: the carry chain's constant multiplexers): faster; a behavioural design is slower with it)
export const prepCommands = (top, { gates = false } = {}) => `prep -flatten -top ${top}; ${gates ? 'opt_expr -full; ' : ''}memory -nomap; opt_clean -purge`;
/** Is a design of these primitives a gate-level model (a synthesized netlist: LUTs, SIMPRIM's X_LUTs)? */
export const gateLevel = primitives => primitives.some(p => /^(X_)?LUT\d/.test(p));

/**
 * The design's word-level netlist (Yosys's JSON, parsed): { json, top, warnings: [messages] }.
 * run(args, files, onLine): Yosys (as core/synth-front.js synthesizeOpen's); words: a gate-level model at word level
 * and its irregular logic as tables (core/compiled-words.js, #650, core/compiled-tables.js, #659; false: bit by bit, as
 * Yosys reads it).
 */
export async function netlistOf(design, { run, words = true }) {
  let v;
  // (the SIMPRIM primitives of a post-translate / map / place & route model as their cells, #627)
  try { v = toVerilog(design, { simprim: simprimCell }); } catch (e) { throw new CompileError(e.message); }
  const missing = v.primitives.filter(p => !PRIMITIVE_MODELS[p]);
  if (missing.length) throw new CompileError(`the compiled simulator has no model of ${missing.join(', ')}`);
  // (the primitives' models: core/compiled-prims.js)
  const lib = v.primitives.map(p => (typeof PRIMITIVE_MODELS[p] === 'function' ? PRIMITIVE_MODELS[p]() : PRIMITIVE_MODELS[p])).join('\n');
  const files = { [`${v.top}_cs.v`]: v.text, ...(lib && { 'silinx_cs_prims.v': lib }) };
  const lines = [];
  let out;
  try {
    out = await run(['-q', '-p', `${lib ? 'read_verilog silinx_cs_prims.v; ' : ''}read_verilog -sv ${v.top}_cs.v; ${prepCommands(v.top, { gates: gateLevel(v.primitives) })}; write_json ${v.top}_cs.json`], files, l => lines.push(l));
  } catch (e) { throw new CompileError(lines.find(l => /^ERROR:/.test(l))?.replace(/^ERROR:\s*/, '') || e.message); }
  const text = out[`${v.top}_cs.json`];
  if (!text) throw new CompileError('Yosys wrote no netlist');
  // the warnings: those of the synthesis Verilog's writer, then Yosys's (but how it holds an array, as
  // registers or as a memory, which changes nothing here; a DCM's real generic kept as a string, as read here;
  // and those of the primitives' own models, their latches and FDCP's asynchronous load, #561)
  const quiet = l => /^Warning: Replacing memory \S+ with list of registers\./.test(l) || /^(\S+: )?Warning: Replacing floating point parameter /.test(l)
    || l.includes('silinx_cs_prims.v');
  // (#650: a gate-level model's carry chains, registers and the logic between them at word level again; #659: its
  // irregular logic as tables)
  const json = bramInit(JSON.parse(text), v.top, v.instances);
  return { json: words && gateLevel(v.primitives) ? gateModel(json, v.top).json : json, top: v.top, warnings: [...v.warnings, ...lines.filter(l => /^Warning:/.test(l) && !quiet(l)).map(yosysWarning)] };
}

// a Yosys warning as Silinx says it (a latch: the signal's name, without Yosys's process and cell names)
function yosysWarning(l) {
  const m = /^Warning: Latch inferred for signal `\\[^.]*\.\\?([^']+)'/.exec(l);
  return m ? `latch inferred for '${m[1]}'` : l.replace(/^Warning:\s*/, '').replace(/`\\?([^']+)'/g, "'$1'");
}

/** The design compiled (run: Yosys; clock: the main clock's port, else found; wide: as compileNetlist's): a CompiledSim. */
export async function compileDesign(design, { run, clock = null, wide = false } = {}) {
  const { json, top, warnings } = await netlistOf(design, { run });
  const model = compileNetlist(json, { top, clock, wide });
  return Object.assign(new CompiledSim(model), { warnings: [...warnings, ...model.warnings] });
}

// The segments of the blocks (compileNetlist's activity): consecutive blocks evaluated together when a value
// one of them reads changed, chosen to evaluate the fewest cells per cycle, guards counted (dynamic
// programming): a segment of C cells costs GUARD + p * C, p the chance one of its values changed (the sum of
// their rates, up to 1), or C unguarded (when it reads a value that changes at every step, or p is high).
// blocks: [{ cells, keys, always, weight }] in order (weight: the block's cost as cells, #670; else its cells); rate:
// Map(key -> changes per evaluation). The segments, with their cost: the cells evaluated per step, guards counted.
export function segmentsOf(blocks, rate, maxLen = 400) {
  const m = blocks.length, best = new Float64Array(m + 1), from = new Int32Array(m + 1), guarded = new Uint8Array(m + 1);
  for (let j = 1; j <= m; j++) {
    best[j] = Infinity;
    const keys = new Set();
    let C = 0, p = 0, always = false;
    for (let i = j; i >= 1 && j - i < maxLen; i--) {
      const b = blocks[i - 1];
      C += b.weight ?? b.cells.length;
      always ||= b.always;
      for (const k of b.keys) if (!keys.has(k)) { keys.add(k); p += rate.get(k) || 0; }
      const g = always || p > PMAX ? Infinity : GUARD + p * C;
      const cost = best[i - 1] + Math.min(C, g);
      if (cost < best[j]) { best[j] = cost; from[j] = i - 1; guarded[j] = g < C ? 1 : 0; }
    }
  }
  const segs = [];
  for (let j = m; j > 0; j = from[j]) {
    const bl = blocks.slice(from[j], j);
    // (two unguarded segments side by side: one)
    if (!guarded[j] && segs.length && !segs[0].keys) segs[0].blocks.unshift(...bl);
    else segs.unshift({ blocks: bl, keys: guarded[j] ? new Set(bl.flatMap(b => b.keys)) : null });
  }
  segs.cost = best[m];
  return segs;
}

// (#670) The blocks in an order their dependencies keep, those evaluated at most steps (reading a value that changes
// at every step, or more often than PMAX) together, the others together, so that segmentsOf finds long segments
// of either kind: the blocks ready, the next of the same kind as the last first, else the first in their order.
export function clustered(blocks, rate) {
  const hot = b => b.always || b.keys.reduce((p, k) => p + (rate.get(k) || 0), 0) > PMAX;
  const index = new Map(blocks.map((b, i) => [b, i])), users = new Map(blocks.map(b => [b, []])), left = new Map();
  for (const b of blocks) {
    const deps = [...(b.deps || [])].filter(d => index.has(d));
    left.set(b, deps.length);
    deps.forEach(d => users.get(d).push(b));
  }
  const ready = blocks.filter(b => !left.get(b)), out = [];
  let last = null;
  while (ready.length) {
    let k = ready.findIndex(b => hot(b) === last);
    if (k < 0) k = 0;
    const b = ready.splice(k, 1)[0];
    out.push(b);
    last = hot(b);
    for (const u of users.get(b)) if (left.set(u, left.get(u) - 1).get(u) === 0) {
      // (kept in their first order)
      const i = ready.findIndex(r => index.get(r) > index.get(u));
      ready.splice(i < 0 ? ready.length : i, 0, u);
    }
  }
  return out;
}

/** The netlist's bit for bit `pos` (0: the least significant) of the port `name` of module `top`, for watch. */
export function portBit(json, top, name, pos = 0) {
  const bits = json.modules[top]?.ports?.[name]?.bits;
  if (!bits || pos >= bits.length) throw new Error(`no port '${name}'${bits ? ` bit ${pos}` : ''}`);
  return bits[pos];
}

/**
 * Compile a word-level netlist (Yosys's JSON after prepCommands) into a model for CompiledSim:
 * { code, inputs: [{ name, v, w, kind }], ports, nets: Map(name -> bits), src: Map(bit -> [var, off]),
 *   vars: [{ w, kind }], warnings: [messages], clock: { port } | null, stats }.
 * o: { top, clock: the main clock's port name (null: the input that clocks the most flip-flops; false: none,
 *      every clock then settled as the other clocks are: a clock on a button), wide: every value a BigInt
 *      (to test that code), watch: what each cycle counts (CompiledSim.take), activity: the combinational
 *      cells evaluated only when what they read changed (#464; false: all of them every step; 'fine', 'max':
 *      the most guards, the fewest, to test that code), profile: the cycles run to choose the guards, split / chunk:
 *      the code's characters above which run() is split, and its functions' at most (#629: SPLIT, CHUNK) }
 * watch: { levels: [{ bit, on }] (the cycles a bit is at `on`), pairs: [[{ bit, on }, { bit, on }]] (the cycles
 *   both are), edges: [{ bit, capture: [bits] }] (each falling edge of the bit: the cycle and the captured
 *   bits' value, up to 32), vga: { hs, vs, rgb: [bits] } (a VGA monitor: VGA_CODE), uart: { tx } (each change of the bit:
 *   its cycle and level, #2536) }, the bits as in the
 *   netlist (portBit), sampled in every cycle before its clock edge (the values the cycle shows).
 */
export function compileNetlist(json, { top, clock = null, wide = false, watch = null, activity = true, profile = PROFILE, split: splitAt = SPLIT, chunk = CHUNK } = {}) {
  const mod = json.modules[top] || Object.values(json.modules).find(m => m.attributes?.top) || Object.values(json.modules)[0];
  if (!mod) throw new CompileError('the netlist has no module');
  const vars = [];                 // { w, kind }
  const src = new Map();           // bit -> [var, offset]
  const newVar = (w) => { vars.push({ w, kind: wide || w > 32 ? 'b' : 'n' }); return vars.length - 1; };
  const drive = (bits, v) => bits.forEach((b, i) => { if (typeof b === 'number') src.set(b, [v, i]); });
  const names = [];                // cell names for the messages
  const cellName = (n) => n.replace(/^\$[^$]*\$/, '').replace(/\$\d+$/, '');

  // ---- the netlist read: the ports, the cells' outputs as variables, the memories (compiled-cells.js)
  const { comb, dcms, elems, inputs, mems, ports } = mountCells({
    wide, cellName, drive, mod, names, newVar, vars
  });

  // ---- expressions: a list of bits as a value of a kind, the combinational cells in order (compiled-exprs.js)
  const { cellExpr, combOf, inBits, order, rdExpr, sig, warnings } = mountExpressions({
    wide, cellName, comb, elems, mod, src, vars
  });

  // ---- the clocked and asynchronous elements (compiled-elements.js)
  const { async, commit, pol, sample, vk } = mountElements({
    rdExpr, sig, vars
  });

  // ---- clock domains: the main clock, the other clocks, the DCMs' schedules (compiled-clocks.js)
  const { asyncEls, clkBit, derived, groups, main, mainPort, needFall, negMain, onMain, posMain, sched, unread, usesMain } = mountClocks({
    clock, watch, async, cellName, comb, dcms, elems, inBits, inputs, pol, ports, vars
  });

  // ---- activity (#464): the combinational cells in blocks by the values they read (compiled-activity.js)
  const { always, blocksOf, weightOf } = mountActivity({
    activity, cellExpr, clkBit, combOf, dcms, inBits, main, mainPort, mems, onMain, order, src, usesMain,
    vars
  });

  let blockOrder = blocksOf();

  // ---- the main clock's edges, the settling, what each cycle counts (compiled-watch.js)
  const { ckSet, count, counted, dlist, edgeCode, edges, fire, flush, flushFn, levels, pairs, settleCode, uartCode, vgaCode, watched } = mountWatch({
    watch, async, asyncEls, commit, derived, main, mainPort, pol, sample, sig, src
  });

  // ---- the loop's steps and the template of the code (compiled-steps.js)
  const { memChars, templateOf } = mountSteps({
    watch, ckSet, count, counted, dlist, edgeCode, edges, elems, fire, flush, flushFn, groups, inputs, levels, mems,
    needFall, negMain, pairs, posMain, sched, settleCode, sig, uartCode, vars, vgaCode, vk, watched
  });

  // ---- the code of the segments (compiled-generate.js)
  const { generate } = mountGenerate({
    chunk, splitAt, always, cellExpr, inputs, memChars, negMain, posMain, src, templateOf, vars, vk
  });

  // the segments: one, unguarded, without activity; else the profile of the blocks' code (the cycles of a run
  // from the start, `profile` of them) chooses them (segmentsOf); 'fine': each block guarded, 'max': the fewest
  // guarded segments (every rate 0), to test the code
  const fine = blockOrder.map(b => ({ blocks: [b], keys: b.always ? null : new Set(b.keys) }));
  let segs = [{ blocks: blockOrder, keys: null }], work = null;
  if (activity === 'fine') segs = fine;
  else if (activity === 'max') segs = segmentsOf(blockOrder, new Map());
  else if (activity && profile > 0 && blockOrder.some(b => !b.always)) {
    // (the rates: each key's changes per evaluation)
    const profileOf = () => {
      const fine = blockOrder.map(b => ({ blocks: [b], keys: b.always ? null : new Set(b.keys) }));
      const keys = [...new Set(fine.flatMap(sg => (sg.keys ? [...sg.keys] : [])))];
      const P = new Float64Array(Math.ceil((keys.length + 1) / 32) * 32 + 1);
      new Function('H', generate(fine, true))({ ...HELPERS, Error: CompileError, P }).run(profile);
      return { rate: new Map(keys.map((k, i) => [k, P[i + 1] / Math.max(1, P[P.length - 1])])) };
    };
    try {
      const { rate } = profileOf();
      // (#670: a cut whose value changes about as often as what it reads, no cut: its readers read that, and its
      // test of its changes is saved; the rates of what it reads are the profile's already)
      const changes = new Map();   // 'v<var>' -> its changes per evaluation (the most of its keys')
      for (const [k, r] of rate) { const base = k.split('&')[0]; changes.set(base, Math.max(changes.get(base) ?? 0, r)); }
      let pruned = false;
      for (const n of order) {
        const out = changes.get(`v${n.y}`);
        if (!n.cut || out == null) continue;
        const pin = n.reads.always ? 1 : Math.min(1, [...n.reads.keys].reduce((p, k) => p + (rate.get(k) || 0), 0));
        if (out > CUT_GAIN * pin) { n.nocut = true; pruned = true; }
      }
      if (pruned) blockOrder = blocksOf();
      const g = segmentsOf(clustered(blockOrder, rate), rate);
      // (worth its overhead, the dirty bits and the values kept from step to step, when it evaluates at most
      // half the cells)
      if (g.cost <= WORTH * blockOrder.reduce((a, b) => a + b.weight, 0)) { segs = g; work = g.cost; }
    } catch { /* (a design that does not settle: unguarded, the error is CompiledSim's) */ }
  }
  const code = generate(segs);
  const all = order.reduce((a, n) => a + weightOf(n), 0);
  const nets = new Map();
  for (const [name, n] of Object.entries(mod.netnames || {})) if (!n.hide_name && !n.bits.some(b => unread.has(b))) nets.set(name, n.bits);
  for (const p of ports) nets.set(p.name, p.bits);
  return {
    code, inputs, ports, nets, src, vars, warnings,
    clock: mainPort ? { port: mainPort.name } : null,
    stats: { cells: names.length, comb: order.length, flipflops: elems.filter(e => FF.has(e.type)).length, memories: mems.length, clocks: dlist.length + (main != null ? 1 : 0), bothEdges: needFall, dcms: dcms.length,
      // (#670: the combinational cells' cost, as cells (their operations), and the part of it a step evaluates, as the
      // profile estimates it, guards and tests of changes counted: all of it unguarded)
      work: { all: +all.toFixed(1), step: +(work ?? all).toFixed(1) } },
  };
}

/** A compiled design running: set(input, value), cycle(n), get(port or net) -> BigInt. */
export class CompiledSim {
  constructor(model) {
    this.model = model;
    this.fn = new Function('H', model.code);
    this.reset();
  }
  /** Back to the state after configuration (the inputs kept). */
  reset() {
    const keep = this.inst ? this.model.inputs.map(p => this.inst.vals()[p.v]) : null;
    this.inst = this.fn({ ...HELPERS, Error: CompileError });
    if (keep) this.model.inputs.forEach((p, i) => this.inst.set(p.v, keep[i]));
    this.cycles = 0;
    this.inst.run(0);
  }
  /** Set an input port (a number or a BigInt); the main clock is driven by cycle(). */
  set(name, value) {
    const p = this.model.inputs.find(i => i.name === name);
    if (!p) throw new Error(`'${name}' is not an input port`);
    const v = BigInt.asUintN(p.w, BigInt(value));
    this.inst.set(p.v, p.kind === 'b' ? v : Number(v));
  }
  /** Run n cycles of the main clock (n = 0: settle after set()). */
  cycle(n = 1) {
    // (#650: in pieces of PIECE cycles, the same values and counts: V8 optimizes a run() called again and again by
    // its calls, with Turbofan; a run() of millions of cycles, by on-stack replacement of its loop, which in Chrome
    // leaves a large one in Maglev, 2 to 3 times slower)
    for (let k = n; k > PIECE; k -= PIECE) this.inst.run(PIECE);
    this.inst.run(n > PIECE ? (n - 1) % PIECE + 1 : n);
    this.cycles += n;
  }
  /** What the cycles counted since the last take (compileNetlist's watch): { counts: [levels…, pairs…],
   *  edges: [cycle, captured, cycle, captured…] } (the cycles counted from the start of each run). */
  take() { return this.inst.take(); }
  /** The VGA monitor (compileNetlist's watch.vga): { state: VG (VGA_STATE's values), fb } or null. */
  get vga() { return this.inst.vga || null; }
  /** The serial port's TX (compileNetlist's watch.uart): its changes since the last take(), [cycle, level…] (the cycles from the start), or null. */
  get uart() { return this.inst.uart || null; }
  /** The value of a port or a named net (BigInt). */
  get(name) {
    const bits = this.model.nets.get(name);
    if (!bits) throw new Error(`no port or net '${name}'`);
    return this.bits(bits);
  }
  bits(bits) {
    const vals = this.inst.vals();
    let v = 0n;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      const s = typeof b === 'number' ? this.model.src.get(b) : null;
      const bit = s ? (BigInt(vals[s[0]]) >> BigInt(s[1])) & 1n : b === '1' ? 1n : 0n;
      v = (v << 1n) | bit;
    }
    return v;
  }
}
