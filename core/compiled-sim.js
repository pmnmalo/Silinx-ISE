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
//   - the main clock's rising edge (and its falling edge, when a flip-flop or the logic uses it) is
//     one step of the loop; every other clock (a counter bit used as a clock, a clock on a button, a
//     gated or inverted clock), the asynchronous resets / loads / sets and the latches are settled
//     after each evaluation: an edge of such a clock fires its flip-flops, the logic is evaluated again
//     until nothing changes.
// What it cannot compile (a combinational loop, a tristate, an inout port, a primitive with no model
// here) is a CompileError with the reason: the emulator then keeps the event-driven simulator.
//
//   const sim = await compileDesign(design, { run })   // run: Yosys (core/synth-open-node.js yosysNode, the browser's worker)
//   sim.set('sw', 5); sim.cycle(1000); sim.get('led') -> 0x2an
//
// Isomorphic ES module (browser + Node), no DOM.
import { toVerilog } from './synth-verilog.js';

export class CompileError extends Error {}

/** The Yosys commands that read the design at word level (after read_verilog). */
export const prepCommands = top => `prep -flatten -top ${top}; memory -nomap; opt_clean -purge`;

// The Xilinx primitives the compiled simulator has a model of: the buffers (wires, for a cycle simulator)
const PRIMITIVE_MODELS = {
  BUF: 'module BUF(output O, input I); assign O = I; endmodule',
  BUFG: 'module BUFG(output O, input I); assign O = I; endmodule',
  BUFGP: 'module BUFGP(output O, input I); assign O = I; endmodule',
  IBUF: 'module IBUF(output O, input I); assign O = I; endmodule',
  IBUFG: 'module IBUFG(output O, input I); assign O = I; endmodule',
  OBUF: 'module OBUF(output O, input I); assign O = I; endmodule',
  INV: 'module INV(output O, input I); assign O = ~I; endmodule',
};

/**
 * The design's word-level netlist (Yosys's JSON, parsed): { json, top, warnings: [messages] }.
 * run(args, files, onLine): Yosys (as core/synth-open.js synthesizeOpen's).
 */
export async function netlistOf(design, { run }) {
  let v;
  try { v = toVerilog(design); } catch (e) { throw new CompileError(e.message); }
  const missing = v.primitives.filter(p => !PRIMITIVE_MODELS[p]);
  if (missing.length) throw new CompileError(`the compiled simulator has no model of ${missing.join(', ')}`);
  const lib = v.primitives.map(p => PRIMITIVE_MODELS[p]).join('\n');
  const files = { [`${v.top}_cs.v`]: v.text, ...(lib && { 'silinx_cs_prims.v': lib }) };
  const lines = [];
  let out;
  try {
    out = await run(['-q', '-p', `${lib ? 'read_verilog silinx_cs_prims.v; ' : ''}read_verilog -sv ${v.top}_cs.v; ${prepCommands(v.top)}; write_json ${v.top}_cs.json`], files, l => lines.push(l));
  } catch (e) { throw new CompileError(lines.find(l => /^ERROR:/.test(l))?.replace(/^ERROR:\s*/, '') || e.message); }
  const text = out[`${v.top}_cs.json`];
  if (!text) throw new CompileError('Yosys wrote no netlist');
  // the warnings: those of the synthesis Verilog's writer, then Yosys's (but how it holds an array, as
  // registers or as a memory, which changes nothing here)
  const quiet = l => /^Warning: Replacing memory \S+ with list of registers\./.test(l);
  return { json: JSON.parse(text), top: v.top, warnings: [...v.warnings, ...lines.filter(l => /^Warning:/.test(l) && !quiet(l)).map(yosysWarning)] };
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

// ------------------------------------------------------------------ parameters, constants
const int = s => (typeof s === 'number' ? s : parseInt(String(s).replace(/[xz]/gi, '0'), 2));
// a parameter's bits, least significant first (x / z as 0)
const pbits = s => (typeof s === 'number' ? s.toString(2) : String(s)).split('').reverse().map(c => (c === '1' ? 1 : 0));
const bigOf = bits => { let v = 0n; for (let i = bits.length - 1; i >= 0; i--) v = (v << 1n) | BigInt(bits[i]); return v; };

// code of a value in a kind: 'n' (a number, unsigned, up to 32 bits) or 'b' (a BigInt)
const lit = (v, kind) => (kind === 'b' ? `${BigInt(v)}n` : String(Number(v)));
const mN = (e, w) => (w >= 32 ? `((${e}) >>> 0)` : `((${e}) & ${2 ** w - 1})`);
const sN = (e, w) => (w >= 32 ? `((${e}) | 0)` : `(((${e}) << ${32 - w}) >> ${32 - w})`);   // the signed value
const fix32 = (e, w) => (w >= 32 ? `((${e}) >>> 0)` : e);
const extN = (e, fw, tw, signed) => (tw === fw ? e : tw < fw ? mN(e, tw) : signed ? mN(sN(e, fw), tw) : e);
const mB = (e, w) => `BigInt.asUintN(${w}, ${e})`;
const sB = (e, w) => `BigInt.asIntN(${w}, ${e})`;
const extB = (e, fw, tw, signed) => (tw === fw ? e : tw < fw ? mB(e, tw) : signed ? mB(sB(e, fw), tw) : e);
const conv = (e, from, to) => (from === to ? e : to === 'b' ? `BigInt(${e})` : `Number(${e})`);

// the helpers the generated code calls (H)
const HELPERS = {
  par(x) { x ^= x >>> 16; x ^= x >>> 8; x ^= x >>> 4; x ^= x >>> 2; x ^= x >>> 1; return x & 1; },
  parB(x) { let p = 0; while (x) { p ^= Number(x & 1n); x >>= 1n; } return p; },
  dvT: (a, b) => (b === 0 ? 0 : Math.trunc(a / b)),
  mdT: (a, b) => (b === 0 ? 0 : a % b),
  dvF: (a, b) => (b === 0 ? 0 : Math.floor(a / b)),
  mdF(a, b) { if (b === 0) return 0; const r = a % b; return r !== 0 && (r < 0) !== (b < 0) ? r + b : r; },
  dvTB: (a, b) => (b === 0n ? 0n : a / b),
  mdTB: (a, b) => (b === 0n ? 0n : a % b),
  dvFB(a, b) { if (b === 0n) return 0n; const q = a / b; return (a % b !== 0n) && ((a < 0n) !== (b < 0n)) ? q - 1n : q; },
  mdFB(a, b) { if (b === 0n) return 0n; const r = a % b; return r !== 0n && (r < 0n) !== (b < 0n) ? r + b : r; },
  shN(a, s, w) { return s < 0 ? (-s >= w ? 0 : a << -s) : (s >= w ? 0 : a >>> s); },
  shB(a, s, w) { return s < 0n ? (-s >= BigInt(w) ? 0n : a << -s) : a >> s; },
};

const IGNORED = new Set(['$scopeinfo', '$print', '$check', '$assert', '$assume', '$cover', '$live', '$fair', '$specify2', '$specify3', '$specrule']);
const FF = new Set(['$dff', '$dffe', '$adff', '$adffe', '$sdff', '$sdffe', '$sdffce', '$aldff', '$aldffe', '$dffsr', '$dffsre', '$dlatch', '$adlatch']);
const COMB = new Set(['$not', '$pos', '$neg', '$and', '$or', '$xor', '$xnor', '$reduce_and', '$reduce_or', '$reduce_xor', '$reduce_xnor', '$reduce_bool',
  '$logic_not', '$logic_and', '$logic_or', '$eq', '$ne', '$eqx', '$nex', '$lt', '$le', '$gt', '$ge', '$add', '$sub', '$mul', '$div', '$mod', '$divfloor', '$modfloor',
  '$shl', '$sshl', '$shr', '$sshr', '$shift', '$shiftx', '$mux', '$pmux', '$bmux', '$demux', '$bwmux', '$lut']);
const UNARY = new Set(['$not', '$pos', '$neg', '$reduce_and', '$reduce_or', '$reduce_xor', '$reduce_xnor', '$reduce_bool', '$logic_not']);
const SHIFTS = new Set(['$shl', '$sshl', '$shr', '$sshr', '$shift', '$shiftx']);
const CMP = { $eq: '===', $ne: '!==', $eqx: '===', $nex: '!==', $lt: '<', $le: '<=', $gt: '>', $ge: '>=' };
const SETTLE_LIMIT = 10000;

/**
 * Compile a word-level netlist (Yosys's JSON after prepCommands) into a model for CompiledSim:
 * { code, inputs: [{ name, v, w, kind }], ports, nets: Map(name -> bits), src: Map(bit -> [var, off]),
 *   vars: [{ w, kind }], warnings: [messages], clock: { port } | null, stats }.
 * o: { top, clock: the main clock's port name (else the input that clocks the most flip-flops),
 *      wide: every value a BigInt (to test that code) }
 */
export function compileNetlist(json, { top, clock = null, wide = false } = {}) {
  const mod = json.modules[top] || Object.values(json.modules).find(m => m.attributes?.top) || Object.values(json.modules)[0];
  if (!mod) throw new CompileError('the netlist has no module');
  const vars = [];                 // { w, kind }
  const src = new Map();           // bit -> [var, offset]
  const newVar = (w) => { vars.push({ w, kind: wide || w > 32 ? 'b' : 'n' }); return vars.length - 1; };
  const drive = (bits, v) => bits.forEach((b, i) => { if (typeof b === 'number') src.set(b, [v, i]); });
  const names = [];                // cell names for the messages
  const cellName = (n) => n.replace(/^\$[^$]*\$/, '').replace(/\$\d+$/, '');

  // ---- ports
  const inputs = [], ports = [];
  for (const [name, p] of Object.entries(mod.ports || {})) {
    if (p.direction === 'inout') throw new CompileError(`the inout port '${name}' (a tristate) cannot be compiled`);
    ports.push({ name, dir: p.direction, bits: p.bits });
    if (p.direction === 'input') {
      const v = newVar(p.bits.length);
      drive(p.bits, v);
      inputs.push({ name, v, w: p.bits.length, kind: vars[v].kind, bits: p.bits });
    }
  }
  // ---- initial values (the init attributes of the wires)
  const init = new Map();
  for (const n of Object.values(mod.netnames || {})) {
    const iv = n.attributes?.init;
    if (iv == null) continue;
    const b = pbits(iv);
    n.bits.forEach((bit, i) => { if (typeof bit === 'number' && b[i]) init.set(bit, 1); });
  }

  // ---- cells: outputs as variables
  const comb = [], elems = [], mems = [];
  for (const [cname, c] of Object.entries(mod.cells || {})) {
    const t = c.type, P = c.parameters || {}, C = c.connections || {};
    if (IGNORED.has(t)) continue;
    names.push(cname);
    if (COMB.has(t)) {
      const v = newVar(C.Y.length);
      drive(C.Y, v);
      comb.push({ name: cname, type: t, P, C, y: v });
    } else if (FF.has(t)) {
      const v = newVar(C.Q.length);
      drive(C.Q, v);
      elems.push({ name: cname, type: t, P, C, q: v, init: bigOf(C.Q.map(b => init.get(b) || 0)) });
    } else if (t === '$mem_v2') {
      mems.push({ name: cname, P, C });
    } else if (t === '$tribuf' || t === '$_TBUF_') {
      throw new CompileError(`the tristate buffer '${cellName(cname)}' cannot be compiled`);
    } else {
      throw new CompileError(`the cell '${cellName(cname)}' (${t}) has no compiled model`);
    }
  }
  // memories: the read ports' data (asynchronous ports: combinational; synchronous: registers)
  for (const [k, m] of mems.entries()) {
    const P = m.P, C = m.C;
    const width = int(P.WIDTH), size = int(P.SIZE), abits = int(P.ABITS), offset = int(P.OFFSET);
    const nr = int(P.RD_PORTS), nw = int(P.WR_PORTS);
    if (pbits(P.RD_WIDE_CONTINUATION).some(Boolean) || pbits(P.WR_WIDE_CONTINUATION).some(Boolean))
      throw new CompileError(`the memory '${cellName(m.name)}' has wide ports: not compiled yet`);
    const wrClk = pbits(P.WR_CLK_ENABLE);
    for (let j = 0; j < nw; j++) if (!wrClk[j]) throw new CompileError(`the memory '${cellName(m.name)}' has an asynchronous write port: not compiled`);
    Object.assign(m, { k, width, size, abits, offset, nr, nw, kind: wide || width > 32 ? 'b' : 'n' });
    const rdClk = pbits(P.RD_CLK_ENABLE), rdPol = pbits(P.RD_CLK_POLARITY);
    const ce = pbits(P.RD_CE_OVER_SRST), tm = pbits(P.RD_TRANSPARENCY_MASK);
    const rinit = pbits(P.RD_INIT_VALUE), rarst = pbits(P.RD_ARST_VALUE), rsrst = pbits(P.RD_SRST_VALUE);
    for (let i = 0; i < nr; i++) {
      const data = C.RD_DATA.slice(i * width, (i + 1) * width), addr = C.RD_ADDR.slice(i * abits, (i + 1) * abits);
      const v = newVar(width);
      drive(data, v);
      const word = bits => bigOf(bits.slice(i * width, (i + 1) * width));
      if (!rdClk[i]) comb.push({ name: m.name, type: '$memrd', mem: m, addr, y: v });
      else {
        elems.push({ name: m.name, type: '$memrd', mem: m, port: i, addr, q: v, init: word(rinit),
          C: { CLK: [C.RD_CLK[i]], EN: [C.RD_EN[i]], ARST: [C.RD_ARST[i]], SRST: [C.RD_SRST[i]] },
          P: { CLK_POLARITY: String(rdPol[i]) }, arst: word(rarst), srst: word(rsrst), ceOverSrst: !!ce[i],
          transparent: Array.from({ length: nw }, (_, j) => !!tm[i * nw + j]) });
      }
    }
    const wrPol = pbits(P.WR_CLK_POLARITY);
    m.writes = [];
    for (let j = 0; j < nw; j++) {
      const w = { name: m.name, type: '$memwr', mem: m, port: j, C: { CLK: [C.WR_CLK[j]] }, P: { CLK_POLARITY: String(wrPol[j]) },
        addr: C.WR_ADDR.slice(j * abits, (j + 1) * abits), data: C.WR_DATA.slice(j * width, (j + 1) * width), en: C.WR_EN.slice(j * width, (j + 1) * width) };
      m.writes.push(w);
      elems.push(w);
    }
  }
  elems.forEach((e, i) => { e.id = i; });

  // ---- expressions: a list of bits as a value of a kind
  function sig(bits, kind) {
    const w = bits.length;
    if (!w) return lit(0, kind);
    const runs = [];   // { v, off, len, pos } | { c: bits, pos, len }
    bits.forEach((b, i) => {
      const s = typeof b === 'number' ? src.get(b) : null;
      const last = runs[runs.length - 1];
      if (!s) {
        const bit = b === '1' ? 1 : 0;   // '0', 'x', 'z', an undriven bit: 0
        if (last && last.c) { last.c.push(bit); last.len++; } else runs.push({ c: [bit], pos: i, len: 1 });
      } else if (last && last.v === s[0] && last.off + last.len === s[1]) last.len++;
      else runs.push({ v: s[0], off: s[1], len: 1, pos: i });
    });
    const parts = [];
    let cst = 0n, shifted = false;
    for (const r of runs) {
      if (r.c) { cst |= bigOf(r.c) << BigInt(r.pos); continue; }
      const vk = vars[r.v].kind, vw = vars[r.v].w, name = `v${r.v}`;
      let e;
      if (vk === 'n') {
        e = r.off ? `(${name} >>> ${r.off})` : name;
        if (r.off + r.len < vw) e = mN(e, r.len);
        if (kind === 'b') e = `BigInt(${e})`;
      } else {
        e = r.off ? `(${name} >> ${r.off}n)` : name;
        if (r.off + r.len < vw) e = `(${e} & ${(1n << BigInt(r.len)) - 1n}n)`;
        if (kind === 'n') e = `Number(${e})`;
      }
      if (r.pos) { e = kind === 'b' ? `(${e} << ${r.pos}n)` : `(${e} << ${r.pos})`; shifted = true; }
      parts.push(e);
    }
    if (cst) parts.push(lit(cst, kind));
    if (!parts.length) return lit(0, kind);
    const e = parts.length === 1 ? parts[0] : `(${parts.join(' | ')})`;
    // (a 32-bit value put together with | or << is a signed int32: made unsigned)
    return kind === 'n' && w >= 32 && (parts.length > 1 || shifted) ? `(${e} >>> 0)` : e;
  }

  const warnings = [];
  if ([...comb, ...elems].some(n => Object.values(n.C || {}).some(bits => bits.includes('z')))) warnings.push("a high-impedance value ('Z') is 0 in the compiled simulator");

  // ---- the combinational cells, in topological order
  const combOf = new Map();   // var -> comb node
  comb.forEach(n => combOf.set(n.y, n));
  const inBits = n => (n.type === '$memrd' ? n.addr : Object.entries(n.C).filter(([p]) => p !== 'Y').flatMap(([, b]) => b));
  const order = [], state = new Map();   // 1 visiting, 2 done
  for (const n of comb) {
    if (state.get(n)) continue;
    const stack = [[n, 0, inBits(n)]];
    state.set(n, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [node, i, bits] = top;
      if (i >= bits.length) { state.set(node, 2); order.push(node); stack.pop(); continue; }
      top[1]++;
      const b = bits[i];
      const s = typeof b === 'number' ? src.get(b) : null;
      const dep = s ? combOf.get(s[0]) : null;
      if (!dep || state.get(dep) === 2) continue;
      if (state.get(dep) === 1) {
        const net = Object.entries(mod.netnames || {}).find(([nm, nn]) => !nn.hide_name && nn.bits.includes(b))?.[0];
        throw new CompileError(`combinational loop${net ? ` through '${net}'` : ` through the cell '${cellName(dep.name)}'`}: not compiled`);
      }
      state.set(dep, 1);
      stack.push([dep, 0, inBits(dep)]);
    }
  }

  const combCode = order.map(n => `v${n.y} = ${conv(cellExpr(n), n.kind, vars[n.y].kind)};`).join('\n');

  // a combinational cell's value (n.kind: the kind it is computed in)
  function cellExpr(n) {
    const t = n.type, P = n.P, C = n.C;
    if (t === '$memrd') {
      const m = n.mem;
      n.kind = m.kind;
      return `(m${m.k}[${sig(n.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}] ?? ${lit(0, m.kind)})`;
    }
    const yw = C.Y.length;
    if (t === '$mux' || t === '$pmux' || t === '$bwmux') {
      const K = n.kind = wide || yw > 32 ? 'b' : 'n';
      if (t === '$mux') return `(${sig(C.S, 'n')} ? ${sig(C.B, K)} : ${sig(C.A, K)})`;
      if (t === '$bwmux') {
        const s = sig(C.S, K);
        return K === 'b' ? `((${sig(C.A, K)} & ~${s} & ${(1n << BigInt(yw)) - 1n}n) | (${sig(C.B, K)} & ${s}))` : fix32(`((${sig(C.A, K)} & ~${s}) | (${sig(C.B, K)} & ${s}))`, yw);
      }
      const sw = C.S.length;
      let e = sig(C.A, K);
      for (let i = sw - 1; i >= 0; i--) e = `(${sig([C.S[i]], 'n')} ? ${sig(C.B.slice(i * yw, (i + 1) * yw), K)} : ${e})`;
      return e;
    }
    if (t === '$bmux') {
      const w = yw, sw = C.S.length, total = w << sw;
      const s = sig(C.S, 'n');
      if (!wide && total <= 32) { n.kind = 'n'; return mN(`(${sig(C.A, 'n')} >>> (${s} * ${w}))`, w); }
      n.kind = 'b';
      return mB(`(${sig(C.A, 'b')} >> BigInt(${s} * ${w}))`, w);
    }
    if (t === '$demux') {
      const w = C.A.length, s = sig(C.S, 'n');
      if (!wide && yw <= 32) { n.kind = 'n'; return fix32(`(${sig(C.A, 'n')} << (${s} * ${w}))`, yw); }
      n.kind = 'b';
      return `(${sig(C.A, 'b')} << BigInt(${s} * ${w}))`;
    }
    if (t === '$lut') {
      const w = int(P.WIDTH), L = bigOf(pbits(P.LUT).slice(0, 1 << w));
      if (!wide && (1 << w) <= 32) { n.kind = 'n'; return `((${Number(L)} >>> ${sig(C.A, 'n')}) & 1)`; }
      n.kind = 'b';
      return `((${L}n >> BigInt(${sig(C.A, 'n')})) & 1n)`;
    }
    const aw = C.A.length, bw = C.B ? C.B.length : 0;
    const as = int(P.A_SIGNED ?? 0) === 1, bs = int(P.B_SIGNED ?? 0) === 1;
    const sg = UNARY.has(t) ? as : as && bs;
    const isShift = SHIFTS.has(t);
    let ww = Math.max(aw, yw, isShift ? 0 : bw);
    if (t === '$div' || t === '$mod' || t === '$divfloor' || t === '$modfloor') ww = Math.max(aw, bw, yw);
    const K = n.kind = wide || ww > 32 || bw > 32 ? 'b' : 'n';
    const a = sig(C.A, K), b = C.B ? sig(C.B, K) : null;
    const N = K === 'n';
    const m = N ? mN : mB, ext = N ? extN : extB, sv = N ? sN : sB;
    const one = lit(1, K), zero = lit(0, K);
    const bool = e => `(${e} ? ${one} : ${zero})`;
    const ones = w => lit((1n << BigInt(w)) - 1n, K);
    switch (t) {
      case '$not': return m(`~${ext(a, aw, yw, as)}`, yw);
      case '$pos': return ext(a, aw, yw, as);
      case '$neg': return m(`-${ext(a, aw, yw, as)}`, yw);
      case '$and': return N ? fix32(`(${ext(a, aw, yw, sg)} & ${ext(b, bw, yw, sg)})`, yw) : `(${ext(a, aw, yw, sg)} & ${ext(b, bw, yw, sg)})`;
      case '$or': return N ? fix32(`(${ext(a, aw, yw, sg)} | ${ext(b, bw, yw, sg)})`, yw) : `(${ext(a, aw, yw, sg)} | ${ext(b, bw, yw, sg)})`;
      case '$xor': return N ? fix32(`(${ext(a, aw, yw, sg)} ^ ${ext(b, bw, yw, sg)})`, yw) : `(${ext(a, aw, yw, sg)} ^ ${ext(b, bw, yw, sg)})`;
      case '$xnor': return m(`~(${ext(a, aw, yw, sg)} ^ ${ext(b, bw, yw, sg)})`, yw);
      case '$reduce_and': return bool(`${a} === ${ones(aw)}`);
      case '$reduce_or': case '$reduce_bool': return bool(`${a} !== ${zero}`);
      case '$reduce_xor': return N ? `H.par(${a})` : `BigInt(H.parB(${a}))`;
      case '$reduce_xnor': return N ? `(H.par(${a}) ^ 1)` : `BigInt(H.parB(${a}) ^ 1)`;
      case '$logic_not': return bool(`${a} === ${zero}`);
      case '$logic_and': return bool(`${a} !== ${zero} && ${b} !== ${zero}`);
      case '$logic_or': return bool(`${a} !== ${zero} || ${b} !== ${zero}`);
      case '$eq': case '$ne': case '$eqx': case '$nex': case '$lt': case '$le': case '$gt': case '$ge':
        return bool(sg ? `${sv(a, aw)} ${CMP[t]} ${sv(b, bw)}` : `${a} ${CMP[t]} ${b}`);
      case '$add': return m(`${ext(a, aw, yw, sg)} + ${ext(b, bw, yw, sg)}`, yw);
      case '$sub': return m(`${ext(a, aw, yw, sg)} - ${ext(b, bw, yw, sg)}`, yw);
      case '$mul': return N ? m(`Math.imul(${ext(a, aw, yw, sg)}, ${ext(b, bw, yw, sg)})`, yw) : m(`${ext(a, aw, yw, sg)} * ${ext(b, bw, yw, sg)}`, yw);
      case '$div': case '$mod': case '$divfloor': case '$modfloor': {
        const fn = { $div: 'dvT', $mod: 'mdT', $divfloor: 'dvF', $modfloor: 'mdF' }[t] + (N ? '' : 'B');
        return m(`H.${fn}(${sg ? sv(a, aw) : a}, ${sg ? sv(b, bw) : b})`, yw);
      }
      case '$shl': case '$sshl':
        return N ? `(${b} >= ${yw} ? 0 : ${m(`${ext(a, aw, yw, as)} << ${b}`, yw)})` : `(${b} >= ${yw}n ? 0n : ${m(`${ext(a, aw, yw, as)} << ${b}`, yw)})`;
      case '$shr': case '$sshr': {
        const sw = Math.max(aw, yw);
        if (t === '$sshr' && as) return N ? m(`${sN(a, aw)} >> (${b} > 31 ? 31 : ${b})`, yw) : m(`${sB(a, aw)} >> ${b}`, yw);
        return N ? `(${b} >= ${sw} ? 0 : ${m(`${ext(a, aw, sw, as)} >>> ${b}`, yw)})` : m(`${ext(a, aw, sw, as)} >> ${b}`, yw);
      }
      case '$shift': case '$shiftx': {
        const sw = Math.max(aw, yw);
        const av = ext(a, aw, sw, t === '$shift' && as);
        const s = bs ? sv(b, bw) : b;
        return N ? m(`H.shN(${av}, ${s}, ${sw})`, yw) : m(`H.shB(${av}, ${s}, ${sw})`, yw);
      }
    }
    throw new CompileError(`the cell '${cellName(n.name)}' (${t}) has no compiled model`);
  }

  // ---- the clocked and asynchronous elements
  // (each clocked one: sample, from the values before the edge, into n<id>; then commit)
  const vk = e => vars[e.q].kind;
  const cst = (bits, kind) => lit(bigOf(bits), kind);
  const pol = (e, p) => int(e.P[p] ?? 1);
  const act = (e, port, p) => `${sig(e.C[port], 'n')} === ${pol(e, p)}`;
  // a vector of per-bit active signals (SET / CLR of $dffsr) as a mask
  const actMask = (e, port, p, w, kind) => {
    const s = sig(e.C[port], kind);
    if (pol(e, p)) return s;
    return kind === 'b' ? `(~${s} & ${(1n << BigInt(w)) - 1n}n)` : mN(`~${s}`, w);
  };
  function sample(e) {
    const q = `v${e.q}`, nn = `n${e.id}`;
    if (e.type === '$memwr') {
      const m = e.mem;
      return `a${e.id} = ${sig(e.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}; ${nn} = ${sig(e.data, m.kind)}; w${e.id} = ${sig(e.en, m.kind)};`;
    }
    const kind = vk(e), w = vars[e.q].w;
    const d = () => sig(e.C.D, kind);
    const en = () => act(e, 'EN', 'EN_POLARITY');
    const val = p => cst(pbits(e.P[p]).slice(0, w), kind);
    let x;
    switch (e.type) {
      case '$dff': x = d(); break;
      case '$dffe': x = `(${en()} ? ${d()} : ${q})`; break;
      case '$adff': x = `(${act(e, 'ARST', 'ARST_POLARITY')} ? ${val('ARST_VALUE')} : ${d()})`; break;
      case '$adffe': x = `(${act(e, 'ARST', 'ARST_POLARITY')} ? ${val('ARST_VALUE')} : ${en()} ? ${d()} : ${q})`; break;
      case '$sdff': x = `(${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${d()})`; break;
      case '$sdffe': x = `(${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${en()} ? ${d()} : ${q})`; break;
      case '$sdffce': x = `(${en()} ? (${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${d()}) : ${q})`; break;
      case '$aldff': x = `(${act(e, 'ALOAD', 'ALOAD_POLARITY')} ? ${sig(e.C.AD, kind)} : ${d()})`; break;
      case '$aldffe': x = `(${act(e, 'ALOAD', 'ALOAD_POLARITY')} ? ${sig(e.C.AD, kind)} : ${en()} ? ${d()} : ${q})`; break;
      case '$dffsr': case '$dffsre': {
        const base = e.type === '$dffsre' ? `(${en()} ? ${d()} : ${q})` : d();
        const set = actMask(e, 'SET', 'SET_POLARITY', w, kind), clr = actMask(e, 'CLR', 'CLR_POLARITY', w, kind);
        x = kind === 'b' ? `((${base} | ${set}) & ~${clr})` : fix32(`((${base} | ${set}) & ~${clr})`, w);
        break;
      }
      case '$memrd': {
        const m = e.mem;
        let rd = `(m${m.k}[${sig(e.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}] ?? ${lit(0, kind)})`;
        // a transparent port reads what a write port of the same edge writes at its address
        e.transparent.forEach((tr, j) => {
          if (!tr) return;
          const wr = m.writes[j];
          const wa = `${sig(wr.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}`, wd = sig(wr.data, kind), we = sig(wr.en, kind);
          const merged = kind === 'b' ? `((r & ~we) | (${wd} & we))` : `(((r & ~we) | (${wd} & we)) >>> 0)`;
          rd = `((r, we) => (${sig(e.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}) === (${wa}) ? ${kind === 'b' ? mB(merged, w) : merged} : r)(${rd}, ${we})`;
        });
        const en1 = `${sig(e.C.EN, 'n')} === 1`, srst = `${sig(e.C.SRST, 'n')} === 1`;
        const srstV = lit(e.srst, kind), arstV = lit(e.arst, kind);
        x = e.ceOverSrst ? `(${en1} ? (${srst} ? ${srstV} : ${rd}) : ${q})` : `(${srst} ? ${srstV} : ${en1} ? ${rd} : ${q})`;
        x = `(${sig(e.C.ARST, 'n')} === 1 ? ${arstV} : ${x})`;
        break;
      }
      default: return '';   // latches: asynchronous only
    }
    return `${nn} = ${x};`;
  }
  function commit(e) {
    if (e.type === '$memwr') {
      const m = e.mem, k = `m${m.k}`, a = `a${e.id}`, we = `w${e.id}`;
      const zero = lit(0, m.kind);
      const merged = m.kind === 'b' ? `(${k}[${a}] & ~${we}) | (n${e.id} & ${we})` : `(${k}[${a}] & ~${we}) | (n${e.id} & ${we})`;
      return `if (${we} !== ${zero} && ${a} >= 0 && ${a} < ${m.size}) ${k}[${a}] = ${merged};`;
    }
    if (e.type === '$dlatch' || e.type === '$adlatch') return '';
    return `v${e.q} = n${e.id};`;
  }
  // the asynchronous part of an element: brings it to its value now; ch = true when it changed
  function async(e) {
    const q = `v${e.q}`;
    const kind = e.q != null ? vk(e) : null, w = e.q != null ? vars[e.q].w : 0;
    const val = p => cst(pbits(e.P[p]).slice(0, w), kind);
    const set = (cond, v) => `if (${cond} && ${q} !== ${v}) { ${q} = ${v}; ch = true; }`;
    switch (e.type) {
      case '$adff': case '$adffe': return set(act(e, 'ARST', 'ARST_POLARITY'), val('ARST_VALUE'));
      case '$aldff': case '$aldffe': return `{ const t = ${sig(e.C.AD, kind)}; ${set(act(e, 'ALOAD', 'ALOAD_POLARITY'), 't')} }`;
      case '$dffsr': case '$dffsre': {
        const s = actMask(e, 'SET', 'SET_POLARITY', w, kind), c = actMask(e, 'CLR', 'CLR_POLARITY', w, kind);
        const t = kind === 'b' ? `((${q} | ${s}) & ~${c})` : fix32(`((${q} | ${s}) & ~${c})`, w);
        return `{ const t = ${t}; if (t !== ${q}) { ${q} = t; ch = true; } }`;
      }
      case '$dlatch': return `{ const t = ${sig(e.C.D, kind)}; ${set(act(e, 'EN', 'EN_POLARITY'), 't')} }`;
      case '$adlatch': return `if (${act(e, 'ARST', 'ARST_POLARITY')}) { ${set('true', val('ARST_VALUE'))} } else { const t = ${sig(e.C.D, kind)}; ${set(act(e, 'EN', 'EN_POLARITY'), 't')} }`;
      case '$memrd': return set(`${sig(e.C.ARST, 'n')} === 1`, lit(e.arst, kind));
    }
    return '';
  }

  // ---- clock domains: the main clock (an input port bit), the other clocks (edges found when settling)
  const clocked = elems.filter(e => e.type !== '$dlatch' && e.type !== '$adlatch');
  const clkBit = e => e.C.CLK[0];
  let main = null;
  if (clock) {
    const p = inputs.find(i => i.name === clock);
    if (!p) throw new CompileError(`the clock '${clock}' is not an input port`);
    main = p.bits[0];
  } else {
    // (the input that clocks the most register bits; of two, the one named clk…)
    const count = new Map();
    for (const e of clocked) {
      const b = clkBit(e);
      if (typeof b === 'number' && inputs.some(i => i.bits.includes(b))) count.set(b, (count.get(b) || 0) + (e.q != null ? vars[e.q].w : 1));
    }
    const named = b => (/^(clk|clock|mclk)/i.test(inputs.find(i => i.bits.includes(b)).name) ? 1 : 0);
    main = [...count].sort((x, y) => y[1] - x[1] || named(y[0]) - named(x[0]))[0]?.[0] ?? null;
  }
  const mainPort = main == null ? null : inputs.find(i => i.bits.includes(main));
  const onMain = clocked.filter(e => clkBit(e) === main);
  const posMain = onMain.filter(e => pol(e, 'CLK_POLARITY') === 1), negMain = onMain.filter(e => pol(e, 'CLK_POLARITY') !== 1);
  const derived = new Map();   // clock bit -> elements
  for (const e of clocked) {
    const b = clkBit(e);
    if (b === main || typeof b !== 'number') continue;   // a constant clock never ticks
    if (!derived.has(b)) derived.set(b, []);
    derived.get(b).push(e);
  }
  // the main clock read by logic (not only by clock pins): its value matters, both edges are steps
  const usesMain = comb.some(n => inBits(n).includes(main))
    || elems.some(e => Object.entries(e.C).some(([p, bits]) => p !== 'CLK' && bits.includes(main)) || (e.addr || []).includes(main) || (e.data || []).includes(main) || (e.en || []).includes(main));
  const needFall = main != null && (negMain.length > 0 || usesMain);
  const asyncEls = elems.filter(e => async(e));

  const fire = els => `${els.map(sample).join('\n')}\n${els.map(commit).join('\n')}`;
  const ckSet = (on) => {
    if (!mainPort) return '';
    const v = `v${mainPort.v}`, off = mainPort.bits.indexOf(main);
    if (mainPort.w === 1) return `${v} = ${lit(on, mainPort.kind)};`;
    return mainPort.kind === 'b' ? `${v} = ${on ? `${v} | ${1n << BigInt(off)}n` : `${v} & ~${1n << BigInt(off)}n`};` : `${v} = ${on ? fix32(`${v} | ${2 ** off}`, mainPort.w) : `${v} & ${~(2 ** off) >>> 0}`};`;
  };
  // settling: the other clocks' edges, then the asynchronous elements
  const dlist = [...derived].map(([b, els], k) => ({ b, k, els, pos: els.filter(e => pol(e, 'CLK_POLARITY') === 1), neg: els.filter(e => pol(e, 'CLK_POLARITY') !== 1) }));
  const settleCode = !dlist.length && !asyncEls.length ? '' : [
    ...dlist.map(d => `{ const k = ${sig([d.b], 'n')}; f${d.k} = p${d.k} !== -1 && k !== p${d.k} ? (k ? 1 : 2) : 0; p${d.k} = k; }`),
    ...(dlist.length ? [
      `if (${dlist.map(d => `f${d.k}`).join(' | ')}) {`,
      ...dlist.map(d => `${d.pos.length ? `if (f${d.k} === 1) { ${d.pos.map(sample).join(' ')} }` : ''} ${d.neg.length ? `if (f${d.k} === 2) { ${d.neg.map(sample).join(' ')} }` : ''}`),
      ...dlist.map(d => `${d.pos.length ? `if (f${d.k} === 1) { ${d.pos.map(commit).join(' ')} }` : ''} ${d.neg.length ? `if (f${d.k} === 2) { ${d.neg.map(commit).join(' ')} }` : ''}`),
      'ch = true; }'] : []),
    ...asyncEls.map(async),
  ].join('\n');

  // ---- the code
  const V = vars.map((_, i) => i);
  const memInit = mems.map(m => {
    const bits = pbits(m.P.INIT ?? '');
    const words = [];
    for (let a = 0; a < m.size; a++) {
      const wbits = bits.slice(a * m.width, (a + 1) * m.width);
      words.push(wbits.some(Boolean) ? bigOf(wbits) : 0n);
    }
    const nz = words.some(x => x);
    if (m.kind === 'b') return `const M${m.k} = ${nz ? `[${words.map(x => `${x}n`).join(',')}]` : `new Array(${m.size}).fill(0n)`};`;
    return `const M${m.k} = ${nz ? `Uint32Array.from([${words.map(Number).join(',')}])` : `new Uint32Array(${m.size})`};`;
  });
  const initOf = i => {
    const e = elems.find(x => x.q === i);
    return lit(e ? e.init : 0n, vars[i].kind);
  };
  const temps = elems.flatMap(e => (e.type === '$memwr' ? [`n${e.id} = ${lit(0, e.mem.kind)}`, `a${e.id} = 0`, `w${e.id} = ${lit(0, e.mem.kind)}`] : e.q != null ? [`n${e.id} = ${lit(0, vk(e))}`] : []));
  const code = `"use strict";
${V.map(i => `let V${i} = ${initOf(i)};`).join('\n')}
${memInit.join('\n')}
${dlist.map(d => `let P${d.k} = -1;`).join('\n')}
function run(n) {
  ${V.length ? `let ${V.map(i => `v${i} = V${i}`).join(', ')};` : ''}
  ${mems.map(m => `const m${m.k} = M${m.k};`).join(' ')}
  ${dlist.length ? `let ${dlist.map(d => `p${d.k} = P${d.k}, f${d.k} = 0`).join(', ')};` : ''}
  ${temps.length ? `let ${temps.join(', ')};` : ''}
  let ph = 0, cy = 0, it = 0, ch = false;
  for (;;) {
${combCode}
    ch = false;
${settleCode}
    if (ch) { if (++it > ${SETTLE_LIMIT}) throw new H.Error('the design does not settle (a loop through a latch or a clock?)'); continue; }
    it = 0;
    if (ph === 0) {
      if (cy === n) break;
      cy++;
      ${needFall ? `${ckSet(1)} ph = 1;` : ''}
${fire(posMain)}
    } else {
      ${ckSet(0)} ph = 0;
${fire(negMain)}
    }
  }
  ${V.map(i => `V${i} = v${i};`).join(' ')}
  ${dlist.map(d => `P${d.k} = p${d.k};`).join(' ')}
}
function set(k, x) { switch (k) { ${inputs.map(p => `case ${p.v}: V${p.v} = x; break;`).join(' ')} } }
function vals() { return [${V.map(i => `V${i}`).join(', ')}]; }
return { run, set, vals, mems: [${mems.map(m => `M${m.k}`).join(', ')}] };
`;
  const nets = new Map();
  for (const [name, n] of Object.entries(mod.netnames || {})) if (!n.hide_name) nets.set(name, n.bits);
  for (const p of ports) nets.set(p.name, p.bits);
  return {
    code, inputs, ports, nets, src, vars, warnings,
    clock: mainPort ? { port: mainPort.name } : null,
    stats: { cells: names.length, comb: order.length, flipflops: elems.filter(e => FF.has(e.type)).length, memories: mems.length, clocks: dlist.length + (main != null ? 1 : 0), bothEdges: needFall },
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
    this.inst.run(n);
    this.cycles += n;
  }
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
