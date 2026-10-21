// Silinx schematic documents (<name>.sch.json): model, symbol library, connectivity,
// HDL generation and HDL -> schematic import. Isomorphic (no DOM).
//
//   import { SYMBOLS, newDoc, normalizeDoc, symbolDef, symbolPins, netlist, generateHdl,
//            schematicFromHdl, modulesFromLibrary } from '/core/schdoc.js';
//
// Document format (version 1, all coordinates in sheet pixels on a GRID = 10 px grid):
//   { version: 3, name, lang: 'vhdl'|'verilog', sheet: { w, h },
//     symbols: [{ id, type, x, y, rot: 0|90|180|270, mirror: bool, name, params: {...}, hdl?: string }],
//     wires:   [{ id, points: [{x,y},...], bus?: bool }],
//     labels:  [{ id, x, y, net }],          // net name attached to the wire point (x,y)
//     ports:   [{ id, name, dir: 'in'|'out'|'inout', width, x, y, type?, side? }],   // I/O markers
//              (side: where the marker's body is from its connection point, W N E S; by default W for
//              an input, E for an output or a bidirectional port, #296)
//     hdl?:    { lang, context, generics: [{ name, type, default }], decls, arch },  // verbatim HDL
//     generatedFile?: 'src/name.vhd',
//     description?: 'text' }                // shown on the sheet, a comment in the generated HDL
//
// (x, y) of a symbol is the top-left corner of its (rotated) bounding box; rotation is clockwise.
// Connectivity is geometric, at the ends only (#678): wire end points, pins and I/O markers at the
// same point connect; a wire passing over a pin or another wire (a segment or a bend of it) does not.
// A connection made in the middle of a wire (a wire ended on its segment, a symbol dropped onto it)
// splits that wire there (splitWiresAt). Labels attach to the wire under them; labels (and I/O
// markers) with the same name join their nets.
import { parse as parseVhdl } from './vhdl/parser.js';
import { parse as parseVerilog } from './verilog/parser.js';
import { clocksOf } from './schematic.js';
import { elaborate } from './elaborate.js';
import { VHDL93_WORDS, VERILOG_WORDS, reservedError } from './reserved.js';
import { DEVICE_PRIMITIVES, primitiveOf, genericValue, initWords } from './primitives.js';

export const GRID = 10;
// 2 (#301): the M4_1's and DEMUX's select bits on pins of their own (a document of version 1 keeps its bus S)
// 3 (#678): connections at the wires' ends only (a document of version 2 has its wires split where
// they connected in their middle: a pin, a marker, a wire end or a bend on them)
export const DOC_VERSION = 3;

const snap = v => Math.round(v / GRID) * GRID;
const r10 = v => Math.ceil(v / GRID) * GRID;
const clone = o => JSON.parse(JSON.stringify(o));
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// ===================================================================== symbol library
const P_WIDTH = { name: 'width', label: 'Width', kind: 'int', default: 1, min: 1, max: 1024 };
const P_INIT = { name: 'init', label: 'INIT', kind: 'select', options: ['0', '1'], default: '0' };

function gateSym(op, n, title) {
  return {
    category: 'Logic', title, gate: op, inputs: n,
    description: `${n > 1 ? n + '-input ' : ''}${op.toUpperCase()} gate (bitwise when Width > 1)`,
    params: [P_WIDTH],
  };
}

export const SYMBOLS = {};
// gates, each followed by its inverted-input variants (Xilinx ANDnBk...: inputs I0..I(k-1) inverted; XORnBk /
// XNORnBk Silinx symbols, no such Xilinx ones, #337)
for (const [op, ns, inv] of [['and', [2, 3, 4, 5], true], ['or', [2, 3, 4, 5], true], ['nand', [2, 3, 4], true], ['nor', [2, 3, 4], true], ['xor', [2, 3, 4], true], ['xnor', [2, 3, 4], true]])
  for (const n of ns) {
    // (5 inputs: kept for the schematics that have them and ISE's AND5 / OR5, not offered: at most 4
    // inputs a gate, more through buses, #171)
    // (the palette lists one entry a gate, AND…, the 2-input one: its Inputs make AND3 / AND4, #330)
    const OP = op.toUpperCase();
    SYMBOLS[`${op}${n}`] = { ...gateSym(op, n, `${OP}${n}`), ...(n > 2 ? { hidden: true } : {}),
      ...(n === 2 ? { paletteTitle: OP, paletteDescription: `${OP} gate of 2, 3 or 4 inputs, its inputs and inverted inputs in its properties (bitwise when Width > 1)` } : {}) };
    // (the palette lists the basic gate only: its Inverted inputs make the variant, #328)
    if (inv) for (let k = 1; k <= n; k++) {
      SYMBOLS[`${op}${n}b${k}`] = {
        ...gateSym(op, n, `${OP}${n}B${k}`), invIn: k, hidden: true, ...(op === 'xor' || op === 'xnor' ? { noLib: true } : {}),
        description: `${n}-input ${op.toUpperCase()} gate with ${k === 1 ? 'input I0' : k === 2 ? 'inputs I0 and I1' : `inputs I0..I${k - 1}`} inverted (bitwise when Width > 1)`,
      };
    }
  }
/** The gate of `type`'s kind with n inputs (its own by default), the first k inverted (AND3 + 2 = AND3B2, AND3B2 + 0 =
 *  AND3, AND2 with 4 inputs = AND4), or null when there is none (#328, #330). */
export function gateVariant(type, k, n) {
  const S = SYMBOLS[type];
  if (!S?.gate || !(S.inputs > 1)) return null;
  const t = `${S.gate}${n ?? S.inputs}${k > 0 ? `b${k}` : ''}`;
  return SYMBOLS[t] ? t : null;
}
SYMBOLS.inv = { category: 'Logic', title: 'INV', gate: 'not', inputs: 1, description: 'Inverter', params: [P_WIDTH] };
SYMBOLS.buf = { category: 'Logic', title: 'BUF', gate: 'buf', inputs: 1, description: 'Buffer', params: [P_WIDTH] };
// tri-state buffers (Xilinx BUFE / BUFT families): O = I while enabled, Z (released) otherwise, so that
// several of them (and bidirectional pins / I/O markers) may drive one net, a bus
SYMBOLS.tbuf = {
  // (BUFE and BUFT only in the palette, their Width and Pins per bit making BUFE4, BUFT8…, #326)
  category: 'Tri-State', title: 'TBUF', presetsOnly: true,
  description: 'Tri-state buffer: O = I while enabled, Z (high impedance, released) otherwise; E active high (BUFE) or T active low (BUFT)',
  params: [P_WIDTH, { name: 'enable', label: 'Enable input', kind: 'select', options: ['E', 'T'], default: 'E' },
    { name: 'bits', label: 'Pins per bit (I0.., O0..)', kind: 'bool', default: false }],
  presets: [
    { title: 'BUFE', params: { width: 1, enable: 'E' }, description: 'Tri-state buffer, active-high enable: O = I when E = 1, Z when E = 0' },
    { title: 'BUFT', params: { width: 1, enable: 'T' }, description: 'Tri-state buffer, active-low enable T: O = I when T = 0, Z when T = 1' },
  ],
};
// the multiplexers' and demultiplexers' enable E (#301: as the Xilinx M2_1E / M4_1E, the outputs 0 when
// E = 0), and their select bits as pins of their own (S1 S0, as the Xilinx M4_1E and the decoders' A1 A0);
// selBus: the select as one bus pin S, as a M4_1 / DEMUX saved before #301 has it (normalizeDoc)
const P_EN = { name: 'en', label: 'Enable input E', kind: 'bool', default: false };
const P_SELBUS = { name: 'selBus', label: 'Select as a bus (S)', kind: 'bool', default: false };
// (one palette entry each, the enable E their parameter, #313; one MUX, the M2_1, its Select bits making M4_1 …
// M16_1, #334)
SYMBOLS.mux2 = { category: 'Mux', title: 'M2_1', description: '2:1 multiplexer (O = S0 ? D1 : D0)', params: [P_WIDTH, P_EN],
  paletteTitle: 'MUX', paletteDescription: 'Multiplexer of 2, 4, 8 or 16 data inputs, its select bits (1 to 4), select bus and enable in its properties (bitwise when Width > 1)' };
SYMBOLS.mux4 = { category: 'Mux', title: 'M4_1', hidden: true, description: '4:1 multiplexer (select S1 S0)', params: [P_WIDTH, P_EN, P_SELBUS] };
SYMBOLS.mux8 = { category: 'Mux', title: 'M8_1', hidden: true, description: '8:1 multiplexer (select S2 S1 S0)', params: [P_WIDTH, P_EN, P_SELBUS] };
SYMBOLS.mux16 = { category: 'Mux', title: 'M16_1', hidden: true, description: '16:1 multiplexer (select S3 S2 S1 S0)', params: [P_WIDTH, P_EN, P_SELBUS] };
// the multiplexers' number of data inputs
export const MUX_INPUTS = { mux2: 2, mux4: 4, mux8: 8, mux16: 16 };
SYMBOLS.demux = {
  // (one entry, DEMUX, the enable E, the select bits and the select bus its parameters, #313, #334; drawn DEMUX1_4…)
  category: 'Mux', title: 'DEMUX', description: '1:2^n demultiplexer: output O<S> = D, the other outputs 0 (bitwise when Width > 1)',
  params: [P_WIDTH, { name: 'sel', label: 'Select bits', kind: 'int', default: 1, min: 1, max: 4 }, P_EN, P_SELBUS],
};
// (one palette entry each, #324: DECODER as D2_4E, ENCODER as ENC4_2; their options make D3_8E, PENC8_3…,
// the Xilinx-style name drawn)
SYMBOLS.decoder = {
  category: 'Decoders/Encoders', title: 'DECODER', description: 'n:2^n binary decoder (one-hot outputs, all 0 when E = 0; like Xilinx D2_4E / D3_8E / D4_16E)',
  params: [{ name: 'n', label: 'Address bits', kind: 'int', default: 2, min: 1, max: 5 },
    { name: 'en', label: 'Enable input E', kind: 'bool', default: true },
    { name: 'bus', label: 'Bus pins (A, D)', kind: 'bool', default: false }],
};
SYMBOLS.encoder = {
  category: 'Decoders/Encoders', title: 'ENCODER', description: '2^n:n binary encoder: priority (highest active input wins) or one-hot (OR of the inputs); V = some input is 1',
  params: [{ name: 'n', label: 'Output bits', kind: 'int', default: 2, min: 2, max: 5 },
    { name: 'mode', label: 'Type', kind: 'select', options: ['priority', 'one-hot'], default: 'one-hot' },
    { name: 'bus', label: 'Bus pins (I, A)', kind: 'bool', default: false }],
};
SYMBOLS.add = {
  category: 'Arithmetic', title: 'ADD', description: 'Adder S = A + B (+ CI), optional carry out',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'cin', label: 'Carry in', kind: 'bool', default: false }, { name: 'cout', label: 'Carry out', kind: 'bool', default: false },
    // (#304: the operands' and the sum's bits on pins of their own, A0.., B0.., S0.., as the Xilinx ADD4)
    // (no presets: Width, the carries and Pins per bit make ADD1 / ADD2 / ADD4…, #317)
    { name: 'bits', label: 'Pins per bit (A0.., B0.., S0..)', kind: 'bool', default: false }],
};
// (#322: a borrow in BI and out BO, as ADD's carries, and a pin per bit)
SYMBOLS.sub = { category: 'Arithmetic', title: 'SUB', description: 'Subtractor D = A - B (- BI), optional borrow out',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'bin', label: 'Borrow in (BI)', kind: 'bool', default: false }, { name: 'bout', label: 'Borrow out (BO)', kind: 'bool', default: false },
    { name: 'bits', label: 'Pins per bit (A0.., B0.., D0..)', kind: 'bool', default: false }] };
// an adder's / subtractor's names: its result, its carry or borrow in and out, and whether they are there
const arithIo = (t, p) => (t === 'sub' ? { o: 'D', ci: 'BI', co: 'BO', cin: !!p.bin, cout: !!p.bout, op: '-' } : { o: 'S', ci: 'CI', co: 'CO', cin: !!p.cin, cout: !!p.cout, op: '+' });
SYMBOLS.compare = {
  category: 'Arithmetic', title: 'COMP', description: 'Comparator O = A <op> B',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'op', label: 'Operation', kind: 'select', options: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'], default: 'eq' },
    { name: 'signed', label: 'Signed', kind: 'bool', default: false },
    // (#319: A0.. and B0.., as ADD's)
    { name: 'bits', label: 'Pins per bit (A0.., B0..)', kind: 'bool', default: false }],
};
SYMBOLS.constant = {
  category: 'General', title: 'CONSTANT', description: 'Constant value (decimal, 0x.. hex or 0b.. binary)',
  params: [{ name: 'value', label: 'Value', kind: 'text', default: '0' }, { ...P_WIDTH, default: 1 }],
};
SYMBOLS.vcc = { category: 'General', title: 'VCC', description: 'Logic 1 (all bits)', params: [] };
SYMBOLS.gnd = { category: 'General', title: 'GND', description: 'Logic 0 (all bits)', params: [] };
// Flip-flops of the Xilinx Unified Libraries (FT* / FJK* plus a plain FT / FJK, which Xilinx does not have).
// ff: { k: 'd'|'t'|'jk', ce, clr, pre (asynchronous; CLR wins over PRE), r, s (synchronous; R wins over S unless sp) }.
// Priorities as in the Xilinx Libraries Guide: CLR > PRE > clock; R > S > CE (FDSE/FTSRE/FJKSRE: S > R > CE).
const FF_KIND = { d: ['D', 'D'], t: ['T', 'toggle (T)'], jk: ['JK', 'J-K'] };
function ffSym(name, k, f, title) {
  const parts = [];
  if (f.ce) parts.push('clock enable');
  if (f.clr) parts.push('asynchronous clear');
  if (f.pre) parts.push('asynchronous preset');
  if (f.r && f.s) parts.push(f.sp ? 'synchronous set and reset (S over R)' : 'synchronous reset and set (R over S)');
  else if (f.r) parts.push('synchronous reset');
  else if (f.s) parts.push('synchronous set');
  const desc = `${FF_KIND[k][1]} flip-flop${parts.length ? ` with ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}` : ''}`;
  // Xilinx INIT default: 1 for the preset / set types (FDP, FDS, FTP, FJKP, FDSE...), 0 otherwise
  const init = (f.pre && !f.clr) || (f.s && (!f.r || f.sp)) ? '1' : '0';
  // (INIT first: the Xilinx default; Width: the data inputs and Q, one flip-flop per bit, the controls shared)
  return { category: 'Flip-Flops', title: title || name.toUpperCase(), ff: { k, ...f }, description: `${desc[0].toUpperCase() + desc.slice(1)} (bitwise when Width > 1)`, params: [{ ...P_INIT, default: init }, P_WIDTH] };
}
for (const [k, pfx, list] of [
  ['d', 'fd', ['', 'c', 'ce', 'cp', 'cpe', 'e', 'p', 'pe', 'r', 're', 'rs', 'rse', 's', 'se']],
  ['t', 'ft', ['', 'c', 'ce', 'cp', 'cpe', 'p', 'pe', 'rse', 'sre']],
  ['jk', 'fjk', ['', 'c', 'ce', 'cp', 'cpe', 'p', 'pe', 'rse', 'sre']],
]) for (const x of list) {
  const f = { ce: x.endsWith('e') && x !== '', clr: x[0] === 'c', pre: /^c?p/.test(x), r: /^r|^sr/.test(x), s: /^s|^rs/.test(x), sp: /^sr/.test(x) };
  for (const q of Object.keys(f)) if (!f[q]) delete f[q];
  SYMBOLS[pfx + x] = ffSym(pfx + x, k, f);
  // (the palette lists FD, FT and FJK only: a variant is the basic one with its inputs chosen in the
  // properties, #315)
  if (x) SYMBOLS[pfx + x].hidden = true;
}
// the flip-flop inputs a symbol's properties offer (#315), and the variant a choice of them makes
export const FF_INPUTS = [['ce', 'Clock enable (CE)'], ['clr', 'Asynchronous clear (CLR)'], ['pre', 'Asynchronous preset (PRE)'], ['r', 'Synchronous reset (R)'], ['s', 'Synchronous set (S)']];
const ffKey = f => FF_INPUTS.map(([q]) => (f[q] ? q : '')).join('|');
/** The flip-flop type of kind k (the one of `type`) with exactly the inputs `f` ({ ce, clr, pre, r, s }), or
 *  null when the Xilinx library has none (for R and S both, the one where R wins, else the one where S does). */
export function ffVariant(type, f) {
  const k = SYMBOLS[type]?.ff?.k;
  if (!k) return null;
  const want = ffKey(f);
  const all = Object.entries(SYMBOLS).filter(([, S]) => S.ff?.k === k && ffKey(S.ff) === want);
  return (all.find(([, S]) => !S.ff.sp) || all[0])?.[0] || null;
}
// (not in the palette: a flip-flop with Width > 1 is a register, #315; kept for the schematics that have it)
SYMBOLS.register = {
  category: 'Flip-Flops', title: 'REG', hidden: true, description: 'N-bit register',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'en', label: 'Clock enable', kind: 'bool', default: true },
    { name: 'reset', label: 'Reset', kind: 'select', options: ['none', 'async', 'sync'], default: 'async' },
    { name: 'init', label: 'Reset/INIT value', kind: 'text', default: '0' }],
};
SYMBOLS.counter = {
  category: 'Arithmetic', title: 'CNT', description: 'N-bit binary counter',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'en', label: 'Clock enable', kind: 'bool', default: true },
    { name: 'reset', label: 'Reset', kind: 'select', options: ['none', 'async', 'sync'], default: 'async' },
    { name: 'dir', label: 'Direction', kind: 'select', options: ['up', 'down'], default: 'up' },
    // (#319: Q0.. on pins of their own)
    { name: 'bits', label: 'Pins per bit (Q0..)', kind: 'bool', default: false }],
};
SYMBOLS.slice = {
  category: 'Bus', title: 'BUS TAP', description: 'Select bits I(msb downto lsb) of a bus',
  params: [{ name: 'msb', label: 'MSB index', kind: 'int', default: 0, min: 0 }, { name: 'lsb', label: 'LSB index', kind: 'int', default: 0, min: 0 }],
};
SYMBOLS.busjoin = {
  category: 'Bus', title: 'BUS JOIN', description: 'Concatenate inputs (I0 is the most significant part)',
  params: [{ name: 'widths', label: 'Input widths (MSB first)', kind: 'text', default: '1,1' }],
};
SYMBOLS.module = { category: 'Project modules', title: 'MODULE', description: 'Instance of a project module/entity', params: [] };
SYMBOLS.hdlblock = {
  category: 'Logic', title: 'HDL BLOCK', description: 'Box with explicit pins carrying HDL statements emitted verbatim',
  params: [],
};

// the device primitives (#791, core/primitives.js): the block RAMs, multipliers / DSP slices, clock managers and
// clock buffers of the project's family (`families`: the palette offers a symbol for these only), each the UNISIM
// primitive instanced as it is; their attributes (the generics) the symbol's parameters, named as the primitive's
const ATTR_KIND = { int: 'int', string: 'select', bool: 'bool', hex: 'text' };
/** The parameter of a primitive's symbol for its attribute g (core/primitives.js). */
export function attrParam(g) {
  const kind = g.kind === 'real' ? (g.options ? 'select' : 'text') : ATTR_KIND[g.kind];
  const note = g.kind === 'hex' ? `${g.bits} bits, hexadecimal` : g.kind === 'int' || (g.kind === 'real' && !g.options) ? `${g.min} … ${g.max}` : null;
  return { name: g.name, label: g.name, kind, default: g.default, attr: true, ...(g.options ? { options: [...g.options] } : {}),
    ...(g.kind === 'int' ? { min: g.min, max: g.max } : {}), ...(note ? { note } : {}) };
}
for (const [type, P] of Object.entries(DEVICE_PRIMITIVES)) {
  const p0 = {};
  for (const x of P.params || []) p0[x.name] = x.default;
  SYMBOLS[type] = { category: 'Device Primitives', title: P.title, prim: true, families: [...P.families], description: P.description,
    params: [...(P.params || []).map(x => ({ ...x })), ...P.of(p0).generics.map(attrParam)] };
}

/** The parameters of a placed symbol: its library's, a device primitive's attributes at its parameters (an INIT of
 *  the width its port has, #791). */
export function symbolParams(sym) {
  const S = SYMBOLS[sym?.type];
  if (!S?.prim) return S?.params || [];
  const own = DEVICE_PRIMITIVES[sym.type].params || [];
  return [...own, ...primitiveOf(sym.type, { ...defaultParams(sym.type), ...(sym.params || {}) }).generics.map(attrParam)];
}

export const SYMBOL_CATEGORIES = ['Logic', 'Tri-State', 'Arithmetic', 'Flip-Flops', 'Mux', 'Decoders/Encoders', 'Bus', 'General', 'Device Primitives', 'Project modules'];

export function defaultParams(type) {
  const s = SYMBOLS[type];
  const p = {};
  for (const d of s?.params || []) p[d.name] = d.default;
  if (type === 'hdlblock') { p.inputs = [{ name: 'a', width: 1 }]; p.outputs = [{ name: 'y', width: 1 }]; p.title = 'logic'; }
  if (type === 'module') { p.module = ''; p.generics = {}; }
  return p;
}

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const widthsOf = s => String(s ?? '').split(/[,\s]+/).map(x => int(x, 0)).filter(x => x > 0);
const chW = 6.2;   // approx char width of 9-11px Arial used for sizing boxes

export function normModules(modules) {
  const out = {};
  if (!modules) return out;
  const list = Array.isArray(modules) ? modules : Object.values(modules);
  for (const m of list) if (m && m.name) out[m.name] = m;
  return out;
}
function findMod(modules, name) {
  if (!name) return null;
  if (modules[name]) return modules[name];
  const ln = name.toLowerCase();
  for (const k in modules) if (k.toLowerCase() === ln) return modules[k];
  return null;
}

function boxDef(west, east, title, minW = 80, top = 20) {
  const rows = Math.max(west.length, east.length, 1);
  const lw = Math.max(0, ...west.map(p => String(p.name).length * chW + (p.clock ? 8 : 0)));
  const rw = Math.max(0, ...east.map(p => String(p.name).length * chW));
  const bw = r10(Math.max(minW, lw + rw + 24, String(title || '').length * 7 + 16));
  const w = bw + 40, h = rows * 20 + top;
  const pins = [];
  west.forEach((p, i) => pins.push({ ...p, x: 0, y: top + i * 20, side: 'W' }));
  east.forEach((p, i) => pins.push({ ...p, x: w, y: top + i * 20, side: 'E' }));
  return { w, h, body: { x: 20, y: 0, w: bw, h }, pins };
}

// The type name drawn on a symbol: its library title, with its width for the symbols whose width is part of
// the Xilinx name (ADD8, SUB16, COMP4, CNT8, REG8, #681)
const WIDE_NAMED = new Set(['add', 'sub', 'compare', 'register', 'counter']);
export function symbolTypeName(sym) {
  const nm = SYMBOLS[sym.type]?.title || String(sym.type || '').toUpperCase();
  if (!WIDE_NAMED.has(sym.type)) return nm;
  const p = { ...defaultParams(sym.type), ...(sym.params || {}) };
  return `${nm}${Math.max(1, int(p.width, 1))}`;
}

// Local (unrotated) geometry of a symbol: { w, h, shape, body, pins: [{ name, dir, x, y, side, width }] }.
// width null = takes the width of the net it is connected to.
export function symbolDef(sym, modules = {}) {
  const t = sym.type, p = { ...defaultParams(t), ...(sym.params || {}) };
  const S = SYMBOLS[t];
  const W = Math.max(1, int(p.width, 1));
  if (S && S.gate && S.inputs > 1) {
    const n = S.inputs, h = Math.max(40, n * 20);
    const pins = [];
    const k = S.invIn || 0;
    // inverted-input gates follow the Xilinx library drawing: I0 at the bottom, bubbles on I0..I(k-1)
    for (let i = 0; i < n; i++) {
      const q = { name: `I${i}`, dir: 'in', x: 0, y: k ? h / 2 + (n - 1) * 10 - 20 * i : h / 2 - (n - 1) * 10 + 20 * i, side: 'W', width: W };
      if (i < k) q.inv = true;
      pins.push(q);
    }
    pins.push({ name: 'O', dir: 'out', x: 80, y: h / 2, side: 'E', width: W });
    return { w: 80, h, shape: 'gate', gate: S.gate, bubble: /^n|xnor/.test(S.gate), body: { x: 20, y: 0, w: 40, h }, pins };
  }
  if (t === 'inv' || t === 'buf') {
    return { w: 60, h: 20, shape: t, body: { x: 20, y: 0, w: 24, h: 20 },
      pins: [{ name: 'I', dir: 'in', x: 0, y: 10, side: 'W', width: W }, { name: 'O', dir: 'out', x: 60, y: 10, side: 'E', width: W }] };
  }
  if (t === 'tbuf') {
    // the enable on the left, one row above the data (as the Xilinx BUFE / BUFT symbols); one triangle per
    // bit when the bits have their own pins (BUFE4 / BUFT4), the enable line joining their top edges
    const en = p.enable === 'T' ? 'T' : 'E', bits = W > 1 && !!p.bits, n = bits ? W : 1;
    const pins = [{ name: en, dir: 'in', x: 0, y: 10, side: 'W', width: 1 }];
    for (let k = 0; k < n; k++) pins.push({ name: bits ? `I${k}` : 'I', dir: 'in', x: 0, y: 30 + 20 * k, side: 'W', width: bits ? 1 : W });
    for (let k = 0; k < n; k++) pins.push({ name: bits ? `O${k}` : 'O', dir: 'out', x: 60, y: 30 + 20 * k, side: 'E', width: bits ? 1 : W, tri: true });
    const title = `BUF${en}${W > 1 ? W : ''}`;
    return { w: 60, h: 20 + 20 * n, shape: 'tbuf', activeLow: en === 'T', rows: n, title, body: { x: 20, y: 20, w: 26, h: 20 * n }, pins };
  }
  // the select pins at the bottom, the most significant on the left, 20 apart around cx (#301): one bus pin S
  // (selBus) or S<k-1> … S0
  const selPins = (k, cx, h) => (k === 1 ? [{ name: 'S0', dir: 'in', x: cx, y: h, side: 'S', width: 1 }]
    : p.selBus ? [{ name: 'S', dir: 'in', x: cx, y: h, side: 'S', width: k }]
      : [...Array(k).keys()].map(i => ({ name: `S${k - 1 - i}`, dir: 'in', x: cx - 10 * (k - 1) + 20 * i, y: h, side: 'S', width: 1 })));
  if (MUX_INPUTS[t]) {
    // (the enable E: a data row more, on the left below the data inputs, as the Xilinx M2_1E … M16_1E)
    // (the body wider with the select bits, 20 apart: 40 for M2_1 / M4_1, 60 for M8_1, 80 for M16_1)
    const n = MUX_INPUTS[t], k = Math.log2(n), en = !!p.en, bh = n * 20 + 20 + (en ? 20 : 0), h = bh + 10, bw = Math.max(40, 20 * k);
    const pins = [];
    for (let i = 0; i < n; i++) pins.push({ name: `D${i}`, dir: 'in', x: 0, y: 20 + 20 * i, side: 'W', width: W });
    if (en) pins.push({ name: 'E', dir: 'in', x: 0, y: 20 + 20 * n, side: 'W', width: 1 });
    pins.push(...selPins(k, 20 + bw / 2, h));
    pins.push({ name: 'O', dir: 'out', x: bw + 40, y: bh / 2, side: 'E', width: W });
    return { w: bw + 40, h, shape: 'mux', title: `M${n}_1${en ? 'E' : ''}`, body: { x: 20, y: 0, w: bw, h: bh }, pins };
  }
  if (t === 'demux') {
    // trapezoid wide on the output side (mirror of M2_1/M4_1), 70 px wide so that the pin names fit inside
    // (the enable E: on the left, below D, the body a row taller)
    const k = Math.max(1, Math.min(4, int(p.sel, 1))), n = 1 << k, bh = n * 20 + 40 + (p.en ? 20 : 0), h = bh + 10;   // a free row at the bottom for S
    const pins = [{ name: 'D', dir: 'in', x: 0, y: bh / 2, side: 'W', width: W }];
    if (p.en) pins.push({ name: 'E', dir: 'in', x: 0, y: bh - 30, side: 'W', width: 1 });
    pins.push(...selPins(k, 60, h));
    for (let i = 0; i < n; i++) pins.push({ name: `O${i}`, dir: 'out', x: 110, y: 20 + 20 * i, side: 'E', width: W });
    return { w: 110, h, shape: 'demux', title: `DEMUX1_${n}${p.en ? 'E' : ''}`, body: { x: 20, y: 0, w: 70, h: bh }, pins };
  }
  if (t === 'decoder' || t === 'encoder') {
    const west = [], east = [];
    let title;
    if (t === 'decoder') {
      const n = Math.max(1, Math.min(5, int(p.n, 2))), o = 1 << n;
      if (p.bus) west.push({ name: 'A', dir: 'in', width: n }); else for (let i = 0; i < n; i++) west.push({ name: `A${i}`, dir: 'in', width: 1 });
      if (p.en) west.push({ name: 'E', dir: 'in', width: 1 });
      if (p.bus) east.push({ name: 'D', dir: 'out', width: o }); else for (let i = 0; i < o; i++) east.push({ name: `D${i}`, dir: 'out', width: 1 });
      title = `D${n}_${o}${p.en ? 'E' : ''}`;
    } else {
      const n = Math.max(2, Math.min(5, int(p.n, 2))), m = 1 << n;
      if (p.bus) west.push({ name: 'I', dir: 'in', width: m }); else for (let i = 0; i < m; i++) west.push({ name: `I${i}`, dir: 'in', width: 1 });
      if (p.bus) east.push({ name: 'A', dir: 'out', width: n }); else for (let i = 0; i < n; i++) east.push({ name: `A${i}`, dir: 'out', width: 1 });
      east.push({ name: 'V', dir: 'out', width: 1 });
      title = `${p.mode === 'one-hot' ? 'ENC' : 'PENC'}${m}_${n}`;
    }
    // a free row on top for the symbol name (drawn like the title of module symbols), pins below it
    const d = boxDef(west, east, title, 80, 40);
    return { ...d, shape: 'lib', title };
  }
  if ((t === 'add' || t === 'sub') && p.bits && W > 1) {
    // (#304, #322) a box as the Xilinx ADD4: A0.. B0.. (CI / BI) on the left, S0.. / D0.. (CO / BO) on the right
    const io = arithIo(t, p), west = [], east = [];
    for (const g of ['A', 'B']) for (let i = 0; i < W; i++) west.push({ name: `${g}${i}`, dir: 'in', width: 1 });
    if (io.cin) west.push({ name: io.ci, dir: 'in', width: 1 });
    for (let i = 0; i < W; i++) east.push({ name: `${io.o}${i}`, dir: 'out', width: 1 });
    if (io.cout) east.push({ name: io.co, dir: 'out', width: 1 });
    const title = `${t === 'sub' ? 'SUB' : 'ADD'}${W}`;
    return { ...boxDef(west, east, title, 80, 40), shape: 'lib', title };
  }
  if (t === 'compare' && p.bits && W > 1) {
    // (#319) a box: A0.. B0.. on the left, O on the right, its relation in its name
    const west = [];
    for (const g of ['A', 'B']) for (let i = 0; i < W; i++) west.push({ name: `${g}${i}`, dir: 'in', width: 1 });
    const title = `COMP${W} ${({ eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' })[p.op] || '?'}`;
    return { ...boxDef(west, [{ name: 'O', dir: 'out', width: 1 }], title, 80, 40), shape: 'lib', title };
  }
  if (t === 'add' || t === 'sub' || t === 'compare') {
    const h = t === 'compare' ? 40 : 60;
    const pins = [{ name: 'A', dir: 'in', x: 0, y: 10, side: 'W', width: W }, { name: 'B', dir: 'in', x: 0, y: 30, side: 'W', width: W }];
    const io = t === 'compare' ? null : arithIo(t, p);
    if (io?.cin) pins.push({ name: io.ci, dir: 'in', x: 0, y: 50, side: 'W', width: 1 });
    if (t === 'compare') pins.push({ name: 'O', dir: 'out', x: 80, y: 20, side: 'E', width: 1 });
    else pins.push({ name: io.o, dir: 'out', x: 80, y: 30, side: 'E', width: W });
    if (io?.cout) pins.push({ name: io.co, dir: 'out', x: 80, y: 50, side: 'E', width: 1 });
    const op = t === 'add' ? '+' : t === 'sub' ? '−' : ({ eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }[p.op] || '?');
    return { w: 80, h, shape: 'arith', op, body: { x: 20, y: 0, w: 40, h }, pins };
  }
  if (S && (S.ff || t === 'register' || t === 'counter')) {
    let ce, clr, pre, r, st, west = [];
    const f = S.ff;
    if (f) ({ ce, clr, pre, r, s: st } = f);
    else { ce = !!p.en; clr = p.reset === 'async'; r = p.reset === 'sync'; }
    const bw = W;   // (a library flip-flop: Width bits of data and Q, the controls 1 bit)
    // ISE order: PRE / S on top, data, CE, C, CLR / R at the bottom; Q level with the (first) data input
    if (pre) west.push({ name: 'PRE', dir: 'in', width: 1 });
    if (st) west.push({ name: 'S', dir: 'in', width: 1 });
    const q0 = west.length;
    if (f?.k === 't') west.push({ name: 'T', dir: 'in', width: bw });
    else if (f?.k === 'jk') west.push({ name: 'J', dir: 'in', width: bw }, { name: 'K', dir: 'in', width: bw });
    else if (t !== 'counter') west.push({ name: 'D', dir: 'in', width: bw });
    if (ce) west.push({ name: 'CE', dir: 'in', width: 1 });
    west.push({ name: 'C', dir: 'in', width: 1, clock: true });
    if (clr) west.push({ name: 'CLR', dir: 'in', width: 1 });
    if (r) west.push({ name: 'R', dir: 'in', width: 1 });
    const h = Math.max(40, west.length * 20 + 10);   // bottom margin: the type name sits under the last pin name
    const pins = west.map((q, i) => ({ ...q, x: 0, y: 10 + 20 * i, side: 'W' }));
    // (a counter with a pin per bit, #319: Q0 .. Q<w-1>)
    if (t === 'counter' && p.bits && W > 1) {
      for (let i = 0; i < W; i++) pins.push({ name: `Q${i}`, dir: 'out', x: 90, y: 10 + 20 * i, side: 'E', width: 1 });
      const hb = Math.max(h, W * 20 + 10);
      return { w: 90, h: hb, shape: 'ff', body: { x: 20, y: 0, w: 50, h: hb }, pins };
    }
    pins.push({ name: 'Q', dir: 'out', x: 90, y: 10 + 20 * (t === 'counter' ? 0 : q0), side: 'E', width: bw });
    return { w: 90, h, shape: 'ff', body: { x: 20, y: 0, w: 50, h }, pins };
  }
  if (t === 'slice') {
    const msb = int(p.msb, 0), lsb = int(p.lsb, 0);
    return { w: 40, h: 20, shape: 'slice', text: msb === lsb ? `(${msb})` : `(${msb}:${lsb})`, body: { x: 15, y: 0, w: 10, h: 20 },
      pins: [{ name: 'I', dir: 'in', x: 0, y: 10, side: 'W', width: p.inWidth ? int(p.inWidth, null) : null },
        { name: 'O', dir: 'out', x: 40, y: 10, side: 'E', width: Math.abs(msb - lsb) + 1 }] };
  }
  if (t === 'busjoin') {
    const ws = widthsOf(p.widths);
    const n = Math.max(1, ws.length), h = n * 20;
    const pins = ws.map((w, i) => ({ name: `I${i}`, dir: 'in', x: 0, y: 10 + 20 * i, side: 'W', width: w }));
    pins.push({ name: 'O', dir: 'out', x: 40, y: h / 2, side: 'E', width: ws.reduce((a, b) => a + b, 0) || null });
    return { w: 40, h, shape: 'join', body: { x: 18, y: 0, w: 4, h }, pins };
  }
  if (t === 'constant') {
    const txt = String(p.value ?? '0');
    const w = r10(Math.max(40, txt.length * 7 + 24));
    return { w, h: 20, shape: 'const', text: txt, body: { x: 0, y: 0, w: w - 20, h: 20 },
      pins: [{ name: 'O', dir: 'out', x: w, y: 10, side: 'E', width: W }] };
  }
  if (t === 'vcc') return { w: 20, h: 30, shape: 'vcc', body: { x: 0, y: 0, w: 20, h: 10 }, pins: [{ name: 'P', dir: 'out', x: 10, y: 30, side: 'S', width: null }] };
  if (t === 'gnd') return { w: 20, h: 30, shape: 'gnd', body: { x: 0, y: 20, w: 20, h: 10 }, pins: [{ name: 'G', dir: 'out', x: 10, y: 0, side: 'N', width: null }] };
  if (t === 'module') {
    const m = findMod(modules, p.module);
    let ports = m ? m.ports : (p.ports || []);
    const snapW = new Map((p.ports || []).map(q => [String(q.name).toLowerCase(), q.width]));
    const overridden = p.generics && Object.keys(p.generics).length > 0;
    ports = ports.map(q => ({ name: q.name, dir: q.dir || 'in', width: (overridden && snapW.has(String(q.name).toLowerCase())) ? snapW.get(String(q.name).toLowerCase()) : (q.width ?? 1), type: q.type }));
    const d = boxDef(ports.filter(q => q.dir !== 'out'), ports.filter(q => q.dir === 'out'), p.module, 80);
    return { ...d, shape: 'module', title: p.module || '?', missing: !m && !p.ports };
  }
  if (S?.prim) {
    // (a box: the inputs on the left, the outputs on the right, in the order of UNISIM's ports; the name of the
    // primitive its parameters make on top, RAMB16_S9_S18)
    const r = primitiveOf(t, p);
    const pinOf = q => ({ name: q.name, dir: q.dir, width: q.width, ...(q.clock ? { clock: true } : {}), ...(q.dir === 'in' ? { tie: q.tie, need: q.need } : {}) });
    const d = boxDef(r.pins.filter(q => q.dir !== 'out').map(pinOf), r.pins.filter(q => q.dir === 'out').map(pinOf), r.name, 100, 40);
    return { ...d, shape: 'lib', title: r.name, prim: r.name };
  }
  if (t === 'hdlblock') {
    const ins = (p.inputs || []).map(q => ({ name: q.name, dir: q.dir === 'inout' ? 'inout' : 'in', width: Math.max(1, int(q.width, 1)), clock: !!q.clock }));
    const outs = (p.outputs || []).map(q => ({ name: q.name, dir: 'out', width: Math.max(1, int(q.width, 1)), reg: !!q.reg }));
    const d = boxDef(ins, outs, p.title, 100);
    return { ...d, shape: 'hdl', title: p.title || 'HDL' };
  }
  // unknown symbol type: an empty box so the document still loads
  return { w: 60, h: 40, shape: 'unknown', body: { x: 10, y: 0, w: 40, h: 40 }, pins: [] };
}

const ROT_OK = new Set([0, 90, 180, 270]);
export function rotSize(sym, def) { return (sym.rot === 90 || sym.rot === 270) ? { w: def.h, h: def.w } : { w: def.w, h: def.h }; }

// local symbol coordinates -> sheet coordinates
export function xform(sym, def, x, y) {
  let px = sym.mirror ? def.w - x : x, py = y;
  switch (sym.rot) {
    case 90: [px, py] = [def.h - py, px]; break;
    case 180: [px, py] = [def.w - px, def.h - py]; break;
    case 270: [px, py] = [py, def.w - px]; break;
  }
  return { x: sym.x + px, y: sym.y + py };
}
const SIDE_V = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
export function xformSide(sym, side) {
  let [dx, dy] = SIDE_V[side] || [-1, 0];
  if (sym.mirror) dx = -dx;
  switch (sym.rot) {
    case 90: [dx, dy] = [-dy, dx]; break;
    case 180: [dx, dy] = [-dx, -dy]; break;
    case 270: [dx, dy] = [dy, -dx]; break;
  }
  return dx < 0 ? 'W' : dx > 0 ? 'E' : dy < 0 ? 'N' : 'S';
}

// pins in sheet coordinates
export function symbolPins(sym, modules = {}, def = symbolDef(sym, modules)) {
  return def.pins.map(p => ({ ...p, ...xform(sym, def, p.x, p.y), side: xformSide(sym, p.side), lx: p.x, ly: p.y }));
}
export function symbolBox(sym, modules = {}, def = symbolDef(sym, modules)) {
  const { w, h } = rotSize(sym, def);
  return { x: sym.x, y: sym.y, w, h };
}

// I/O marker geometry: the connection point is (x, y); the body extends to its side (portSide): to the
// left by default for an input, to the right for an output or a bidirectional port, or up or down (#296)
export const PORT_SIDES = ['W', 'N', 'E', 'S'];   // clockwise
export const portSide = port => (PORT_SIDES.includes(port.side) ? port.side : port.dir === 'in' ? 'W' : 'E');
// a quarter turn clockwise; the opposite side (Mirror)
export const turnSide = side => PORT_SIDES[(PORT_SIDES.indexOf(side) + 1) % 4];
export const oppositeSide = side => PORT_SIDES[(PORT_SIDES.indexOf(side) + 2) % 4];
// the default name of an I/O marker placed on empty space (no net to name it, #680): in1, out1, io1…, the
// first not taken by a marker, a net name or an instance (case-insensitive, as VHDL compares them)
export function freePortName(doc, dir) {
  const base = dir === 'out' ? 'out' : dir === 'inout' ? 'io' : 'in';
  const taken = new Set([...(doc.ports || []).map(p => p.name), ...(doc.labels || []).map(l => parseNetName(l.net).base), ...(doc.symbols || []).map(s => s.name)]
    .filter(Boolean).map(s => String(s).toLowerCase()));
  let n = 1;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}
export function portBox(port) {
  const tw = Math.max(20, String(port.name || '').length * 7.5);
  const w = r10(tw + 34);
  switch (portSide(port)) {
    case 'W': return { x: port.x - w, y: port.y - 10, w, h: 20 };
    case 'N': return { x: port.x - 10, y: port.y - w, w: 20, h: w };
    case 'S': return { x: port.x - 10, y: port.y, w: 20, h: w };
    default: return { x: port.x, y: port.y - 10, w, h: 20 };
  }
}

// ===================================================================== documents
export function newDoc(name = 'schematic', lang = 'vhdl') {
  return { version: DOC_VERSION, name, lang, sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [], ports: [] };
}

// (modules: the project's modules, the pins of its module symbols, to convert a document of version 2;
// without them, a document with module symbols stays at version 2, converted when they are known)
export function normalizeDoc(d, { modules } = {}) {
  const doc = d && typeof d === 'object' ? clone(d) : newDoc();
  const before301 = !(+doc.version >= 2);
  const before678 = !(+doc.version >= 3);
  doc.version = DOC_VERSION;
  doc.name = String(doc.name || 'schematic');
  doc.lang = doc.lang === 'verilog' ? 'verilog' : 'vhdl';
  doc.sheet = { w: Math.max(400, +doc.sheet?.w || 1700), h: Math.max(300, +doc.sheet?.h || 1100) };
  const ids = new Set();
  const uid = (o, pfx) => {
    let id = o.id != null ? String(o.id) : '';
    if (!id || ids.has(id)) { let k = ids.size + 1; while (ids.has(`${pfx}${k}`)) k++; id = `${pfx}${k}`; }
    ids.add(id); o.id = id;
  };
  doc.symbols = (Array.isArray(doc.symbols) ? doc.symbols : []).filter(s => s && s.type).map(s => {
    const o = { id: s.id, type: String(s.type), x: snap(+s.x || 0), y: snap(+s.y || 0), rot: ROT_OK.has(+s.rot) ? +s.rot : 0, mirror: !!s.mirror, name: String(s.name ?? ''), params: { ...defaultParams(s.type), ...(s.params || {}) } };
    // a M4_1 / DEMUX saved before its select bits had pins of their own (#301): its bus pin S kept
    if (before301 && (o.type === 'mux4' || o.type === 'demux') && !('selBus' in (s.params || {}))) o.params.selBus = true;
    if (s.hdl != null) o.hdl = String(s.hdl);
    uid(o, 'S'); return o;
  });
  doc.wires = (Array.isArray(doc.wires) ? doc.wires : []).filter(w => w && Array.isArray(w.points) && w.points.length >= 2).map(w => {
    const pts = [];
    for (const p of w.points) { const q = { x: snap(+p.x || 0), y: snap(+p.y || 0) }; const l = pts[pts.length - 1]; if (!l || l.x !== q.x || l.y !== q.y) pts.push(q); }
    const o = { id: w.id, points: pts };
    if (w.bus) o.bus = true;
    uid(o, 'W'); return o;
  }).filter(w => w.points.length >= 2);
  doc.labels = (Array.isArray(doc.labels) ? doc.labels : []).filter(l => l && l.net).map(l => { const o = { id: l.id, x: snap(+l.x || 0), y: snap(+l.y || 0), net: String(l.net).trim() }; uid(o, 'L'); return o; });
  doc.ports = (Array.isArray(doc.ports) ? doc.ports : []).filter(p => p && p.name).map(p => {
    const o = { id: p.id, name: String(p.name).trim(), dir: ['in', 'out', 'inout'].includes(p.dir) ? p.dir : 'in', width: Math.max(1, int(p.width, 1)), x: snap(+p.x || 0), y: snap(+p.y || 0) };
    if (p.type) o.type = String(p.type);
    // (its side when it is not the default one, #296)
    if (PORT_SIDES.includes(p.side) && p.side !== portSide({ dir: o.dir })) o.side = p.side;
    // (VHDL, #225: a buffer port, a port's default value, as the module had them)
    if (p.mode === 'buffer') o.mode = 'buffer';
    if (p.default != null && String(p.default).trim()) o.default = String(p.default).trim();
    uid(o, 'P'); return o;
  });
  // names for symbols without one
  const names = new Set(doc.symbols.map(s => s.name).filter(Boolean));
  let k = 0;
  for (const s of doc.symbols) if (!s.name) { do k++; while (names.has(`U${k}`)); s.name = `U${k}`; names.add(s.name); }
  if (doc.hdl && typeof doc.hdl !== 'object') delete doc.hdl;
  delete doc.importDiagnostics;
  if (before678) {
    const mods = normModules(modules);
    joinOnWires(doc, mods);
    if (doc.symbols.some(s => symbolDef(s, mods).missing)) doc.version = 2;
  }
  return doc;
}

// ISE style bus names: "data(7:0)" / "data[7:0]" -> { base: 'data', width: 8 }
export function parseNetName(s) {
  const m = /^\s*([A-Za-z_][\w$]*)\s*(?:[([]\s*(\d+)\s*(?::|downto|to)\s*(\d+)\s*[)\]])?\s*$/i.exec(String(s ?? ''));
  if (!m) return { base: String(s ?? '').trim(), width: null, bad: true };
  return { base: m[1], width: m[2] != null ? Math.abs(+m[2] - +m[3]) + 1 : null };
}

// The net, other than `except`, that a net name would join (#689): net names (labels) and I/O markers of
// the same name are one net, connected by name without a wire, as in ISE (case-insensitive in VHDL). The
// name's base counts (d(7:0): d). nl: netlist(doc). Returns that net, or null.
export function netByName(doc, nl, name, except = null) {
  const ci = doc.lang !== 'verilog';
  const nk = v => (ci ? String(v).toLowerCase() : String(v));
  const base = nk(parseNetName(name).base);
  if (!base) return null;
  const label = new Map(doc.labels.map(l => [l.id, l]));
  const port = new Map(doc.ports.map(p => [p.id, p]));
  return nl.nets.find(n => n !== except && n.id !== except?.id && (
    n.labels.some(id => nk(parseNetName(label.get(id)?.net).base) === base) || n.ports.some(id => nk(port.get(id)?.name) === base))) || null;
}

// A net connected by name renamed as a whole (#734): every net name (label) and I/O marker of the net that has its
// old name (its base, case-insensitive in VHDL) takes the new one, each label keeping its own bus range
// (d(7:0) -> q(7:0)); the label edited (`edited`, its id) takes the name as typed. A marker is a port of the
// module: renamed too. nl: netlist(doc); net: the net of nl. Returns { labels, ports } (the ones renamed).
export function renameNet(doc, nl, net, name, edited = null) {
  const ci = doc.lang !== 'verilog';
  const nk = v => (ci ? String(v).toLowerCase() : String(v));
  const to = parseNetName(name);
  const out = { labels: [], ports: [] };
  if (!net || to.bad || !to.base) return out;
  const label = new Map(doc.labels.map(l => [l.id, l]));
  const old = edited && label.get(edited) ? parseNetName(label.get(edited).net).base
    : net.labels.map(id => parseNetName(label.get(id)?.net).base).find(Boolean) ?? doc.ports.find(p => net.ports.includes(p.id))?.name ?? net.name;
  const same = v => !!v && nk(v) === nk(old);
  for (const id of net.labels) {
    const l = label.get(id);
    if (!l) continue;
    if (id === edited) { l.net = String(name).trim(); out.labels.push(l); continue; }
    const m = /^\s*([A-Za-z_][\w$]*)(.*)$/s.exec(String(l.net));
    if (!m || !same(m[1])) continue;
    l.net = `${to.base}${m[2].trim() ? m[2].trim() : ''}`;
    out.labels.push(l);
  }
  for (const p of doc.ports) if (net.ports.includes(p.id) && same(p.name)) { p.name = to.base; out.ports.push(p); }
  return out;
}

// Two named nets shorted (#754): nets of `before`, each with a name of its own (a net name or an I/O marker),
// that are one net in `after` (a wire drawn between them). ISE's schematic editor refuses such a wire ("Wire
// would create a short between net x and net y"). Not a short: the same name (connected by name), an unnamed
// net, output markers on another marker's net (assigned in the HDL, y <= a), nor names one net of `before`
// already had. Returns the two names [x, y], or null.
export function netShort(before, after, { modules = {} } = {}) {
  const b = netlist(before, { modules }), a = netlist(after, { modules });
  const names = (doc, n) => {
    const ci = doc.lang === 'vhdl', out = new Map();
    const add = (name, marker, dir) => { const k = ci ? name.toLowerCase() : name; if (name && !out.has(k)) out.set(k, { key: k, name, marker, dir }); };
    for (const id of n.labels) add(parseNetName(doc.labels.find(l => l.id === id)?.net).base, false);
    for (const id of n.ports) { const p = doc.ports.find(q => q.id === id); if (p) add(p.name, true, p.dir); }
    return [...out.values()];
  };
  const owner = new Map();   // a name of `before` -> its net (names alike are one net)
  for (const n of b.nets) for (const x of names(before, n)) owner.set(x.key, n.id);
  for (const n of a.nets) {
    const xs = names(after, n);
    if (xs.length < 2 || (xs.every(x => x.marker) && xs.filter(x => x.dir !== 'out').length <= 1)) continue;
    const by = new Map();
    for (const x of xs) { const g = owner.get(x.key) ?? `new:${x.key}`; if (!by.has(g)) by.set(g, x.name); }
    if (by.size > 1) return [...by.values()].slice(0, 2);
  }
  return null;
}

// ===================================================================== connectivity
const key = (x, y) => `${x},${y}`;
function onSeg(p, a, b) {
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-6) return false;
  return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
}

class DSU {
  constructor() { this.p = new Map(); }
  find(a) { let r = a; while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r); let c = a; while (c !== r) { const n = this.p.get(c); this.p.set(c, r); c = n; } if (!this.p.has(r)) this.p.set(r, r); return r; }
  union(a, b) { const x = this.find(a), y = this.find(b); if (x !== y) this.p.set(y, x); }
}

// Connectivity extraction. Returns { nets, pinNet: Map('symId/pin' -> net), portNet: Map(portId -> net),
// wireNet: Map(wireId -> net), junctions: [{x,y}], diagnostics: [{ severity, message, ref: {kind,id,pin?}, x, y }] }.
// net = { id, name, auto, width, endpoints: [{ kind:'pin', sym, pin, dir, width } | { kind:'port', port, dir, width }],
//         wires: [ids], labels: [ids], ports: [ids], drivers: [endpoints] }
export function netlist(docIn, { modules = {} } = {}) {
  modules = normModules(modules);
  const doc = docIn && +docIn.version >= 3 ? docIn : normalizeDoc(docIn, { modules });
  const ci = doc.lang === 'vhdl';
  const nk = s => (ci ? String(s).toLowerCase() : String(s));
  // a signal declared in the HDL kept in the schematic (its declarations, a schematic made from HDL)
  let declSet = null;
  const declaredHere = name => { if (!String(doc.hdl?.decls || '').trim()) return false; declSet ||= declaredIn(doc.hdl.decls, doc.hdl.lang || doc.lang); return declSet.has(nk(name)); };
  const diags = [];
  const dsu = new DSU();
  const at = new Map();   // point key -> node ids touching (pins, ports, wire vertices)
  const addAt = (x, y, id) => { const k = key(x, y); let a = at.get(k); if (!a) at.set(k, a = []); a.push(id); };

  const symById = new Map(doc.symbols.map(s => [s.id, s]));
  const pinInfo = new Map();     // node id -> endpoint
  const defs = new Map();
  for (const s of doc.symbols) {
    const def = symbolDef(s, modules);
    defs.set(s.id, def);
    for (const p of symbolPins(s, modules, def)) {
      const id = `p:${s.id}/${p.name}`;
      pinInfo.set(id, { kind: 'pin', sym: s.id, pin: p.name, dir: p.dir, width: p.width, x: p.x, y: p.y, ...(p.tri ? { tri: true } : {}) });
      dsu.find(id);
      addAt(p.x, p.y, id);
    }
    if (def.missing) diags.push({ severity: 'error', message: `${s.name}: module '${s.params.module}' not found in the project`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y });
  }
  for (const p of doc.ports) {
    const id = `o:${p.id}`;
    pinInfo.set(id, { kind: 'port', port: p.id, dir: p.dir, width: p.width, x: p.x, y: p.y, name: p.name });
    dsu.find(id);
    addAt(p.x, p.y, id);
  }
  // wires: their end points touch what is there (#678: not their bends, nor their segments)
  const hseg = new Map(), vseg = new Map(), oseg = [];
  for (const w of doc.wires) {
    const id = `w:${w.id}`;
    dsu.find(id);
    for (const pt of [w.points[0], w.points[w.points.length - 1]]) addAt(pt.x, pt.y, id);
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const seg = { a, b, id };
      if (a.y === b.y) { let l = hseg.get(a.y); if (!l) hseg.set(a.y, l = []); l.push(seg); }
      else if (a.x === b.x) { let l = vseg.get(a.x); if (!l) vseg.set(a.x, l = []); l.push(seg); }
      else oseg.push(seg);
    }
  }
  for (const ids of at.values()) for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);
  const segsAt = pt => [...(hseg.get(pt.y) || []), ...(vseg.get(pt.x) || []), ...oseg].filter(s => onSeg(pt, s.a, s.b));
  // (a wire ended on another's segment, a pin dropped onto a wire, #170: that wire was split there,
  // splitWiresAt, the joint an end of both; a wire passing over a pin or a wire end does not connect)
  // labels: attach to the wire under them (or a pin/marker at that point)
  const labelOf = new Map();
  for (const l of doc.labels) {
    const id = `l:${l.id}`;
    dsu.find(id);
    const segs = segsAt(l);
    const here = at.get(key(l.x, l.y)) || [];
    if (segs.length) segs.forEach(s => dsu.union(id, s.id));
    else if (here.length) here.forEach(h => dsu.union(id, h));
    else diags.push({ severity: 'warning', message: `net name '${l.net}' is not attached to a wire`, ref: { kind: 'label', id: l.id }, x: l.x, y: l.y });
    const pn = parseNetName(l.net);
    if (pn.bad) diags.push({ severity: 'error', message: `invalid net name '${l.net}'`, ref: { kind: 'label', id: l.id }, x: l.x, y: l.y });
    labelOf.set(id, { label: l, ...pn });
  }
  // same names join (labels and I/O markers)
  const byName = new Map();
  for (const [id, L] of labelOf) { const k = nk(L.base); if (byName.has(k)) dsu.union(byName.get(k), id); else byName.set(k, id); }
  for (const p of doc.ports) { const k = nk(p.name); if (byName.has(k)) dsu.union(byName.get(k), `o:${p.id}`); else byName.set(k, `o:${p.id}`); }

  // groups
  const groups = new Map();
  const all = [...pinInfo.keys(), ...doc.wires.map(w => `w:${w.id}`), ...labelOf.keys()];
  for (const id of all) { const r = dsu.find(id); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(id); }
  const nets = [];
  const pinNet = new Map(), portNet = new Map(), wireNet = new Map(), labelNet = new Map();
  const used = new Set([...doc.ports.map(p => nk(p.name)), ...[...labelOf.values()].map(L => nk(L.base))]);
  let auto = 0;
  const order = doc.symbols.flatMap(s => defs.get(s.id).pins.map(p => `p:${s.id}/${p.name}`));
  const orderIdx = new Map(order.map((id, i) => [id, i]));
  const sorted = [...groups.values()].map(g => {
    const first = Math.min(...g.map(id => orderIdx.get(id) ?? (1e9 + (id.startsWith('w:') ? 0 : 1))));
    return { g, first };
  }).sort((a, b) => a.first - b.first);
  for (const { g } of sorted) {
    const eps = g.filter(id => pinInfo.has(id)).map(id => pinInfo.get(id));
    const wires = g.filter(id => id.startsWith('w:')).map(id => id.slice(2));
    const labels = g.filter(id => id.startsWith('l:')).map(id => labelOf.get(id));
    if (!eps.length && !wires.length && !labels.length) continue;
    const ports = eps.filter(e => e.kind === 'port');
    const net = { id: `N${nets.length + 1}`, name: null, auto: false, width: null, endpoints: eps, wires, labels: labels.map(L => L.label.id), ports: ports.map(e => e.port), drivers: [] };
    // name: I/O marker > label > auto
    const lnames = [...new Set(labels.map(L => L.base))];
    if (ports.length) {
      net.name = ports.find(p => p.dir === 'in')?.name || ports[0].name;
      const bad = lnames.filter(n => nk(n) !== nk(net.name) && !ports.some(p => nk(p.name) === nk(n)));
      if (bad.length) diags.push({ severity: 'warning', message: `net of I/O marker '${net.name}' also named ${bad.map(b => `'${b}'`).join(', ')} (marker name used)`, ref: { kind: 'label', id: labels[0].label.id }, x: labels[0].label.x, y: labels[0].label.y });
    } else if (lnames.length) {
      net.name = lnames.slice().sort()[0];
      if (new Set(lnames.map(nk)).size > 1) diags.push({ severity: 'error', message: `net has several names: ${lnames.join(', ')}`, ref: { kind: 'label', id: labels[0].label.id }, x: labels[0].label.x, y: labels[0].label.y });
    } else {
      do auto++; while (used.has(nk(`net_${auto}`)));
      net.name = `net_${auto}`; net.auto = true;
    }
    // width
    const pinW = eps.filter(e => isNum(e.width));
    const lw = labels.map(L => L.width).filter(isNum);
    const portW = ports.map(p => p.width);
    const cands = [...portW, ...lw, ...pinW.map(e => e.width)];
    const drv = eps.filter(e => (e.kind === 'pin' && e.dir === 'out') || (e.kind === 'port' && e.dir === 'in'));
    net.drivers = drv;
    net.width = portW[0] ?? lw[0] ?? drv.find(e => isNum(e.width))?.width ?? (cands.length ? Math.max(...cands) : (wires.some(id => doc.wires.find(w => w.id === id)?.bus) ? null : 1));
    if (net.width == null) net.width = 1;
    const mism = new Set(cands);
    if (mism.size > 1) {
      const where = pinW.find(e => e.width !== net.width) || eps[0];
      diags.push({ severity: 'error', message: `width mismatch on net '${net.name}': ${[...mism].join(' vs ')} bits`, ref: refOf(where, symById), x: where?.x, y: where?.y, net: net.name });
    }
    const pt = eps[0] || (labels[0] && labels[0].label) || doc.wires.find(w => w.id === wires[0])?.points[0];
    // drivers: tri-state outputs (and bidirectional pins / markers) may share a net, a bus; an ordinary
    // output or an input marker must be its only driver
    const outs = eps.filter(e => e.dir === 'out' && e.kind === 'pin' && !e.tri);
    const ins = eps.filter(e => e.kind === 'port' && e.dir === 'in');
    const tris = eps.filter(e => e.dir === 'out' && e.kind === 'pin' && e.tri);
    if (outs.length + ins.length > 1)
      diags.push({ severity: 'error', message: `net '${net.name}' has ${outs.length + ins.length} drivers (${[...outs, ...ins].map(e => epName(e, symById, doc)).join(', ')})`, ref: refOf(outs[0] || ins[0], symById), x: (outs[0] || ins[0]).x, y: (outs[0] || ins[0]).y, net: net.name });
    else if (outs.length + ins.length === 1 && tris.length) {
      const d = outs[0] || ins[0];
      diags.push({ severity: 'error', message: `net '${net.name}' is driven by ${epName(d, symById, doc)} and by the tri-state output${tris.length > 1 ? 's' : ''} ${tris.map(e => epName(e, symById, doc)).join(', ')}: only tri-state outputs and bidirectional pins may share a net`, ref: refOf(d, symById), x: d.x, y: d.y, net: net.name });
    }
    if (tris.length) net.tristate = true;
    const sinks = eps.filter(e => (e.kind === 'pin' && e.dir !== 'out') || (e.kind === 'port' && e.dir !== 'in'));
    const inouts = eps.filter(e => e.dir === 'inout');
    const isolated = eps.length === 1 && !wires.length && !labels.length;
    if (!drv.length && sinks.length && !inouts.length && !isolated)
      diags.push({ severity: 'warning', message: `net '${net.name}' has no driver (read by ${sinks.map(e => epName(e, symById, doc)).join(', ')})`, ref: refOf(sinks[0], symById), x: sinks[0].x, y: sinks[0].y, net: net.name });
    if (!eps.length) diags.push({ severity: 'warning', message: `dangling wire${wires.length > 1 ? 's' : ''}${labels.length ? ` (net '${net.name}')` : ''} not connected to any pin`, ref: { kind: 'wire', id: wires[0] || '' }, x: pt?.x, y: pt?.y, net: net.name });
    else if (eps.length === 1 && (wires.length || labels.length) && !(labels.length && byNameCount(labels, labelOf, nk) > 0)) {
      const e = eps[0];
      // (not a signal of the HDL kept in the schematic, declared there: that HDL uses it, e.g. a
      // testbench's task reading an instance's output, #225)
      if ((e.kind === 'pin' || !wires.length) && !(labels.length && declaredHere(net.name)))
        diags.push({ severity: 'warning', message: `net '${net.name}' connects only ${epName(e, symById, doc)}`, ref: refOf(e, symById), x: e.x, y: e.y, net: net.name });
    }
    nets.push(net);
    for (const e of eps) { if (e.kind === 'pin') pinNet.set(`${e.sym}/${e.pin}`, net); else portNet.set(e.port, net); }
    for (const w of wires) wireNet.set(w, net);
    for (const L of labels) labelNet.set(L.label.id, net);
  }
  // unconnected pins
  for (const s of doc.symbols) {
    for (const p of defs.get(s.id).pins) {
      const net = pinNet.get(`${s.id}/${p.name}`);
      const alone = !net || net.endpoints.length + net.wires.length + net.labels.length <= 1;
      // (a primitive's input it works without: tied, #791)
      if (alone && p.dir !== 'out' && !(SYMBOLS[s.type]?.prim && !p.need)) {
        const pp = symbolPins(s, modules, defs.get(s.id)).find(q => q.name === p.name);
        diags.push({ severity: s.type === 'module' ? 'warning' : 'warning', message: `input pin ${p.name} of ${s.name} (${s.type === 'module' ? s.params.module : SYMBOLS[s.type]?.prim ? defs.get(s.id).title : s.type}) is not connected`, ref: { kind: 'symbol', id: s.id, pin: p.name }, x: pp.x, y: pp.y });
      }
    }
  }
  for (const p of doc.ports) {
    const net = portNet.get(p.id);
    if (!net || net.endpoints.length <= 1) diags.push({ severity: 'warning', message: `I/O marker '${p.name}' is not connected`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y });
  }
  // duplicate instance / port names
  const seen = new Map();
  for (const s of doc.symbols) { const k = nk(s.name); if (seen.has(k)) diags.push({ severity: 'error', message: `duplicate instance name '${s.name}'`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y }); seen.set(k, s); }
  // an instance named with a reserved word (#679): the label of a module's instance in the HDL (an error when
  // the HDL would not compile), a warning for the others
  for (const s of doc.symbols) if (rsvd(s.name)) diags.push({ severity: s.type === 'module' && !validIdent(s.name, doc.lang) ? 'error' : 'warning', message: `${rsvd(s.name)}: rename it`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y });
  const pseen = new Set();
  for (const p of doc.ports) { const k = nk(p.name); if (pseen.has(k)) diags.push({ severity: 'error', message: `duplicate I/O marker '${p.name}'`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y }); pseen.add(k); }
  return { nets, pinNet, portNet, wireNet, labelNet, junctions: junctionsOf(doc, pinInfo), diagnostics: diags };
}
function byNameCount(labels, labelOf, nk) { return 0; }
function refOf(e, symById) {
  if (!e) return { kind: 'sheet' };
  return e.kind === 'pin' ? { kind: 'symbol', id: e.sym, pin: e.pin } : { kind: 'port', id: e.port };
}
function epName(e, symById, doc) {
  if (e.kind === 'pin') { const s = symById.get(e.sym); return `${s?.name ?? '?'}.${e.pin}`; }
  return `port ${doc.ports.find(p => p.id === e.port)?.name ?? '?'}`;
}

// Junction dots: points where three or more branches meet (wire ends, a pin or a marker, #678; a wire
// through the point counts two, but connects there only at a vertex shared with ends).
function junctionsOf(doc, pinInfo = new Map()) {
  const arms = new Map();
  const add = (pt, n) => { const k = key(pt.x, pt.y); arms.set(k, (arms.get(k) || 0) + n); };
  for (const w of doc.wires) { const P = w.points; add(P[0], 1); add(P[P.length - 1], 1); }
  for (const pt of pinInfo.values()) if (arms.has(key(pt.x, pt.y))) add(pt, 1);
  const out = [];
  for (const [k, n] of arms) if (n >= 3) { const [x, y] = k.split(',').map(Number); out.push({ x, y }); }
  return out;
}

// Where two wires cross without connecting (#692): a horizontal segment and a vertical one, the point
// inside both (not an end of either: a wire's end, a bend, a T-junction). [{ x, y, wire, seg }]: the
// horizontal segment's wire and index, which hops over the vertical one. A view of the drawing only.
export function wireCrossings(doc) {
  const H = [], Vt = [];
  for (const w of doc.wires) for (let i = 0; i + 1 < w.points.length; i++) {
    const a = w.points[i], b = w.points[i + 1];
    if (a.y === b.y && a.x !== b.x) H.push({ w: w.id, i, y: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    else if (a.x === b.x && a.y !== b.y) Vt.push({ w: w.id, i, x: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
  }
  const out = [];
  for (const h of H) for (const v of Vt) if (v.x > h.lo && v.x < h.hi && h.y > v.lo && h.y < v.hi) out.push({ x: v.x, y: h.y, wire: h.w, seg: h.i });
  return out;
}

// the segment of wire w that point p is inside of (on a segment or a bend, not one of its ends), or -1
function interiorAt(w, p) {
  const P = w.points, n = P.length;
  if ((P[0].x === p.x && P[0].y === p.y) || (P[n - 1].x === p.x && P[n - 1].y === p.y)) return -1;
  for (let i = 0; i + 1 < n; i++) if (onSeg(p, P[i], P[i + 1])) return i;
  return -1;
}

// Splits the wires (of ids, or all of them) at the points inside them, so that each point is an end of
// the wires through it and connects there (#678): a wire ended on another's segment, a symbol or an
// I/O marker dropped onto a wire (#170). Returns the wires added, [{ id, from }] (from: the wire split).
export function splitWiresAt(doc, pts, ids = null) {
  const used = new Set(doc.wires.map(w => w.id));
  const nid = () => { let k = doc.wires.length + 1; while (used.has(`W${k}`)) k++; used.add(`W${k}`); return `W${k}`; };
  const added = [];
  for (const p of pts) {
    for (let j = 0; j < doc.wires.length; j++) {
      const w = doc.wires[j];
      if (ids && !ids.has(w.id) && !added.some(a => a.id === w.id)) continue;
      const i = interiorAt(w, p);
      if (i < 0) continue;
      const P = w.points, same = q => q.x === p.x && q.y === p.y;
      const head = P.slice(0, i + 1), tail = P.slice(i + 1);
      if (!same(head[head.length - 1])) head.push({ x: p.x, y: p.y });
      if (!same(tail[0])) tail.unshift({ x: p.x, y: p.y });
      w.points = head;
      const t = { id: nid(), points: tail };
      if (w.bus) t.bus = true;
      doc.wires.splice(j + 1, 0, t);
      added.push({ id: t.id, from: w.id });
    }
  }
  return added;
}

// The connections made in the middle of wires, as wire ends (#678): the wires split at every pin,
// I/O marker and wire end inside them, and at the bends two wires share. For a document of version 2
// (its nets kept) and the schematics made by the app (from HDL, a truth table, ISE's .sch).
export function joinOnWires(doc, modules = {}) {
  modules = normModules(modules);
  const pts = [];
  for (const s of doc.symbols) for (const p of symbolPins(s, modules)) pts.push(p);
  for (const p of doc.ports) pts.push(p);
  return joinWires(doc, pts);
}
// (of the wires of ids, or all of them: at the points given, their ends and their shared bends; a
// generator's net, its wires joined to its own pins only)
export function joinWires(doc, pts, ids = null) {
  pts = [...pts];
  const bends = new Map();
  for (const w of doc.wires) {
    if (ids && !ids.has(w.id)) continue;
    pts.push(w.points[0], w.points[w.points.length - 1]);
    for (const q of new Set(w.points.slice(1, -1).map(q => key(q.x, q.y)))) bends.set(q, (bends.get(q) || 0) + 1);
  }
  for (const [k, n] of bends) if (n > 1) { const [x, y] = k.split(',').map(Number); pts.push({ x, y }); }
  return splitWiresAt(doc, pts, ids);
}

// ===================================================================== HDL text helpers
// (the shared lists, core/reserved.js, #679: a name the HDL of its language refuses is an error; one that is
// a reserved word in another letter case, of the other language or of SystemVerilog, a warning)
const VHDL_RESERVED = VHDL93_WORDS;
const VLOG_RESERVED = new Set([...VERILOG_WORDS, 'logic']);
// an existing name: a word of VHDL or Verilog (SystemVerilog's own words are refused only for a new name)
const rsvd = n => reservedError(n, { sv: false });
export function validIdent(name, lang) {
  if (lang === 'vhdl') return /^[A-Za-z](?:_?[A-Za-z0-9])*$/.test(name) && !VHDL_RESERVED.has(name.toLowerCase());
  return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(name) && !VLOG_RESERVED.has(name);
}

// value text ("5", "0x1F", "0b01xz", "'1'", "8'hFF", "x\"0F\"") -> bit string of the given width (MSB first)
export function constBits(value, width) {
  let s = String(value ?? '0').trim().replace(/_/g, '');
  let bits = null;
  let m;
  if ((m = /^'([01xzXZuU-])'$/.exec(s))) bits = m[1];
  else if ((m = /^(?:0b|b)"?([01xzXZ]+)"?$/i.exec(s)) || (m = /^"([01xzXZuU-]+)"$/.exec(s))) bits = m[1];
  else if ((m = /^(?:0x|x)"?([0-9a-f]+)"?$/i.exec(s))) bits = BigInt('0x' + m[1]).toString(2);
  else if ((m = /^(\d+)?'([bhdo])([0-9a-fxz]+)$/i.exec(s))) {
    const base = m[2].toLowerCase();
    if (base === 'b') bits = m[3];
    else if (base === 'h' && !/[xz]/i.test(m[3])) bits = BigInt('0x' + m[3]).toString(2);
    else if (base === 'o') bits = BigInt('0o' + m[3]).toString(2);
    else if (base === 'd') bits = BigInt(m[3]).toString(2);
  } else if ((m = /^-?\d+$/.exec(s))) {
    let v = BigInt(s);
    if (v < 0n) v = (1n << BigInt(width)) + v;
    bits = v.toString(2);
  }
  if (bits == null) return null;
  bits = bits.toLowerCase().replace(/[u-]/g, 'x');
  if (bits.length > width) bits = bits.slice(bits.length - width);
  if (bits.length < width) bits = (bits[0] === 'x' || bits[0] === 'z' ? bits[0] : '0').repeat(width - bits.length) + bits;
  return bits;
}
const vhdlBits = (bits, scalar) => (scalar ? `'${bits.toUpperCase()}'` : `"${bits.toUpperCase()}"`);
const vlogBits = bits => `${bits.length}'b${bits}`;

// Tokenizer shared by the source span helpers. Tokens: { v (lower-cased for VHDL ids), s, e, k }
export function tokenize(text, lang) {
  const toks = [];
  const n = text.length;
  let i = 0;
  const vh = lang === 'vhdl';
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f') { i++; continue; }
    if (vh && c === '-' && text[i + 1] === '-') { while (i < n && text[i] !== '\n') i++; continue; }
    if (!vh && c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (!vh && c === '(' && text[i + 1] === '*' && text[i + 2] !== ')') { const e = text.indexOf('*)', i + 2); i = e < 0 ? n : e + 2; continue; }
    const s = i;
    if (c === '"') {
      i++;
      while (i < n) { if (text[i] === '\\' && !vh) { i += 2; continue; } if (text[i] === '"') { if (vh && text[i + 1] === '"') { i += 2; continue; } i++; break; } if (text[i] === '\n') break; i++; }
      toks.push({ v: text.slice(s, i), s, e: i, k: 'str' }); continue;
    }
    if (vh && c === "'") {
      const prev = toks[toks.length - 1];
      const isTick = prev && (prev.k === 'id' || prev.v === ')') && !(prev.k === 'id' && /^(when|else|then|return|and|or|xor|not|nand|nor|xnor|is|of|in|out|select|report|severity)$/.test(prev.v));
      if (!isTick && text[i + 2] === "'") { toks.push({ v: text.slice(i, i + 3), s, e: i + 3, k: 'chr' }); i += 3; continue; }
      toks.push({ v: "'", s, e: i + 1, k: 'op' }); i++; continue;
    }
    if (/[A-Za-z_]/.test(c) || (!vh && (c === '$' || c === '`'))) {
      i++;
      while (i < n && /[\w$]/.test(text[i])) i++;
      const raw = text.slice(s, i);
      toks.push({ v: vh ? raw.toLowerCase() : raw, raw, s, e: i, k: 'id' }); continue;
    }
    if (!vh && c === '\\') { while (i < n && !/\s/.test(text[i])) i++; toks.push({ v: text.slice(s, i), s, e: i, k: 'id' }); continue; }
    if (/[0-9]/.test(c) || (!vh && c === "'" && /[sSbBhHdDoO]/.test(text[i + 1] || ''))) {
      if (!vh) {
        while (i < n && /[0-9_]/.test(text[i])) i++;
        let j = i; while (text[j] === ' ') j++;
        if (text[j] === "'" && /[sSbBhHdDoO]/.test(text[j + 1] || '')) {
          i = j + 1; if (/[sS]/.test(text[i])) i++; i++;
          while (text[i] === ' ') i++;
          while (i < n && /[0-9a-fA-FxXzZ_?]/.test(text[i])) i++;
        } else if (text[i] === '.') { i++; while (i < n && /[0-9]/.test(text[i])) i++; }
      } else {
        while (i < n && /[0-9_.#a-fA-F]/.test(text[i])) { if (text[i] === '#') { i++; while (i < n && /[0-9a-fA-F_.]/.test(text[i])) i++; if (text[i] === '#') i++; break; } i++; }
      }
      toks.push({ v: text.slice(s, i), s, e: i, k: 'num' }); continue;
    }
    const two = text.slice(i, i + 2), three = text.slice(i, i + 3);
    const ops3 = ['<<<', '>>>', '===', '!=='];
    const ops2 = vh ? ['<=', '=>', ':=', '/=', '>=', '**', '<>'] : ['<=', '>=', '==', '!=', '&&', '||', '<<', '>>', '~&', '~|', '~^', '^~', '+:', '-:', '**', '->'];
    let op = c;
    if (!vh && ops3.includes(three)) op = three; else if (ops2.includes(two)) op = two;
    toks.push({ v: op, s, e: i + op.length, k: 'op' });
    i += op.length;
  }
  return toks;
}

function lineStarts(text) { const a = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') a.push(i + 1); return a; }
function offsetOf(ls, loc) { if (!loc) return -1; return (ls[loc.line - 1] ?? 0) + (loc.col || 1) - 1; }
function tokAt(toks, off) { let lo = 0, hi = toks.length; while (lo < hi) { const m = (lo + hi) >> 1; if (toks[m].e <= off) lo = m + 1; else hi = m; } return lo; }
function skipParen(toks, i) {
  // toks[i] should be '(' ; returns index after the matching ')'
  if (toks[i]?.v !== '(') return i;
  let d = 0;
  for (; i < toks.length; i++) { if (toks[i].v === '(') d++; else if (toks[i].v === ')') { d--; if (d === 0) return i + 1; } }
  return i;
}
function toSemi(toks, i) {
  let d = 0;
  for (; i < toks.length; i++) {
    const v = toks[i].v;
    if (v === '(' || v === '[' || v === '{') d++;
    else if (v === ')' || v === ']' || v === '}') d--;
    else if (v === ';' && d <= 0) return i + 1;
  }
  return i;
}
function stripComments(s, lang) {
  return lang === 'vhdl' ? s.replace(/--[^\n]*/g, '') : s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
const squash = s => s.replace(/\s+/g, ' ').trim();

// re-indent a verbatim slice whose first line started at column `col` (1-based)
function dedent(text, col = 1) {
  const lines = text.replace(/\r/g, '').split('\n');
  const first = lines[0];
  let min = Infinity;
  for (const l of lines.slice(1)) if (l.trim()) min = Math.min(min, l.length - l.trimStart().length);
  const firstIndent = col - 1;
  min = Math.min(min, firstIndent);
  if (!Number.isFinite(min)) min = 0;
  const out = [first.trimStart(), ...lines.slice(1).map(l => (l.trim() ? l.slice(Math.min(min, l.length - l.trimStart().length)) : ''))];
  // for the first line, relative indent is firstIndent - min (keep it flush left)
  return out.join('\n').replace(/\s+$/, '');
}
// remove the common indentation of all lines (and surrounding blank lines)
export function dedentBlock(text) {
  const lines = String(text ?? '').replace(/\r/g, '').replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let min = Infinity;
  for (const l of lines) if (l.trim()) min = Math.min(min, l.length - l.trimStart().length);
  if (!Number.isFinite(min)) min = 0;
  return lines.map(l => l.slice(Math.min(min, l.length - l.trimStart().length)).replace(/\s+$/, '')).join('\n');
}
const indent = (text, pad) => String(text).split('\n').map(l => (l.trim() ? pad + l : '')).join('\n');

// The text of a statement [s0, e0) with its comments (#225: an HDL block keeps them): the comment
// lines just above it and the comment ending its last line; not the comments the generated HDL
// writes itself (a block's title line, the file's header, a block entity's mark), so that a module
// made again from its generated HDL does not take them. Verilog: also an attribute (* … *) before it.
// Returns [s, e].
function withComments(text, s0, e0, lang) {
  const c = lang === 'vhdl' ? '--' : '//';
  const own = new RegExp(`^\\s*${c} *(\\S+: HDL block\\b|Generated by Silinx\\b|${BLOCK_MARK}\\b)`);
  const isC = new RegExp(`^\\s*${c}`);
  let s = s0, e = e0;
  if (lang !== 'vhdl') { const m = /\(\*[^\n]*?\*\)\s*$/.exec(text.slice(Math.max(0, s - 200), s)); if (m) s -= m[0].length; }
  let ls = text.lastIndexOf('\n', s - 1) + 1;
  if (!text.slice(ls, s).trim()) {
    while (ls > 0) {
      const p = text.lastIndexOf('\n', ls - 2) + 1;
      const line = text.slice(p, ls - 1);
      if (!isC.test(line) || own.test(line)) break;
      s = p + line.length - line.trimStart().length;
      ls = p;
    }
  }
  const nl = text.indexOf('\n', e);
  const rest = text.slice(e, nl < 0 ? text.length : nl);
  if (isC.test(rest) && !own.test(rest)) e += rest.replace(/\s+$/, '').length;
  return [s, e];
}
// a Verilog text with its compiler directive lines (`ifdef, `else, `endif, `define…) blanked (the
// same offsets): a statement after `endif starts at its own keyword
function blankDirectives(text) {
  return text.replace(/^[ \t]*`(ifdef|ifndef|elsif|else|endif|define|undef|include|timescale|default_nettype|resetall|celldefine|endcelldefine|line|pragma)\b[^\n]*/gm, m => ' '.repeat(m.length));
}

// Verilog statement extent (token index -> index after the statement)
function vStmt(toks, i) {
  const t = toks[i];
  if (!t) return i;
  const v = t.v;
  const match = (open, close) => {
    let d = 0;
    for (; i < toks.length; i++) {
      if (open.includes(toks[i].v)) d++;
      else if (close.includes(toks[i].v)) { d--; if (d === 0) { i++; if (toks[i]?.v === ':' && close.includes('end')) i += 2; return i; } }
    }
    return i;
  };
  if (v === 'begin') return match(['begin'], ['end']);
  if (v === 'fork') return match(['fork'], ['join', 'join_any', 'join_none']);
  if (v === 'case' || v === 'casez' || v === 'casex') return match(['case', 'casez', 'casex'], ['endcase']);
  if (v === 'if') { i = vStmt(toks, skipParen(toks, i + 1)); if (toks[i]?.v === 'else') i = vStmt(toks, i + 1); return i; }
  if (v === 'for' || v === 'while' || v === 'repeat' || v === 'foreach') return vStmt(toks, skipParen(toks, i + 1));
  if (v === 'forever') return vStmt(toks, i + 1);
  if (v === 'wait') { i = skipParen(toks, i + 1); return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i); }
  if (v === '@') {
    i++;
    if (toks[i]?.v === '(') i = skipParen(toks, i); else i++;
    return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i);
  }
  if (v === '#') {
    i++;
    if (toks[i]?.v === '(') i = skipParen(toks, i); else i++;
    return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i);
  }
  if (v === ';') return i + 1;
  return toSemi(toks, i);
}
const V_BOUNDARY = new Set([';', 'end', 'endcase', 'endfunction', 'endtask', 'endgenerate', 'generate', 'begin', 'endmodule', 'join']);
function vStmtStart(toks, i) {
  let j = i;
  while (j > 0 && !V_BOUNDARY.has(toks[j - 1].v)) j--;
  // skip a label after begin / end ( "begin : name" ) - not expected at module level
  return j;
}

// ===================================================================== IR expression printers
const V_OPS = { nand: null, nor: null };
function prVlog(e) {
  if (!e) return '';
  switch (e.op) {
    case 'lit': return e.scalar || !e.sized ? (e.scalar ? `1'b${e.bits}` : `'b${e.bits}`) : `${e.bits.length}'b${e.bits}`;
    case 'int': return e.value;
    case 'real': return String(e.value);
    case 'str': return JSON.stringify(e.value);
    case 'ref': return e.name;
    case 'index': return `${prVlog(e.base)}[${prVlog(e.index)}]`;
    case 'slice': return `${prVlog(e.base)}[${prVlog(e.left)}:${prVlog(e.right)}]`;
    case 'pslice': return `${prVlog(e.base)}[${prVlog(e.start)} ${e.dir}: ${prVlog(e.width)}]`;
    case 'apply': case 'call': return `${e.name}(${e.args.map(a => prVlog(a.named !== undefined ? a.value : a)).join(', ')})`;
    case 'concat': return `{${e.parts.map(prVlog).join(', ')}}`;
    case 'repl': return `{${prVlog(e.count)}{${prVlog(e.value)}}}`;
    case 'unary': return `${e.o}(${prVlog(e.a)})`;
    case 'binary': {
      if (e.o === 'nand') return `~(${prVlog(e.a)} & ${prVlog(e.b)})`;
      if (e.o === 'nor') return `~(${prVlog(e.a)} | ${prVlog(e.b)})`;
      const o = { mod: '%', rem: '%' }[e.o] || e.o;
      return `(${prVlog(e.a)} ${o} ${prVlog(e.b)})`;
    }
    case 'cond': return `(${prVlog(e.cond)} ? ${prVlog(e.then)} : ${prVlog(e.else)})`;
  }
  return '0';
}
function prVhdl(e) {
  if (!e) return '';
  switch (e.op) {
    case 'lit': return e.scalar ? `'${e.bits.toUpperCase()}'` : `"${e.bits.toUpperCase()}"`;
    case 'int': return e.value;
    case 'real': return String(e.value).includes('.') ? String(e.value) : `${e.value}.0`;
    case 'phys': return `${e.value} ${e.unit}`;
    case 'str': return `"${String(e.value).replace(/"/g, '""')}"`;
    case 'ref': return e.name;
    case 'index': return `${prVhdl(e.base)}(${prVhdl(e.index)})`;
    case 'slice': return `${prVhdl(e.base)}(${prVhdl(e.left)} downto ${prVhdl(e.right)})`;
    case 'apply': return `${e.name}(${e.args.map(a => (a.named !== undefined ? `${a.named} => ${prVhdl(a.value)}` : prVhdl(a))).join(', ')})`;
    case 'call': return `${e.name}(${e.args.map(prVhdl).join(', ')})`;
    case 'concat': return e.parts.map(prVhdl).join(' & ');
    case 'unary': return e.o === '~' ? `not ${prVhdl(e.a)}` : e.o === 'abs' ? `abs ${prVhdl(e.a)}` : `${e.o}${prVhdl(e.a)}`;
    case 'binary': {
      const o = { '&': 'and', '|': 'or', '^': 'xor', '~^': 'xnor', '==': '=', '!=': '/=', '<<': 'sll', '>>': 'srl', '<<<': 'sla', '>>>': 'sra', '%': 'rem' }[e.o] || e.o;
      return `(${prVhdl(e.a)} ${o} ${prVhdl(e.b)})`;
    }
    case 'attr': return `${prVhdl(e.prefix)}'${e.attr}${e.args?.length ? `(${e.args.map(prVhdl).join(', ')})` : ''}`;
    case 'aggregate': return `(${e.items.map(i => (i.choices ? i.choices.map(c => (c === 'others' ? 'others' : c.range ? `${prVhdl(c.range.left)} ${c.range.dir || 'to'} ${prVhdl(c.range.right)}` : prVhdl(c))).join(' | ') + ' => ' : '') + prVhdl(i.value)).join(', ')})`;
    case 'qualified': return `${e.type}'(${prVhdl(e.expr)})`;
  }
  return '0';
}
const unparen = s => (/^\(.*\)$/.test(s) && balanced(s.slice(1, -1)) ? s.slice(1, -1) : s);
function balanced(s) { let d = 0; for (const c of s) { if (c === '(') d++; else if (c === ')') { d--; if (d < 0) return false; } } return d === 0; }

function typeTextVhdl(t) {
  if (!t) return 'std_logic';
  if (t.kind === 'logic') {
    if (!t.range) return 'std_logic';
    return `${t.signed ? 'signed' : 'std_logic_vector'}(${unparen(prVhdl(t.range.left))} ${t.range.dir || 'downto'} ${unparen(prVhdl(t.range.right))})`;
  }
  if (t.kind === 'integer') return t.range ? `integer range ${unparen(prVhdl(t.range.left))} ${t.range.dir || 'to'} ${unparen(prVhdl(t.range.right))}` : 'integer';
  if (t.kind === 'boolean') return 'boolean';
  if (t.kind === 'named') return t.name;
  return 'std_logic';
}
function rangeTextVlog(t) {
  if (!t || !t.range) return '';
  return `[${unparen(prVlog(t.range.left))}:${unparen(prVlog(t.range.right))}]`;
}

// ===================================================================== HDL generation
// VHDL type class of a type text: 'sl' | 'slv' | 'u' | 's' | 'other'
function vhdlClass(type) {
  const t = String(type || '').trim().toLowerCase();
  if (/^(ieee\.)?std_u?logic$/.test(t) || t === 'bit') return 'sl';
  if (/^(ieee\.)?std_u?logic_vector\b/.test(t) || /^bit_vector\b/.test(t)) return 'slv';
  if (/^unsigned\b/.test(t)) return 'u';
  if (/^signed\b/.test(t)) return 's';
  return 'other';
}

// declarations found in a verbatim declaration text: Map(name(lower for VHDL) -> { type, kind, reg })
function declaredIn(decls, lang) {
  const out = new Map();
  if (!decls || !String(decls).trim()) return out;
  if (lang === 'vhdl') {
    const src = `entity silinx_decl_probe is end;\narchitecture a of silinx_decl_probe is\n${decls}\nbegin\nend;`;
    let r;
    try { r = parseVhdl(src, 'decls'); } catch { r = null; }
    const types = new Map();
    const body = stripComments(String(decls), 'vhdl');
    for (const m of body.matchAll(/\b(signal|constant|variable|shared\s+variable)\s+([A-Za-z][\w\s,]*?)\s*:\s*([^;]*);/gi)) {
      const type = squash(m[3].split(':=')[0]);
      for (const nm of m[2].split(',')) types.set(nm.trim().toLowerCase(), { type, kind: m[1].toLowerCase() });
    }
    const u = r?.units?.find(x => x.kind === 'module');
    for (const d of u?.decls || []) out.set(d.name.toLowerCase(), { kind: d.kind, type: types.get(d.name.toLowerCase())?.type || null });
    for (const [k, v] of types) if (!out.has(k)) out.set(k, v);
    for (const m of body.matchAll(/\b(type|subtype|component|function|procedure|alias|attribute)\s+([A-Za-z]\w*)/gi)) if (!out.has(m[2].toLowerCase())) out.set(m[2].toLowerCase(), { kind: m[1].toLowerCase() });
    return out;
  }
  let r;
  try { r = parseVerilog(`module silinx_decl_probe;\n${decls}\nendmodule\n`, 'decls'); } catch { r = null; }
  const u = r?.units?.find(x => x.kind === 'module');
  for (const d of u?.decls || []) out.set(d.name, { kind: d.kind, reg: d.net === 'reg' || d.net === 'variable', type: null });
  for (const p of u?.params || []) out.set(p.name, { kind: 'const' });
  for (const m of stripComments(String(decls), 'verilog').matchAll(/\b(genvar|reg|integer|wire|logic)\b\s*(?:signed\s*)?(?:\[[^\]]*\]\s*)?([A-Za-z_][\w$]*)/g)) if (!out.has(m[2])) out.set(m[2], { kind: m[1], reg: m[1] === 'reg' || m[1] === 'integer' });
  return out;
}

// Generate structural HDL from a schematic document.
// The schematic's blocks that the HDL keeps as blocks (#175): an entity / module of their own per kind,
// instanced where the schematic has them (as ISE does with its library macros); the gates,
// constants and bus pieces stay expressions, the project modules and HDL blocks what they are.
const BLOCK_TYPES = new Set(['mux2', 'mux4', 'mux8', 'mux16', 'demux', 'decoder', 'encoder', 'add', 'sub', 'compare', 'register', 'counter']);   // (tri-state buffers: on shared buses, like the gates)
export const isBlockSymbol = t => BLOCK_TYPES.has(t) || !!SYMBOLS[t]?.ff;
// the first line of a block's own entity: what it was drawn as, so that the HDL turns back into it
export const BLOCK_MARK = 'silinx-symbol';
export function blockMarkOf(text, name) {
  const re = new RegExp(`(?:--|//) ${BLOCK_MARK} ([a-z0-9_]+) (\\{[^\\n]*\\})[^\\n]*\\n(?:[^\\n]*\\n){0,8}?\\s*(?:entity|module)\\s+${name}\\b`, 'i');
  const m = re.exec(String(text || ''));
  if (!m || !SYMBOLS[m[1]]) return null;
  let params;
  try { params = JSON.parse(m[2]); } catch { return null; }
  // (a M4_1 / DEMUX of an HDL file generated before #301: its bus pin S)
  if ((m[1] === 'mux4' || m[1] === 'demux') && params && !('selBus' in params)) params.selBus = true;
  return { type: m[1], params };
}

/**
 * opts.structural (default true): the blocks (isBlockSymbol) as entities of their own, instanced;
 * false: all of it in one architecture / module (the blocks' own entities are made that way).
 */
export function generateHdl(docIn, opts = {}) {
  const doc = normalizeDoc(docIn);
  const lang = opts.lang === 'verilog' || opts.lang === 'vhdl' ? opts.lang : doc.lang;
  const modules = normModules(opts.modules);
  const nl = netlist(doc, { modules });
  const diags = nl.diagnostics.map(d => ({ ...d }));
  const ci = lang === 'vhdl';
  const nk = s => (ci ? String(s).toLowerCase() : String(s));
  const hdl = doc.hdl || {};
  const verbatimOK = !hdl.lang || hdl.lang === lang;
  const hasBlocks = doc.symbols.some(s => s.type === 'hdlblock' && (s.hdl || '').trim());
  const blockLang = hdl.lang || doc.lang;
  if (hasBlocks && blockLang !== lang) diags.push({ severity: 'error', message: `HDL blocks contain ${blockLang.toUpperCase()} code: generate ${blockLang.toUpperCase()} (or rewrite the blocks)`, ref: { kind: 'sheet' } });
  if (!verbatimOK && (hdl.decls || '').trim()) diags.push({ severity: 'warning', message: `declarations kept from the ${hdl.lang.toUpperCase()} source were skipped`, ref: { kind: 'sheet' } });
  const declared = verbatimOK ? declaredIn(hdl.decls, lang) : new Map();
  const defs = new Map(doc.symbols.map(s => [s.id, symbolDef(s, modules)]));
  const STRUCT = opts.structural !== false;
  const isBlock = s => STRUCT && isBlockSymbol(s.type);
  const name = validIdent(doc.name, lang) ? doc.name : doc.name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z])/, 'x$1').replace(/_+/g, '_').replace(/_$/, '');
  if (name !== doc.name) diags.push({ severity: 'warning', message: `module name '${doc.name}' is not a valid identifier, using '${name}'`, ref: { kind: 'sheet' } });
  // a module named with a reserved word (#679): an error when its HDL would not compile, else a warning
  if (rsvd(name)) diags.push({ severity: validIdent(name, lang) ? 'warning' : 'error', message: `${rsvd(name)}: rename it`, ref: { kind: 'sheet' } });

  // ports
  const portOf = new Map();       // net -> port
  const ports = [];
  for (const p of doc.ports) {
    const net = nl.portNet.get(p.id);
    if (!validIdent(p.name, lang)) diags.push({ severity: 'error', message: `I/O marker name '${p.name}' is not a valid ${lang.toUpperCase()} identifier`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y });
    else if (rsvd(p.name)) diags.push({ severity: 'warning', message: `${rsvd(p.name)}: rename it`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y });
    ports.push({ ...p, net });
    if (net && !portOf.has(net)) portOf.set(net, p);
  }
  // net names & types
  const netName = net => (net ? (portOf.get(net)?.name ?? net.name) : null);
  // netlist() gives every pin a net: a net made of that pin alone (maybe with a dangling wire,
  // but no other pin, I/O marker or label) is an unconnected pin
  const isolated = n => n.endpoints.length === 1 && !n.labels.length && !n.ports.length && !portOf.has(n);
  /** Net read by an input pin, or null when the pin is unconnected. */
  const inNet = (sym, pin) => { const n = nl.pinNet.get(`${sym.id}/${pin}`); return n && !isolated(n) ? n : null; };
  const P = (sym, pin) => { const n = inNet(sym, pin); return n ? netName(n) : null; };
  const PW = (sym, pin) => nl.pinNet.get(`${sym.id}/${pin}`)?.width ?? defs.get(sym.id).pins.find(p => p.name === pin)?.width ?? 1;
  for (const net of nl.nets) {
    if (!portOf.has(net) && !net.auto && !validIdent(net.name, lang)) diags.push({ severity: 'error', message: `net name '${net.name}' is not a valid ${lang.toUpperCase()} identifier`, ref: { kind: 'label', id: net.labels[0] }, net: net.name });
    else if (!portOf.has(net) && !net.auto && rsvd(net.name)) diags.push({ severity: 'warning', message: `${rsvd(net.name)}: rename it`, ref: { kind: 'label', id: net.labels[0] }, net: net.name });
  }
  // module pin types (VHDL) used to type nets that only connect to module pins
  const pinType = new Map();
  for (const s of doc.symbols) if (s.type === 'module') {
    const m = findMod(modules, s.params.module);
    for (const q of m?.ports || []) if (q.type) { const n = nl.pinNet.get(`${s.id}/${q.name}`); if (n && !pinType.has(n)) pinType.set(n, q.type); }
  }
  const vtype = w => (w > 1 ? `std_logic_vector(${w - 1} downto 0)` : 'std_logic');
  const netType = net => {
    const p = portOf.get(net);
    if (p) return p.type && verbatimOK ? p.type : vtype(p.width);
    const d = declared.get(nk(net.name));
    // a net driven by tri-state buffers needs a resolved type (std_logic, not std_ulogic)
    const res = ty => (net.tristate ? String(ty).replace(/\bstd_ulogic\b/gi, 'std_logic') : ty);
    if (d?.type) return res(d.type);
    return res(pinType.get(net) || vtype(net.width));
  };
  const clsOf = nm => {
    if (!nm) return 'slv';
    const net = nl.nets.find(n => nk(netName(n)) === nk(nm));
    return net ? vhdlClass(netType(net)) : 'slv';
  };

  // procedural drivers (Verilog reg) and initial values
  const regNets = new Set(), init = new Map();
  const FF = new Set(['fd', 'fdc', 'fdce', 'fdre', 'register', 'counter']);
  for (const s of doc.symbols) {
    const def = defs.get(s.id);
    if (isBlock(s)) continue;   // (its own entity holds the register)
    if (FF.has(s.type) || SYMBOLS[s.type]?.ff) {
      const n = nl.pinNet.get(`${s.id}/Q`);
      if (n) { regNets.add(n); if (s.type !== 'counter') init.set(n, constBits(s.params.init ?? '0', n.width) || '0'.repeat(n.width)); }
    }
    if (s.type === 'hdlblock') for (const q of def.pins) if (q.dir === 'out' && q.reg) { const n = nl.pinNet.get(`${s.id}/${q.name}`); if (n) regNets.add(n); }
  }

  const body = [], extra = [];
  const used = new Set([...nl.nets.map(n => nk(netName(n))), ...declared.keys(), ...doc.ports.map(p => nk(p.name)), nk(name)]);
  const fresh = base => { let b = base.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'n'; if (!/^[A-Za-z]/.test(b)) b = 'u' + b; let k = 0, nm = b; while (used.has(nk(nm)) || !validIdent(nm, lang)) nm = `${b}_${++k}`; used.add(nk(nm)); return nm; };
  const warnOpen = (s, pin) => diags.push({ severity: 'warning', message: `${s.name}: input ${pin} unconnected, tied to 0`, ref: { kind: 'symbol', id: s.id, pin } });
  const zero = w => (ci ? (w > 1 ? '(others => \'0\')' : "'0'") : `${w}'b0`);
  const ones = w => (ci ? (w > 1 ? `"${'1'.repeat(w)}"` : "'1'") : `${w}'b${'1'.repeat(w)}`);
  // constant value of an unconnected input. It goes through a signal when it is indexed
  // (`named`) and, in VHDL, when it is a vector: neither an aggregate nor a string literal is
  // legal as the operand of unsigned(...) or as a `with ... select` selector
  const tie = (s, pin, bit, named = false) => {
    const w = PW(s, pin);
    if (!named && (!ci || w === 1)) return bit === '1' ? ones(w) : zero(w);
    const t = fresh(`${s.name}_${pin}_${bit === '1' ? 'ones' : 'zero'}`);
    extra.push(ci ? { name: t, type: vtype(w) } : { name: t, width: w });
    if (ci) body.push(`${t} <= ${w > 1 ? `(others => '${bit}')` : `'${bit}'`};`);
    else assign(t, bit === '1' ? ones(w) : zero(w));
    return t;
  };
  const IN = (s, pin, named) => { const n = P(s, pin); if (n) return n; warnOpen(s, pin); return tie(s, pin, '0', named); };
  const assign = (lhs, rhs) => body.push(ci ? `${lhs} <= ${rhs};` : `assign ${lhs} = ${rhs};`);
  // VHDL-93 cannot read 'out' ports: route internal readers through a local copy
  const outRead = new Map();
  if (ci) {
    for (const p of ports) {
      if (p.dir !== 'out' || !p.net) continue;
      if (portOf.get(p.net)?.id !== p.id) continue;
      const readers = p.net.endpoints.filter(e => (e.kind === 'pin' && e.dir !== 'out') || (e.kind === 'port' && e.port !== p.id && e.dir === 'out'));
      const blockRef = p.net.endpoints.some(e => e.kind === 'pin' && doc.symbols.find(s => s.id === e.sym)?.type === 'hdlblock');
      if (readers.length && !blockRef) {
        const local = fresh(`${p.name}_int`);
        outRead.set(p.net, local);
        extra.push({ name: local, type: p.type && verbatimOK ? p.type : vtype(p.width), init: init.get(p.net) });
        body.push(`${p.name} <= ${local};`);
      }
    }
  }
  const OUTN = (s, pin) => { const n = nl.pinNet.get(`${s.id}/${pin}`); if (!n) return null; return outRead.get(n) || netName(n); };
  const INN = (s, pin, named) => { const n = inNet(s, pin); if (n && outRead.has(n)) return outRead.get(n); return IN(s, pin, named); };
  const castU = (x, cls, sgn) => (sgn ? `signed(${x})` : `unsigned(${x})`);
  const wrapV = (expr, cls) => (cls === 'u' || cls === 's' ? (cls === 's' ? `signed(${expr})` : expr) : `std_logic_vector(${expr})`);

  // the blocks' own entities: one per kind and parameters (and the pins it uses)
  const subs = new Map();   // signature -> { name, code }
  const subNames = new Set();
  const blockInstance = (s, def) => {
    const used = def.pins.map(q => {
      const n = q.dir === 'out' ? nl.pinNet.get(`${s.id}/${q.name}`) : inNet(s, q.name);
      return n && !(q.dir === 'out' && isolated(n)) ? { q, n } : null;
    }).filter(Boolean);
    if (!used.some(u => u.q.dir === 'out')) { diags.push({ severity: 'warning', message: `${s.name}: no output connected, skipped`, ref: { kind: 'symbol', id: s.id } }); return; }
    const sig = JSON.stringify([s.type, s.params, used.map(u => [u.q.name, u.q.width ?? u.n.width])]);
    let sub = subs.get(sig);
    if (!sub) {
      const base = `${name}_${String(def.title || SYMBOLS[s.type]?.title || s.type).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
      let nm = base, k = 1;
      while (subNames.has(nm)) nm = `${base}_${++k}`;
      subNames.add(nm);
      const mini = newDoc(nm, lang);
      const s2 = { ...JSON.parse(JSON.stringify(s)), id: 'S1', x: 200, y: 200, rot: 0, mirror: false, name: 'U1' };
      mini.symbols.push(s2);
      const at = new Map(symbolPins(s2, modules).map(q => [q.name, q]));
      for (const u of used) {
        const q = at.get(u.q.name);
        mini.ports.push({ id: `P${mini.ports.length + 1}`, name: u.q.name, dir: u.q.dir === 'out' ? 'out' : u.q.dir === 'inout' ? 'inout' : 'in', width: u.q.width ?? u.n.width ?? 1, x: q.x, y: q.y });
      }
      const g = generateHdl(mini, { lang, modules, structural: false });
      const c = ci ? '--' : '//';
      const code = g.code.replace(/^(--|\/\/) Generated by Silinx from .*$/m, `${c} ${BLOCK_MARK} ${s.type} ${JSON.stringify(s.params)} (${def.title || SYMBOLS[s.type]?.title || s.type}, a block of ${name})`);
      // its messages (about its symbol, U1 there), said of each instance
      const own = g.diagnostics.filter(d => d.ref?.kind === 'symbol' || d.severity === 'error').map(d => ({ severity: d.severity, message: d.message, pin: d.ref?.pin }));
      subs.set(sig, sub = { name: nm, code, own });
    }
    for (const d of sub.own) diags.push({ severity: d.severity, message: /^U1\b/.test(d.message) ? d.message.replace(/^U1\b/, s.name) : `${s.name}: ${d.message}`, ref: { kind: 'symbol', id: s.id, ...(d.pin ? { pin: d.pin } : {}) } });
    const conns = used.map(u => [u.q.name, u.q.dir === 'out' ? OUTN(s, u.q.name) : INN(s, u.q.name)]);
    body.push(ci ? `${s.name} : entity work.${sub.name}\n  port map (\n${conns.map(([k, a]) => `    ${k} => ${a}`).join(',\n')}\n  );`
      : `${sub.name} ${s.name} (\n${conns.map(([k, a]) => `  .${k}(${a})`).join(',\n')}\n);`);
  };

  // a device primitive (#791): the UNISIM primitive instanced, its attributes in its generic map / parameters
  // (every one, at the symbol's values), an input left unconnected tied (its `tie`), an output unconnected open
  let unisim = false;
  const primInstance = s => {
    const p = s.params, r = primitiveOf(s.type, p), ref = { kind: 'symbol', id: s.id };
    unisim = true;
    if (nk(r.name) === nk(name)) diags.push({ severity: 'error', message: `module name '${name}' is the name of the primitive ${s.name} instances: rename the schematic`, ref: { kind: 'sheet' } });
    if (r.error) diags.push({ severity: 'error', message: `${s.name}: ${r.error}`, ref });
    const gens = [];
    for (const g of r.generics) {
      const v = genericValue(g, p[g.name] ?? g.default, lang);
      if (v != null) { gens.push([g.name, v]); continue; }
      const range = g.options ? g.options.join(', ') : g.kind === 'hex' ? `${g.bits} bits, hexadecimal` : g.kind === 'bool' ? 'TRUE, FALSE' : `${g.min} … ${g.max}`;
      diags.push({ severity: 'error', message: `${s.name}: ${g.name} = '${p[g.name]}' is not a value of ${r.name}'s ${g.name} (${range})`, ref });
    }
    for (const [k, v] of r.fixed || []) gens.push([k, `"${v}"`]);
    if (r.contents && String(p.contents || '').trim()) {
      try {
        for (const [k, h] of Object.entries(initWords(p.contents, r.contents.width, r.contents.inits))) gens.push([k, ci ? `X"${h}"` : `256'h${h}`]);
      } catch (e) { diags.push({ severity: 'error', message: `${s.name}: contents: ${e.message}`, ref }); }
    } else if (String(p.contents || '').trim()) diags.push({ severity: 'warning', message: `${s.name}: contents ignored (port A unused, DATA_WIDTH_A = 0)`, ref });
    const lit = (w, bit) => (ci ? (w > 1 ? `"${bit.repeat(w)}"` : `'${bit}'`) : bit === '1' && w > 1 ? `{${w}{1'b1}}` : `${w}'b${bit}`);
    const conns = r.pins.map(q => {
      if (q.dir === 'out') {
        const n = nl.pinNet.get(`${s.id}/${q.name}`);
        return [q.name, n && !isolated(n) ? OUTN(s, q.name) : null];
      }
      const n = inNet(s, q.name);
      return [q.name, n ? outRead.get(n) || netName(n) : lit(q.width, q.tie)];
    });
    for (const [x, y] of r.exclusive || []) {
      if (conns.find(([k]) => k === x)?.[1] && conns.find(([k]) => k === y)?.[1]) diags.push({ severity: 'error', message: `${s.name}: ${r.name}'s outputs ${x} and ${y} cannot both be used: connect one of them`, ref });
    }
    // (VHDL: a pin of one bit that UNISIM declares a vector, DIP(0 downto 0), associated by its bit 0)
    const formal = (k, a) => (ci && a != null && r.pins.find(q => q.name === k)?.vec && r.pins.find(q => q.name === k).width === 1 ? `${k}(0)` : k);
    if (ci) {
      const lines = [`${s.name} : ${r.name}`];
      if (gens.length) lines.push(`  generic map (\n${gens.map(([k, v]) => `    ${k} => ${v}`).join(',\n')}\n  )`);
      lines.push(`  port map (\n${conns.map(([k, a]) => `    ${formal(k, a)} => ${a ?? 'open'}`).join(',\n')}\n  );`);
      body.push(lines.join('\n'));
    } else {
      const g = gens.length ? ` #(\n${gens.map(([k, v]) => `  .${k}(${v})`).join(',\n')}\n)` : '';
      body.push(`${r.name}${g} ${s.name} (\n${conns.map(([k, a]) => `  .${k}(${a ?? ''})`).join(',\n')}\n);`);
    }
  };

  const syms = doc.symbols;
  for (const s of syms) {
    const def = defs.get(s.id);
    const p = s.params;
    const S = SYMBOLS[s.type];
    if (isBlock(s)) { blockInstance(s, def); continue; }
    const cmt = ci ? `-- ${s.name}: ${def.title || S?.title || s.type}` : `// ${s.name}: ${def.title || S?.title || s.type}`;
    if (S?.prim) { primInstance(s); continue; }
    if (S && S.gate) {
      const o = OUTN(s, 'O');
      if (!o) { diags.push({ severity: 'warning', message: `${s.name}: output not connected, gate skipped`, ref: { kind: 'symbol', id: s.id } }); continue; }
      const ins = def.pins.filter(q => q.dir === 'in').map(q => {
        if (!q.inv) return INN(s, q.name);
        // inverted input (ANDnBk...): an unconnected one is tied to 0, i.e. reads as all ones
        const n = inNet(s, q.name);
        if (!n) { warnOpen(s, q.name); return tie(s, q.name, '1'); }
        return ci ? `(not ${outRead.get(n) || netName(n)})` : `~${outRead.get(n) || netName(n)}`;
      });
      let rhs;
      const g = S.gate;
      if (ci) {
        if (g === 'buf') rhs = ins[0];
        else if (g === 'not') rhs = `not ${ins[0]}`;
        else if (g === 'nand' || g === 'nor' || g === 'xnor') rhs = ins.length === 2 && g === 'xnor' ? `${ins[0]} xnor ${ins[1]}` : `not (${ins.join(` ${g === 'xnor' ? 'xor' : g.slice(1)} `)})`;
        else rhs = ins.join(` ${g} `);
      } else {
        const op = { and: '&', or: '|', xor: '^', nand: '&', nor: '|', xnor: '^' }[g];
        if (g === 'buf') rhs = ins[0];
        else if (g === 'not') rhs = `~${ins[0]}`;
        else if (g === 'nand' || g === 'nor' || g === 'xnor') rhs = `~(${ins.join(` ${op} `)})`;
        else rhs = ins.join(` ${op} `);
      }
      assign(o, rhs);
      continue;
    }
    if (S && S.ff) {
      // library flip-flops (FD*, FT*, FJK*; Width bits, bitwise): async CLR > PRE, then at the clock
      // edge R / S (in the order of the symbol), then CE, then the D / toggle / J-K update
      const f = S.ff;
      const qo = OUTN(s, 'Q');
      if (!qo) { diags.push({ severity: 'warning', message: `${s.name}: output Q not connected, skipped`, ref: { kind: 'symbol', id: s.id } }); continue; }
      const qn = nl.pinNet.get(`${s.id}/Q`);
      const iv = String(p.init ?? S.params[0].default) === '1' ? '1' : '0';
      const W = def.pins.find(x => x.name === 'Q')?.width || 1;
      const c = INN(s, 'C');
      const has = nm => def.pins.some(x => x.name === nm);
      // an unconnected control input is inactive: CLR / PRE / R / S never act, CE always enables
      // (it is left out of the logic, not tied to a constant in a sensitivity list)
      const pin = nm => {
        if (!has(nm)) return null;
        if (!inNet(s, nm)) {
          diags.push({ severity: 'warning', message: `${s.name}: input ${nm} unconnected, ${nm === 'CE' ? 'always enabled' : 'inactive'}`, ref: { kind: 'symbol', id: s.id, pin: nm } });
          return null;
        }
        return INN(s, nm);
      };
      const clr = pin('CLR'), pre = pin('PRE'), r = pin('R'), st = pin('S'), ce = pin('CE');
      // the toggle and J-K updates read the state: VHDL-93 cannot read an output port, so keep it in a local signal
      let q = qo;
      if (ci && f.k !== 'd') { q = fresh(`${s.name}_q`); extra.push({ name: q, type: W > 1 ? `std_logic_vector(${W - 1} downto 0)` : 'std_logic', init: iv.repeat(W) }); }
      const B = v => (W > 1 ? (ci ? `(others => '${v}')` : `{${W}{1'b${v}}}`) : ci ? `'${v}'` : `1'b${v}`);
      const next = f.k === 'd' ? INN(s, 'D')
        : f.k === 't' ? (ci ? `${q} xor ${INN(s, 'T')}` : `${q} ^ ${INN(s, 'T')}`)
          : (ci ? `(${INN(s, 'J')} and (not ${q})) or ((not ${INN(s, 'K')}) and ${q})` : `(${INN(s, 'J')} & ~${q}) | (~${INN(s, 'K')} & ${q})`);
      const asyncL = [[clr, '0'], [pre, '1']].filter(([x]) => x);
      const syncL = (f.sp ? [[st, '1'], [r, '0']] : [[r, '0'], [st, '1']]).filter(([x]) => x);
      const lines = [cmt];
      if (ci) {
        lines.push(`process (${[c, ...asyncL.map(([x]) => x)].join(', ')})`, 'begin');
        let kw = 'if';
        for (const [x, v] of asyncL) { lines.push(`  ${kw} ${x} = '1' then`, `    ${q} <= ${B(v)};`); kw = 'elsif'; }
        lines.push(`  ${kw} rising_edge(${c}) then`);
        const inner = [];
        let k2 = 'if';
        for (const [x, v] of syncL) { inner.push(`${k2} ${x} = '1' then`, `  ${q} <= ${B(v)};`); k2 = 'elsif'; }
        if (ce) inner.push(`${k2} ${ce} = '1' then`, `  ${q} <= ${next};`, 'end if;');
        else if (syncL.length) inner.push('else', `  ${q} <= ${next};`, 'end if;');
        else inner.push(`${q} <= ${next};`);
        lines.push(...inner.map(l => '    ' + l), '  end if;', 'end process;');
        if (q !== qo) lines.push(`${qo} <= ${q};`);
      } else {
        lines.push(`always @(${[`posedge ${c}`, ...asyncL.map(([x]) => `posedge ${x}`)].join(' or ')})`);
        const ch = [...asyncL, ...syncL];
        ch.forEach(([x, v], i) => lines.push(`  ${i ? 'else if' : 'if'} (${x}) ${q} <= ${B(v)};`));
        const upd = `${ce ? `if (${ce}) ` : ''}${q} <= ${next};`;
        lines.push(ch.length ? `  else ${upd}` : `  ${upd}`);
      }
      if (qn) init.set(qn, iv.repeat(qn.width || W));
      body.push(lines.join('\n'));
      continue;
    }
    switch (s.type) {
      case 'mux2': case 'mux4': case 'mux8': case 'mux16': {
        const o = OUTN(s, 'O'); if (!o) continue;
        if (s.type === 'mux2' && !p.en) {
          const d0 = INN(s, 'D0'), d1 = INN(s, 'D1'), sel = INN(s, 'S0');
          if (ci) body.push(`${o} <= ${d1} when ${sel} = '1' else ${d0};`); else assign(o, `${sel} ? ${d1} : ${d0}`);
        } else if (s.type === 'mux4' && !p.en && p.selBus) {
          const d = [0, 1, 2, 3].map(i => INN(s, `D${i}`)), sel = INN(s, 'S', true);
          if (ci) body.push(`with ${sel} select ${o} <=\n  ${d[0]} when "00",\n  ${d[1]} when "01",\n  ${d[2]} when "10",\n  ${d[3]} when others;`);
          else assign(o, `${sel}[1] ? (${sel}[0] ? ${d[3]} : ${d[2]}) : (${sel}[0] ? ${d[1]} : ${d[0]})`);
        } else {
          // the select bits (S1 S0, or the bus S's) and the enable E (#301): O = D<S> when E = 1, else 0
          const n = MUX_INPUTS[s.type], k = Math.log2(n);
          const d = [...Array(n).keys()].map(i => INN(s, `D${i}`));
          const bus = k > 1 && p.selBus ? INN(s, 'S', true) : null;
          const sel = [...Array(k).keys()].map(j => (bus ? (ci ? `${bus}(${j})` : `${bus}[${j}]`) : INN(s, `S${j}`, true)));
          const e = p.en ? INN(s, 'E', true) : null, z = zero(PW(s, 'O'));
          if (ci) {
            const when = i => [...(e ? [`${e} = '1'`] : []), ...sel.map((x, j) => `${x} = '${(i >> j) & 1}'`).reverse()].join(' and ');
            const arms = d.map((x, i) => (i === n - 1 && !e ? x : `${x} when ${when(i)}`));
            body.push(`${o} <= ${arms.join(' else\n  ')}${e ? ` else\n  ${z}` : ''};`);
          } else {
            const tree = (j, base) => (j < 0 ? d[base] : `${sel[j]} ? ${wrap(tree(j - 1, base | (1 << j)), j)} : ${wrap(tree(j - 1, base), j)}`);
            const wrap = (x, j) => (j > 0 ? `(${x})` : x);
            assign(o, e ? `${e} ? (${tree(k - 1, 0)}) : ${z}` : tree(k - 1, 0));
          }
        }
        break;
      }
      case 'demux': {
        const k = Math.max(1, Math.min(4, int(p.sel, 1))), n = 1 << k;
        const dn = inNet(s, 'D');
        if (!dn) warnOpen(s, 'D');
        const d = dn ? (outRead.get(dn) || netName(dn)) : null;
        const net = pin => { const x = inNet(s, pin); if (!x) warnOpen(s, pin); return x ? (outRead.get(x) || netName(x)) : null; };
        // the enable E (#301): an unconnected one is 0, the outputs then 0
        const e = p.en ? net('E') : true;
        const lines = [];
        if (k === 1 || p.selBus) {
          const sp = k === 1 ? 'S0' : 'S', sel = net(sp);
          const on = e === true ? '' : ci ? `${e} = '1' and ` : `${e} && `;
          for (let i = 0; i < n; i++) {
            const o = OUTN(s, `O${i}`); if (!o) continue;
            const w = PW(s, `O${i}`);
            const z = zero(w);
            let rhs;
            if (!d || (!sel && i) || e === null) rhs = z;
            else if (!sel) rhs = e === true ? d : ci ? `${d} when ${e} = '1' else ${z}` : `${e} ? ${d} : ${z}`;
            else if (ci) rhs = `${d} when ${on}${sel} = ${k === 1 ? `'${i}'` : `"${i.toString(2).padStart(k, '0')}"`} else ${z}`;
            else rhs = `(${on}${sel} == ${k}'d${i}) ? ${d} : ${z}`;
            lines.push(ci ? `${o} <= ${rhs};` : `assign ${o} = ${rhs};`);
          }
        } else {
          // the select bits S<k-1> … S0 on pins of their own (#301); an unconnected one is 0
          const sel = [...Array(k).keys()].map(j => net(`S${j}`));
          for (let i = 0; i < n; i++) {
            const o = OUTN(s, `O${i}`); if (!o) continue;
            const z = zero(PW(s, `O${i}`));
            const terms = e === true ? [] : [ci ? `${e} = '1'` : e];
            let never = !d || e === null;
            for (let j = k - 1; j >= 0; j--) {
              const bit = (i >> j) & 1;
              if (sel[j] === null) { if (bit) never = true; continue; }
              terms.push(ci ? `${sel[j]} = '${bit}'` : bit ? sel[j] : `!${sel[j]}`);
            }
            const rhs = never ? z : !terms.length ? d : ci ? `${d} when ${terms.join(' and ')} else ${z}` : `(${terms.join(' && ')}) ? ${d} : ${z}`;
            lines.push(ci ? `${o} <= ${rhs};` : `assign ${o} = ${rhs};`);
          }
        }
        if (lines.length) body.push([cmt, ...lines].join('\n'));
        break;
      }
      case 'tbuf': {
        // tri-state buffer: O = I while enabled, else Z; several of them may drive the same (resolved) net
        const en = p.enable === 'T' ? 'T' : 'E';
        const pairs = def.pins.filter(q => q.dir === 'out').map(q => [q.name.replace(/^O/, 'I'), q.name]);
        const live = pairs.map(([i, o]) => [i, o, OUTN(s, o)]).filter(x => x[2]);
        if (!live.length) { diags.push({ severity: 'warning', message: `${s.name}: output not connected, tri-state buffer skipped`, ref: { kind: 'symbol', id: s.id } }); continue; }
        // (an unconnected enable is tied to 0 through a signal: '0' = '1' would be ambiguous in VHDL)
        const e = INN(s, en, true);
        const lines = [cmt];
        for (const [i, op, o] of live) {
          const w = PW(s, op), x = INN(s, i);
          if (ci) lines.push(`${o} <= ${x} when ${e} = '${en === 'T' ? 0 : 1}' else ${w > 1 ? "(others => 'Z')" : "'Z'"};`);
          else { const z = w > 1 ? `{${w}{1'bz}}` : "1'bz"; lines.push(`assign ${o} = ${en === 'T' ? `${e} ? ${z} : ${x}` : `${e} ? ${x} : ${z}`};`); }
        }
        body.push(lines.join('\n'));
        break;
      }
      case 'decoder': case 'encoder': {
        // bit j of an input pin group: bus pin (bus mode) or one pin per bit; null when unconnected (tied to 0)
        const bitIn = (bus, base, j) => {
          const pin = bus ? base : `${base}${j}`;
          const n = inNet(s, pin);
          if (!n) { if (!bus || j === 0) warnOpen(s, pin); return null; }
          const nm = outRead.get(n) || netName(n);
          return bus ? (ci ? `${nm}(${j})` : `${nm}[${j}]`) : nm;
        };
        const AND = ci ? ' and ' : ' & ', OR = ci ? ' or ' : ' | ';
        const NOT = x => (ci ? `(not ${x})` : `~${x}`);
        const B0 = ci ? "'0'" : "1'b0";
        const lines = [cmt];
        if (s.type === 'decoder') {
          const n = Math.max(1, Math.min(5, int(p.n, 2)));
          const a = [...Array(n).keys()].map(j => bitIn(!!p.bus, 'A', j));
          const e = p.en ? bitIn(false, 'E', '') : true;
          const outBus = p.bus ? OUTN(s, 'D') : null;
          if (p.bus && !outBus) continue;
          for (let i = 0; i < 1 << n; i++) {
            const o = p.bus ? (ci ? `${outBus}(${i})` : `${outBus}[${i}]`) : OUTN(s, `D${i}`);
            if (!o) continue;
            const terms = [];
            let zeroT = e === null;
            if (e !== true && e !== null) terms.push(e);
            for (let j = n - 1; j >= 0; j--) {
              const bit = (i >> j) & 1;
              if (a[j] === null) { if (bit) zeroT = true; continue; }
              terms.push(bit ? a[j] : NOT(a[j]));
            }
            const rhs = zeroT ? B0 : terms.length ? terms.join(AND) : (ci ? "'1'" : "1'b1");
            lines.push(ci ? `${o} <= ${rhs};` : `assign ${o} = ${rhs};`);
          }
        } else {
          const n = Math.max(2, Math.min(5, int(p.n, 2))), m = 1 << n;
          const I = [...Array(m).keys()].map(i => bitIn(!!p.bus, 'I', i));
          const oA = p.bus ? OUTN(s, 'A') : null;
          const oBits = p.bus ? [] : [...Array(n).keys()].map(j => OUTN(s, `A${j}`));
          const oV = OUTN(s, 'V');
          const live = I.map((x, i) => [x, i]).filter(([x]) => x !== null);
          if (oA || oBits.some(Boolean)) {
            const t = fresh(`${s.name}_a`);
            if (ci) extra.push({ name: t, type: `std_logic_vector(${n - 1} downto 0)` }); else extra.push({ name: t, width: n });
            const lit = i => (ci ? `"${i.toString(2).padStart(n, '0')}"` : `${n}'d${i}`);
            if (p.mode === 'one-hot') {
              for (let j = 0; j < n; j++) {
                const ors = live.filter(([, i]) => (i >> j) & 1).map(([x]) => x);
                const rhs = ors.length ? ors.join(OR) : B0;
                lines.push(ci ? `${t}(${j}) <= ${rhs};` : `assign ${t}[${j}] = ${rhs};`);
              }
            } else {
              const chain = live.slice().reverse().filter(([, i]) => i > 0);
              if (ci) lines.push(`${t} <= ${chain.map(([x, i]) => `${lit(i)} when ${x} = '1' else `).join('')}${lit(0)};`);
              else lines.push(`assign ${t} = ${chain.map(([x, i]) => `${x} ? ${lit(i)} : `).join('')}${lit(0)};`);
            }
            if (oA) {
              const cls = ci ? clsOf(oA) : 'v';
              lines.push(ci ? `${oA} <= ${cls === 'u' ? `unsigned(${t})` : cls === 's' ? `signed(${t})` : t};` : `assign ${oA} = ${t};`);
            }
            oBits.forEach((o, j) => { if (o) lines.push(ci ? `${o} <= ${t}(${j});` : `assign ${o} = ${t}[${j}];`); });
          }
          if (oV) {
            const rhs = live.length ? live.map(([x]) => x).join(OR) : B0;
            lines.push(ci ? `${oV} <= ${rhs};` : `assign ${oV} = ${rhs};`);
          }
        }
        if (lines.length > 1) body.push(lines.join('\n'));
        break;
      }
      case 'add': case 'sub': {
        const io = arithIo(s.type, p);
        if (p.bits && Math.max(1, int(p.width, 1)) > 1) {
          // a pin per bit (#304, #322): the operands A<w-1> … A0, B<w-1> … B0, the result's bits S0 … / D0 …
          // through one sum / difference (its bit w the carry / the borrow)
          const w = Math.max(1, int(p.width, 1));
          const ops = g => [...Array(w).keys()].reverse().map(i => INN(s, `${g}${i}`, true));
          const outs = [...Array(w).keys()].map(i => OUTN(s, `${io.o}${i}`)), co = io.cout ? OUTN(s, io.co) : null;
          if (!outs.some(Boolean) && !co) continue;
          const cin = io.cin ? INN(s, io.ci, true) : null, t = fresh(`${s.name}_${s.type === 'sub' ? 'diff' : 'sum'}`);
          if (ci) {
            extra.push({ name: t, type: `unsigned(${w} downto 0)` });
            const base = `resize(unsigned'(${ops('A').join(' & ')}), ${w + 1}) ${io.op} resize(unsigned'(${ops('B').join(' & ')}), ${w + 1})`;
            body.push(cin ? `${t} <= ${base} ${io.op} 1 when ${cin} = '1' else ${base};` : `${t} <= ${base};`);
            outs.forEach((o, i) => o && body.push(`${o} <= ${t}(${i});`));
            if (co) body.push(`${co} <= ${t}(${w});`);
          } else {
            extra.push({ name: t, width: w + 1 });
            assign(t, `{${ops('A').join(', ')}} ${io.op} {${ops('B').join(', ')}}${cin ? ` ${io.op} ${cin}` : ''}`);
            outs.forEach((o, i) => o && assign(o, `${t}[${i}]`));
            if (co) assign(co, `${t}[${w}]`);
          }
          break;
        }
        const o = OUTN(s, io.o), co = io.cout ? OUTN(s, io.co) : null;
        if (!o && !co) continue;
        const a = INN(s, 'A'), b = INN(s, 'B');
        const w = Math.max(1, int(p.width, 1));
        const cin = io.cin ? INN(s, io.ci) : null;
        const op = io.op;
        if (ci) {
          // a 1-bit operand is a std_logic: unsigned'(0 => x) makes it a 1-bit vector
          const U = x => (w === 1 ? `unsigned'(0 => ${x})` : `unsigned(${x})`);
          if (!co && !cin) {
            if (o) body.push(w === 1 ? `${o} <= ${a} xor ${b};` : `${o} <= ${wrapV(`unsigned(${a}) ${op} unsigned(${b})`, clsOf(o))};`);
          } else {
            const t = fresh(`${s.name}_sum`);
            extra.push({ name: t, type: `unsigned(${w} downto 0)` });
            const base = `resize(${U(a)}, ${w + 1}) ${op} resize(${U(b)}, ${w + 1})`;
            body.push(cin ? `${t} <= ${base} ${op} 1 when ${cin} = '1' else ${base};` : `${t} <= ${base};`);
            if (o) body.push(w === 1 ? `${o} <= ${t}(0);` : `${o} <= ${wrapV(`${t}(${w - 1} downto 0)`, clsOf(o))};`);
            if (co) body.push(`${co} <= ${t}(${w});`);
          }
        } else {
          const rhs = `${a} ${op} ${b}${cin ? ` ${op} ${cin}` : ''}`;
          if (co && o) assign(`{${co}, ${o}}`, rhs);
          else if (co) { const t = fresh(`${s.name}_sum`); extra.push({ name: t, width: w + 1 }); assign(`${t}`, rhs); assign(co, `${t}[${w}]`); }
          else assign(o, rhs);
        }
        break;
      }
      case 'compare': {
        const o = OUTN(s, 'O'); if (!o) continue;
        // (a pin per bit, #319: the operands made of their bits, the most significant first)
        const per = p.bits && Math.max(1, int(p.width, 1)) > 1, bw = Math.max(1, int(p.width, 1));
        const opnd = g => [...Array(bw).keys()].reverse().map(i => INN(s, `${g}${i}`, true));
        const a = per ? (ci ? `std_logic_vector'(${opnd('A').join(' & ')})` : `{${opnd('A').join(', ')}}`) : INN(s, 'A');
        const b = per ? (ci ? `std_logic_vector'(${opnd('B').join(' & ')})` : `{${opnd('B').join(', ')}}`) : INN(s, 'B');
        const op = p.op || 'eq';
        if (ci) {
          const vo = { eq: '=', ne: '/=', lt: '<', le: '<=', gt: '>', ge: '>=' }[op];
          const cw = Math.max(1, int(p.width, 1));
          const cast = x => (cw === 1 ? `${p.signed ? 'signed' : 'unsigned'}'(0 => ${x})` : p.signed ? `signed(${x})` : `unsigned(${x})`);
          body.push(`${o} <= '1' when ${cast(a)} ${vo} ${cast(b)} else '0';`);
        } else {
          const vo = { eq: '==', ne: '!=', lt: '<', le: '<=', gt: '>', ge: '>=' }[op];
          assign(o, p.signed ? `($signed(${a}) ${vo} $signed(${b}))` : `(${a} ${vo} ${b})`);
        }
        break;
      }
      case 'constant': case 'vcc': case 'gnd': {
        const pin = s.type === 'constant' ? 'O' : s.type === 'vcc' ? 'P' : 'G';
        const o = OUTN(s, pin); if (!o) continue;
        const n = nl.pinNet.get(`${s.id}/${pin}`);
        const w = n.width;
        let bits;
        if (s.type === 'constant') {
          bits = constBits(p.value, w);
          if (bits == null) { diags.push({ severity: 'error', message: `${s.name}: invalid constant value '${p.value}'`, ref: { kind: 'symbol', id: s.id } }); bits = '0'.repeat(w); }
        } else bits = (s.type === 'vcc' ? '1' : '0').repeat(w);
        init.set(n, bits);
        const ty = ci ? netType(n) : '';
        if (ci) body.push(`${o} <= ${w === 1 && vhdlClass(ty) === 'sl' ? vhdlBits(bits, true) : vhdlBits(bits, false)};`);
        else assign(o, vlogBits(bits));
        break;
      }
      case 'slice': {
        const o = OUTN(s, 'O'); if (!o) continue;
        const i = INN(s, 'I', true);
        const msb = int(p.msb, 0), lsb = int(p.lsb, 0);
        const ow = Math.abs(msb - lsb) + 1;
        const outIsVec = ci ? clsOf(o) !== 'sl' : true;
        // (a tap of bit 0 of a net of one bit, a scalar: the net itself, no index, #859)
        const n1 = inNet(s, 'I');
        if (msb === 0 && lsb === 0 && n1?.width === 1 && (!ci || clsOf(i) === 'sl')) {
          if (ci) body.push(`${outIsVec ? `${o}(0)` : o} <= ${i};`); else assign(o, i);
          break;
        }
        if (ci) body.push(`${o} <= ${ow === 1 && !outIsVec ? `${i}(${msb})` : `${i}(${msb} ${msb >= lsb ? 'downto' : 'to'} ${lsb})`};`);
        else assign(o, ow === 1 ? `${i}[${msb}]` : `${i}[${msb}:${lsb}]`);
        break;
      }
      case 'busjoin': {
        const o = OUTN(s, 'O'); if (!o) continue;
        const ins = def.pins.filter(q => q.dir === 'in').map(q => INN(s, q.name));
        if (ci) body.push(`${o} <= ${ins.join(' & ')};`); else assign(o, `{${ins.join(', ')}}`);
        break;
      }
      case 'register': case 'counter': {
        // (a counter with a pin per bit, #319: its count in a signal of its own, Q0 .. its bits)
        const perQ = s.type === 'counter' && p.bits && Math.max(1, int(p.width, 1)) > 1;
        const qBits = perQ ? [...Array(Math.max(1, int(p.width, 1))).keys()].map(i => OUTN(s, `Q${i}`)) : null;
        const q = perQ ? (qBits.some(Boolean) ? fresh(`${s.name}_q`) : null) : OUTN(s, 'Q');
        if (!q) { diags.push({ severity: 'warning', message: `${s.name}: output Q not connected, skipped`, ref: { kind: 'symbol', id: s.id } }); continue; }
        const has = nm => def.pins.some(x => x.name === nm);
        const c = INN(s, 'C');
        const d = has('D') ? INN(s, 'D') : null;
        // unconnected controls: CLR / R inactive, CE always enabled (left out of the logic)
        const ctl = nm => {
          if (!has(nm)) return null;
          if (!inNet(s, nm)) { diags.push({ severity: 'warning', message: `${s.name}: input ${nm} unconnected, ${nm === 'CE' ? 'always enabled' : 'inactive'}`, ref: { kind: 'symbol', id: s.id, pin: nm } }); return null; }
          return INN(s, nm);
        };
        const ce = ctl('CE'), clr = ctl('CLR'), r = ctl('R');
        const qn = perQ ? null : nl.pinNet.get(`${s.id}/Q`);
        const w = perQ ? Math.max(1, int(p.width, 1)) : qn.width;
        if (perQ) {
          if (ci) extra.push({ name: q, type: `std_logic_vector(${w - 1} downto 0)` });
          else extra.push({ name: q, width: w, reg: true });
          qBits.forEach((o, i) => o && (ci ? body.push(`${o} <= ${q}(${i});`) : assign(o, `${q}[${i}]`)));
        }
        const rv = s.type === 'counter' ? '0'.repeat(w) : (constBits(p.init ?? '0', w) || '0'.repeat(w));
        if (ci) {
          const rval = w > 1 ? (/^0+$/.test(rv) ? '(others => \'0\')' : `"${rv}"`) : `'${rv}'`;
          let tgt = q, nextv = d, lines = [];
          if (s.type === 'counter') {
            tgt = fresh(`${s.name}_cnt`);
            extra.push({ name: tgt, type: `unsigned(${w - 1} downto 0)`, init: rv });
            nextv = `${tgt} ${p.dir === 'down' ? '-' : '+'} 1`;
          }
          const upd = ce ? [`if ${ce} = '1' then`, `  ${tgt} <= ${nextv};`, 'end if;'] : [`${tgt} <= ${nextv};`];
          const rvT = s.type === 'counter' ? '(others => \'0\')' : rval;
          lines.push(cmt);
          if (clr) {
            lines.push(`process (${c}, ${clr})`, 'begin', `  if ${clr} = '1' then`, `    ${tgt} <= ${rvT};`, `  elsif rising_edge(${c}) then`, ...upd.map(l => '    ' + l), '  end if;', 'end process;');
          } else if (r) {
            lines.push(`process (${c})`, 'begin', `  if rising_edge(${c}) then`, `    if ${r} = '1' then`, `      ${tgt} <= ${rvT};`, ...(ce ? [`    elsif ${ce} = '1' then`, `      ${tgt} <= ${nextv};`] : ['    else', `      ${tgt} <= ${nextv};`]), '    end if;', '  end if;', 'end process;');
          } else {
            lines.push(`process (${c})`, 'begin', `  if rising_edge(${c}) then`, ...upd.map(l => '    ' + l), '  end if;', 'end process;');
          }
          if (s.type === 'counter') lines.push(`${q} <= ${perQ ? `std_logic_vector(${tgt})` : wrapV(tgt, clsOf(q))};`);
          body.push(lines.join('\n'));
        } else {
          const nextv = s.type === 'counter' ? `${q} ${p.dir === 'down' ? '-' : '+'} 1'b1` : d;
          const rz = vlogBits(rv);
          const lines = [cmt];
          if (clr) lines.push(`always @(posedge ${c} or posedge ${clr})`, `  if (${clr}) ${q} <= ${rz};`, `  else${ce ? ` if (${ce})` : ''} ${q} <= ${nextv};`);
          else if (r) lines.push(`always @(posedge ${c})`, `  if (${r}) ${q} <= ${rz};`, `  else${ce ? ` if (${ce})` : ''} ${q} <= ${nextv};`);
          else lines.push(`always @(posedge ${c})`, `  ${ce ? `if (${ce}) ` : ''}${q} <= ${nextv};`);
          if (s.type === 'counter' && qn) init.set(qn, rv);
          body.push(lines.join('\n'));
        }
        break;
      }
      case 'module': {
        const m = findMod(modules, p.module);
        const mname = m?.name || p.module;
        if (!mname) { diags.push({ severity: 'error', message: `${s.name}: no module selected`, ref: { kind: 'symbol', id: s.id } }); continue; }
        const gens = Object.entries(p.generics || {}).filter(([, v]) => String(v ?? '').trim() !== '');
        const conns = def.pins.map(q => {
          const n = nl.pinNet.get(`${s.id}/${q.name}`);
          let a = n ? (outRead.get(n) && q.dir !== 'out' ? outRead.get(n) : (q.dir === 'out' && outRead.get(n)) || netName(n)) : null;
          if (!a && q.dir !== 'out') diags.push({ severity: 'warning', message: `${s.name}: input ${q.name} of '${mname}' is unconnected`, ref: { kind: 'symbol', id: s.id, pin: q.name } });
          return [q.name, a];
        });
        if (ci) {
          const lines = [`${s.name} : entity work.${mname}`];
          if (gens.length) lines.push(`  generic map (\n${gens.map(([k, v]) => `    ${k} => ${v}`).join(',\n')}\n  )`);
          const cs = conns.filter(([, a]) => a || true).map(([k, a]) => `    ${k} => ${a ?? 'open'}`);
          lines.push(`  port map (\n${cs.join(',\n')}\n  );`);
          body.push(lines.join('\n'));
        } else {
          const g = gens.length ? ` #(${gens.map(([k, v]) => `.${k}(${v})`).join(', ')})` : '';
          body.push(`${mname}${g} ${s.name} (\n${conns.map(([k, a]) => `  .${k}(${a ?? ''})`).join(',\n')}\n);`);
        }
        break;
      }
      case 'hdlblock': {
        const code = String(s.hdl || '').replace(/\s+$/, '');
        // alias pins whose net name differs from the pin name
        const pre = [], post = [];
        for (const q of def.pins) {
          const n = nl.pinNet.get(`${s.id}/${q.name}`);
          if (!n) continue;
          // an unconnected input is tied: CE (clock enable) to 1 = always enabled, others to 0
          const open = q.dir === 'in' && !inNet(s, q.name);
          if (open) {
            const one = /^CE$/i.test(q.name), w = q.width || 1;
            diags.push({ severity: 'warning', message: `${s.name}: input ${q.name} unconnected, ${one ? 'tied to 1 (always enabled)' : 'tied to 0'}`, ref: { kind: 'symbol', id: s.id, pin: q.name } });
            const k = ci ? (w > 1 ? `(others => '${one ? 1 : 0}')` : `'${one ? 1 : 0}'`) : `{${w}{1'b${one ? 1 : 0}}}`;
            if (!declared.has(nk(q.name))) { used.add(nk(q.name)); extra.push({ name: q.name, width: w, type: ci ? vtype(w) : null }); }
            pre.push(ci ? `${q.name} <= ${k};` : `assign ${q.name} = ${k};`);
            continue;
          }
          const nn = q.dir !== 'out' && outRead.has(n) ? outRead.get(n) : netName(n);
          if (nk(nn) === nk(q.name)) continue;
          if (!used.has(nk(q.name)) || declared.has(nk(q.name))) {
            if (!declared.has(nk(q.name))) { used.add(nk(q.name)); extra.push({ name: q.name, width: q.width, type: ci ? vtype(q.width) : null, reg: q.reg }); }
          } else diags.push({ severity: 'warning', message: `${s.name}: pin ${q.name} is wired to net '${nn}' but '${q.name}' is also another net`, ref: { kind: 'symbol', id: s.id, pin: q.name } });
          if (q.dir === 'out') post.push(ci ? `${nn} <= ${q.name};` : `assign ${nn} = ${q.name};`);
          else pre.push(ci ? `${q.name} <= ${nn};` : `assign ${q.name} = ${nn};`);
        }
        if (!code.trim()) { diags.push({ severity: 'warning', message: `${s.name}: HDL block is empty`, ref: { kind: 'symbol', id: s.id } }); }
        const title = p.title ? ` (${p.title})` : '';
        body.push([ci ? `-- ${s.name}: HDL block${title}` : `// ${s.name}: HDL block${title}`, ...pre, blockLang === lang ? code : (ci ? '-- (HDL block code omitted: wrong language)' : '// (HDL block code omitted: wrong language)'), ...post].filter(x => x !== '').join('\n'));
        break;
      }
      default:
        diags.push({ severity: 'warning', message: `${s.name}: unknown symbol type '${s.type}' skipped`, ref: { kind: 'symbol', id: s.id } });
    }
  }
  // nets with several I/O markers: the first one names the net, the others are assigned
  for (const p of ports) {
    if (!p.net) continue;
    const owner = portOf.get(p.net);
    if (owner && owner.id !== p.id) {
      if (p.dir === 'out') assign(p.name, outRead.get(p.net) || owner.name);
      else diags.push({ severity: 'error', message: `I/O markers '${owner.name}' and '${p.name}' are on the same net`, ref: { kind: 'port', id: p.id } });
    }
  }
  // ---------------- assemble
  const header = `Generated by Silinx from ${doc.name}.sch.json — kept in sync with the schematic (edit either one)`;
  // the sheet description (doc.description, e.g. from the Schematic Wizard) as comment lines
  const descC = c => String(doc.description || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => `${c} ${l}`);
  const sigDecls = [];
  for (const net of nl.nets) {
    if (portOf.has(net)) continue;
    const nm = net.name;
    if (declared.has(nk(nm))) continue;
    if (!net.endpoints.length) continue;
    if (isolated(net) && net.auto && net.endpoints[0].kind === 'pin' && net.endpoints[0].dir !== 'out'
      && !['module', 'hdlblock'].includes(doc.symbols.find(x => x.id === net.endpoints[0].sym)?.type)) continue;
    // (a device primitive's output left unconnected: open)
    if (isolated(net) && net.auto && net.endpoints[0].kind === 'pin' && SYMBOLS[doc.symbols.find(x => x.id === net.endpoints[0].sym)?.type]?.prim) continue;
    const iv = init.get(net);
    if (ci) sigDecls.push(`  signal ${nm} : ${netType(net)}${iv ? ` := ${vhdlClass(netType(net)) === 'sl' ? vhdlBits(iv, true) : vhdlBits(iv, false)}` : ''};`);
    else {
      const reg = regNets.has(net);
      sigDecls.push(`  ${reg ? 'reg ' : 'wire'}${net.width > 1 ? ` [${net.width - 1}:0]` : ''} ${nm}${reg && iv ? ` = ${vlogBits(iv)}` : ''};`);
    }
  }
  for (const x of extra) {
    if (ci) sigDecls.push(`  signal ${x.name} : ${x.type || vtype(x.width || 1)}${x.init ? ` := ${(x.type || '').startsWith('std_logic') && !(x.type || '').includes('vector') ? vhdlBits(x.init, true) : vhdlBits(x.init, false)}` : ''};`);
    else sigDecls.push(`  ${x.reg ? 'reg ' : 'wire'}${(x.width || 1) > 1 ? ` [${x.width - 1}:0]` : ''} ${x.name};`);
  }
  const vdecls = verbatimOK && (hdl.decls || '').trim() ? indent(dedentBlock(hdl.decls), '  ') : '';
  // one-line statements one after the other; a blank line around a statement of several lines (an
  // instance with its port map, a process), #224
  const blocks = body.map(b => indent(b, '  '));
  const stmts = blocks.map((b, k) => (k === 0 ? '' : b.includes('\n') || blocks[k - 1].includes('\n') ? '\n\n' : '\n') + b).join('');
  let code;
  const generics = verbatimOK ? (hdl.generics || []) : [];
  if (ci) {
    let ctx = verbatimOK && hdl.context ? String(hdl.context).trim() : 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;';
    // (the device primitives' components, #791)
    if (unisim && !/\blibrary\s+unisim\b/i.test(ctx)) ctx += '\nlibrary UNISIM;\nuse UNISIM.VCOMPONENTS.ALL;';
    const arch = (verbatimOK && hdl.arch) || 'schematic';
    // an output driven directly by a flip-flop / register starts at its INIT value (port default)
    const plist = ports.map(p => {
      const ty = p.type && verbatimOK ? p.type : vtype(p.width);
      const iv = p.dir === 'out' && p.net && regNets.has(p.net) && !outRead.has(p.net) ? init.get(p.net) : null;
      const mode = p.dir === 'out' && p.mode === 'buffer' ? 'buffer' : p.dir;
      const dv = p.default && verbatimOK && p.type ? ` := ${p.default}` : iv ? ` := ${vhdlClass(ty) === 'sl' ? vhdlBits(iv, true) : vhdlBits(iv, false)}` : '';
      return `${p.name} : ${mode} ${ty}${dv}`;
    });
    const L = [`-- ${header}`, ...descC('--'), ctx, '', `entity ${name} is`];
    if (generics.length) L.push(`  generic (\n${generics.map(g => `    ${g.name} : ${g.type || 'integer'}${g.default ? ` := ${g.default}` : ''}`).join(';\n')}\n  );`);
    if (plist.length) L.push(`  port (\n${plist.map(x => `    ${x}`).join(';\n')}\n  );`);
    L.push(`end entity ${name};`, '', `architecture ${arch} of ${name} is`);
    if (vdecls) L.push(vdecls);
    L.push(...sigDecls, 'begin', stmts, `end architecture ${arch};`, '');
    code = L.join('\n');
  } else {
    const ctx = verbatimOK && hdl.context ? String(hdl.context).trim() : '`timescale 1ns / 1ps';
    const plist = ports.map(p => {
      const reg = p.dir === 'out' && p.net && regNets.has(p.net);
      const sg = /\bsigned\b/.test(p.type || '') ? ' signed' : '';
      const rng = verbatimOK && p.type && /\[.*\]/.test(p.type) ? ` ${/\[.*\]/.exec(p.type)[0]}` : (p.width > 1 ? ` [${p.width - 1}:0]` : '');
      return `${p.dir === 'in' ? 'input' : p.dir === 'out' ? 'output' : 'inout'} ${reg ? 'reg' : 'wire'}${sg}${rng} ${p.name}`;
    });
    const L = [`// ${header}`, ...descC('//'), ctx, ''];
    const gtxt = generics.length ? ` #(\n${generics.map(g => `  parameter ${g.type ? g.type + ' ' : ''}${g.name} = ${g.default || 0}`).join(',\n')}\n)` : '';
    L.push(`module ${name}${gtxt} (\n${plist.map(x => `  ${x}`).join(',\n')}\n);`);
    if (vdecls) L.push(vdecls);
    L.push(...sigDecls);
    // initial values of output-port registers
    for (const p of ports) if (p.net && regNets.has(p.net) && init.get(p.net)) L.push(`  initial ${p.name} = ${vlogBits(init.get(p.net))};`);
    L.push('', stmts, '', 'endmodule', '');
    code = L.join('\n');
  }
  // the blocks' own entities first (VHDL: analysed before their use)
  if (subs.size) code = `${[...subs.values()].map(x => x.code.trim()).join('\n\n')}\n\n${code}`;
  code = code.replace(/\n{3,}/g, '\n\n');
  return { filename: `${name}.${ci ? 'vhd' : 'v'}`, code, diagnostics: diags };
}

// ===================================================================== HDL -> schematic
// Module port lists for module symbols, from a compiled library ({ name: { name, lang, ports:[{name,dir,width,type}], generics } }).
// asWritten: the VHDL entities, their ports and generics named as their sources write them (the
// read-only RTL / Technology Schematics, #131), not lower case as the elaborator names them.
export function modulesFromLibrary(lib, { sources, asWritten = false } = {}) {
  const out = {};
  const toksOf = new Map();       // text -> its VHDL tokens (a file of many entities: UNISIM)
  for (const m of lib.modules.values()) {
    let ports = [];
    try {
      const d = elaborate(lib, m.name);
      if (d.top) ports = d.top.ports.map(p => ({ name: p.name, dir: p.dir, width: p.t.w }));
    } catch { /* ignore */ }
    if (!ports.length) ports = (m.ports || []).map(p => ({ name: p.name, dir: p.dir, width: 1 }));
    let name = m.name;
    const generics = (m.params || []).filter(p => !p.local).map(p => ({ name: p.name, default: p.default ? (m.lang === 'vhdl' ? unparen(prVhdl(p.default)) : unparen(prVlog(p.default))) : '' }));
    if (m.lang === 'vhdl' && sources) {
      const text = sources[m.file];
      if (text) {
        if (!toksOf.has(text)) toksOf.set(text, tokenize(text, 'vhdl'));
        const itf = vhdlInterface(text, m, toksOf.get(text));
        for (const p of ports) { const x = itf.ports.get(p.name.toLowerCase()); if (x) { p.type = x.type; if (asWritten) p.name = x.name; } }
        if (asWritten) {
          name = itf.name || name;
          for (const g of generics) g.name = itf.generics.find(x => x.name.toLowerCase() === g.name.toLowerCase())?.name || g.name;
        }
      }
    }
    // a schematic's block (its own entity, marked silinx-symbol, #175): not offered as a project module
    const block = sources?.[m.file] ? blockMarkOf(sources[m.file], name) : null;
    out[name] = { name, lang: m.lang, file: m.file, ports, generics, ...(block ? { block: block.type } : {}) };
  }
  return out;
}

// the token 'entity' of "entity <name> is" in VHDL tokens (from token `from`), or -1
function entityTok(toks, name, from = 0) {
  const n = String(name).toLowerCase();
  for (let i = from; i < toks.length; i++) if (toks[i].v === 'entity' && toks[i + 1]?.v === n && toks[i + 2]?.v === 'is') return i;
  return -1;
}
// VHDL identifiers as written: lower-case name -> the spelling of its first occurrence in toks[from..to)
function idSpelling(toks, from, to, map = new Map()) {
  for (let k = Math.max(0, from); k < (to < 0 ? toks.length : to); k++) if (toks[k].k === 'id' && toks[k].raw && !map.has(toks[k].v)) map.set(toks[k].v, toks[k].raw);
  return map;
}

// VHDL entity interface lists: { name (as written), generics: [{name,type,default}], ports: Map(name -> {name (as written), type, mode, default}) }
function vhdlInterface(text, mod, toks = tokenize(text, 'vhdl')) {
  const ls = lineStarts(text);
  // find "entity <name> is"
  const i = entityTok(toks, mod.name, tokAt(toks, offsetOf(ls, mod.loc)));
  const res = { name: null, generics: [], ports: new Map(), genericMap: new Map() };
  if (i < 0) return res;
  res.name = toks[i + 1].raw || toks[i + 1].v;
  const end = (() => { for (let j = i + 2; j < toks.length; j++) if (toks[j].v === 'end' || toks[j].v === 'begin') return j; return toks.length; })();
  const list = kw => {
    for (let j = i; j < end; j++) if (toks[j].v === kw && toks[j + 1]?.v === '(') {
      const close = skipParen(toks, j + 1) - 1;
      const elems = [];
      let d = 0, st = j + 2;
      for (let k = j + 2; k <= close; k++) {
        const v = toks[k].v;
        if (v === '(') d++; else if (v === ')') { if (k === close) { elems.push([st, k]); break; } d--; } else if (v === ';' && d === 0) { elems.push([st, k]); st = k + 1; }
      }
      return elems;
    }
    return [];
  };
  const parseElem = ([a, b]) => {
    let k = a;
    const names = [];
    while (k < b && toks[k].v !== ':') { if (toks[k].k === 'id') names.push(toks[k].raw || toks[k].v); k++; }
    k++;
    let mode = null;
    if (['in', 'out', 'inout', 'buffer', 'linkage'].includes(toks[k]?.v)) mode = toks[k++].v;
    if (toks[k]?.v === 'signal' || toks[k]?.v === 'constant') k++;
    let tEnd = b;
    for (let q = k; q < b; q++) if (toks[q].v === ':=') { tEnd = q; break; }
    const type = k < tEnd ? squash(stripComments(text.slice(toks[k].s, toks[tEnd - 1].e), 'vhdl')) : '';
    const def = tEnd < b ? squash(stripComments(text.slice(toks[tEnd + 1].s, toks[b - 1].e), 'vhdl')) : '';
    return { names, mode, type, default: def };
  };
  for (const el of list('generic')) { const e = parseElem(el); for (const n of e.names) { res.generics.push({ name: n, type: e.type, default: e.default }); } }
  for (const el of list('port')) { const e = parseElem(el); for (const n of e.names) res.ports.set(n.toLowerCase(), { name: n, type: e.type, mode: e.mode, default: e.default }); }
  return res;
}

// collect items (and their loc objects) nested under each top-level item
function nestedOf(item) {
  const set = new Set([item, item.loc]);
  const walk = arr => { for (const x of arr || []) { set.add(x); if (x.loc) set.add(x.loc); walk(x.items); walk(x.then); walk(x.else); } };
  walk(item.items); walk(item.then); walk(item.else);
  return set;
}

// readable constant text for a bit string
function bitsValue(bits) {
  if (/[xz]/.test(bits)) return `0b${bits}`;
  if (bits.length === 1) return bits;
  if (bits.length % 4 === 0) return `0x${BigInt('0b' + bits).toString(16).toUpperCase().padStart(bits.length / 4, '0')}`;
  return `0b${bits}`;
}

// Build a schematic document from an elaborated instance.
//   opts: { lang, sourceText (text of the instance's file) | sources: { path: text },
//           layout: async (elkGraph) => elkResult (optional; e.g. g => new ELK().layout(g)),
//           modules (optional, as for generateHdl), name }
export async function schematicFromHdl(inst, opts = {}) {
  const mod = inst.mod;
  const lang = mod?.lang || inst.lang || opts.lang || 'vhdl';
  const ci = lang === 'vhdl';
  const nk = s => (ci ? String(s).toLowerCase() : String(s));
  const srcOf = path => (opts.sources && opts.sources[path] != null ? opts.sources[path] : (typeof opts.sourceText === 'string' ? opts.sourceText : (opts.sourceText && opts.sourceText[path]) || null));
  const archFile = mod?.archFile || mod?.file || inst.file;
  const archText = srcOf(archFile) ?? srcOf(inst.file);
  const entText = srcOf(mod?.file) ?? archText;
  const diags = [];
  const doc = newDoc(opts.name || inst.module, lang);
  doc.hdl = { lang, context: '', generics: [], decls: '', arch: '' };
  if (!mod) throw new Error('schematicFromHdl: instance has no module (pass elaborate(lib, top).top)');

  // ---- signals (module level only)
  const sigByName = new Map();
  const portSig = new Set();
  for (const p of inst.ports) { sigByName.set(nk(p.name), p.sig); portSig.add(p.sig); }
  for (const s of inst.signals) if (!/[.[]/.test(s.name)) sigByName.set(nk(s.name), s);
  const moduleLevel = s => s && sigByName.get(nk(s.name)) === s;
  const W = s => s?.t?.w ?? 1;

  // ---- source text pieces
  const itf = ci && entText ? vhdlInterface(entText, mod) : { generics: [], ports: new Map() };
  const typeText = new Map();     // name -> type text (VHDL)
  let toks = [], ls = [];
  if (archText) { toks = tokenize(ci ? archText : blankDirectives(archText), lang); ls = lineStarts(archText); }
  const itemSpan = new Map();     // item -> { code, start, end }
  let modStart = 0, modEnd = toks.length;
  let archTok = -1;               // VHDL: the token 'architecture' of the module's architecture
  if (ci) {
    // context clause
    if (entText) {
      const et = tokenize(entText, 'vhdl'), els = lineStarts(entText);
      const eoff = offsetOf(els, mod.loc);
      const ctx = [];
      let st = 0;
      for (let k = 0; k < et.length && et[k].s < eoff;) {
        const e = toSemi(et, k);
        const v = et[k].v;
        if (v === 'library' || v === 'use') ctx.push(squash(stripComments(entText.slice(et[k].s, et[e - 1].e), 'vhdl')));
        else ctx.length = 0;
        if (e <= k) break;
        k = e; st = k;
      }
      doc.hdl.context = ctx.join('\n');
    }
    for (const g of itf.generics) doc.hdl.generics.push({ name: g.name, type: g.type, default: g.default });
    for (const [n, x] of itf.ports) typeText.set(n, x.type);
    if (archText) {
      // architecture <arch> of <entity> is ... begin
      let a = -1;
      for (let k = 0; k < toks.length; k++) if (toks[k].v === 'architecture' && toks[k + 2]?.v === 'of' && toks[k + 3]?.v === mod.name.toLowerCase()) { a = k; if (!mod.arch || toks[k + 1].v === mod.arch) break; }
      archTok = a;
      if (a >= 0) {
        doc.hdl.arch = toks[a + 1].raw || toks[a + 1].v;
        const isTok = a + 4;
        const firstItemOff = Math.min(...(mod.items || []).map(it => offsetOf(ls, it.loc)).filter(x => x >= 0), Infinity);
        let beginIdx = -1;
        for (let k = isTok + 1; k < toks.length; k++) {
          if (toks[k].s >= firstItemOff) break;
          if (toks[k].v === 'begin') beginIdx = k;
          if (!Number.isFinite(firstItemOff) && toks[k].v === 'end' && beginIdx >= 0 && toks[k - 1].v === 'begin') break;
        }
        if (beginIdx > isTok) {
          const raw = archText.slice(toks[isTok].e, toks[beginIdx].s);
          doc.hdl.decls = dedentBlock(raw);
          for (const m of stripComments(raw, 'vhdl').matchAll(/\bsignal\s+([A-Za-z][\w\s,]*?)\s*:\s*([^;]*);/gi)) {
            const t = squash(m[2].split(':=')[0]);
            for (const nm of m[1].split(',')) typeText.set(nm.trim().toLowerCase(), t);
          }
        }
      }
    }
    // item spans
    for (const it of mod.items || []) {
      if (!archText) break;
      const off = offsetOf(ls, it.loc);
      let i = tokAt(toks, off);
      while (i > 0 && ![';', 'begin'].includes(toks[i - 1].v) && toks[i].s > off - 200) {
        if (toks[i - 1].v === ':' || toks[i - 1].k === 'id' && toks[i]?.v === ':') { i--; continue; }
        break;
      }
      // label "lbl :" before loc
      if (toks[i - 1]?.v === ':' && toks[i - 2]?.k === 'id') i -= 2;
      const start = i;
      let j = i;
      if (toks[j + 1]?.v === ':' && toks[j]?.k === 'id') j += 2;
      if (toks[j]?.v === 'postponed') j++;
      let end;
      const kw = toks[j]?.v;
      if (it.kind === 'process' && kw === 'process') {
        let k = j;
        for (; k < toks.length; k++) if (toks[k].v === 'end' && toks[k + 1]?.v === 'process') break;
        end = toSemi(toks, k);
      } else if (it.kind === 'generate_for' || it.kind === 'generate_if' || kw === 'block') {
        let d = 0, k = j;
        const opener = kw === 'block' ? 'block' : 'generate';
        for (; k < toks.length; k++) {
          if (toks[k].v === opener && toks[k - 1]?.v !== 'end') d++;
          else if (toks[k].v === 'end' && toks[k + 1]?.v === opener) { d--; if (d === 0) break; }
        }
        end = toSemi(toks, k);
      } else end = toSemi(toks, j);
      const s0 = toks[start]?.s ?? 0, e0 = toks[end - 1]?.e ?? s0;
      const [a, b] = withComments(archText, s0, e0, 'vhdl');
      const col = a - (ls[archText.slice(0, a).split('\n').length - 1] ?? 0) + 1;
      itemSpan.set(it, { code: dedent(archText.slice(a, b), col), start: s0, end: e0, kw });
    }
  } else if (archText) {
    // Verilog: `timescale / `define, parameters, declarations
    const mo = offsetOf(ls, mod.loc);
    modStart = tokAt(toks, mo);
    for (let k = modStart; k < toks.length; k++) if (toks[k].v === 'endmodule') { modEnd = k; break; }
    const ctx = [];
    if (mod.timescale) {
      const u = ps => (ps >= 1e12 ? `${ps / 1e12}s` : ps >= 1e9 ? `${ps / 1e9}ms` : ps >= 1e6 ? `${ps / 1e6}us` : ps >= 1e3 ? `${ps / 1e3}ns` : ps >= 1 ? `${ps}ps` : `${ps * 1000}fs`);
      ctx.push(`\`timescale ${u(mod.timescale.unit)} / ${u(mod.timescale.precision)}`);
    }
    doc.hdl.context = ctx.join('\n');
    for (const p of mod.params || []) if (!p.local) doc.hdl.generics.push({ name: p.name, type: '', default: p.default ? unparen(prVlog(p.default)) : '0' });
    const portNames = new Set((mod.ports || []).map(p => p.name));
    const spans = new Map();
    for (const d of mod.decls || []) {
      const off = offsetOf(ls, d.loc);
      if (off < 0) continue;
      const st = vStmtStart(toks, tokAt(toks, off));
      if (st < modStart) continue;
      const kw = toks[st].v;
      if (['input', 'output', 'inout'].includes(kw)) continue;
      let en;
      if (kw === 'function' || kw === 'task') { en = st; while (en < modEnd && toks[en].v !== (kw === 'function' ? 'endfunction' : 'endtask')) en++; en++; }
      else en = toSemi(toks, st);
      if (!spans.has(st)) spans.set(st, { st, en, names: [] });
      spans.get(st).names.push(d.name);
    }
    // genvar statements
    for (let k = modStart; k < modEnd; k++) if (toks[k].v === 'genvar' && !spans.has(k)) spans.set(k, { st: k, en: toSemi(toks, k), names: [] });
    const declTexts = [];
    for (const sp of [...spans.values()].sort((a, b) => a.st - b.st)) {
      if (sp.names.some(n => portNames.has(n))) continue;
      // (with its comments and attributes, #225)
      const [a, b] = withComments(archText, toks[sp.st].s, toks[sp.en - 1].e, lang);
      let txt = archText.slice(a, b);
      // net declaration assignment "wire [3:0] s = a + b;" -> declaration only (assignment becomes a block)
      const kw = toks[sp.st].v;
      if (['wire', 'tri', 'logic', 'wand', 'wor', 'supply0', 'supply1'].includes(kw) && sp.names.length === 1) {
        const eq = toks.slice(sp.st, sp.en).findIndex(t => t.v === '=');
        if (eq > 0) { txt = archText.slice(a, toks[sp.st + eq - 1].e) + ';'; sp.splitAssign = true; }
      }
      const col = a - (ls[archText.slice(0, a).split('\n').length - 1] ?? 0) + 1;
      declTexts.push(dedent(txt, col));
      sp.text = txt;
    }
    // the initial values of output ports declared in the header ("output reg [3:0] q = 4'd7", #225)
    for (const p of mod.ports || []) if (p.default && p.dir === 'out') declTexts.push(`initial ${p.name} = ${unparen(prVlog(p.default))};`);
    doc.hdl.decls = declTexts.join('\n');
    // items
    for (const it of mod.items || []) {
      const off = offsetOf(ls, it.loc);
      if (off < 0) continue;
      const st = vStmtStart(toks, tokAt(toks, off));
      const kw = toks[st]?.v;
      let en;
      let code;
      if (['always', 'initial', 'always_comb', 'always_ff', 'always_latch', 'final'].includes(kw)) en = vStmt(toks, st + 1);
      else if (it.kind === 'generate_for' || it.kind === 'generate_if') en = vStmt(toks, st);
      else en = toSemi(toks, st);
      const s0 = toks[st].s, e0 = toks[en - 1].e;
      const [a, b] = withComments(archText, s0, e0, lang);
      const col = a - (ls[archText.slice(0, a).split('\n').length - 1] ?? 0) + 1;
      code = dedent(archText.slice(a, b), col);
      if (['wire', 'tri', 'logic', 'wand', 'wor'].includes(kw) && it.kind === 'assign') {
        // from a net declaration assignment
        const eq = toks.slice(st, en).findIndex(t => t.v === '=');
        code = `assign ${squash(prVlog(it.target))} = ${archText.slice(toks[st + eq + 1].s, toks[en - 2].e).trim()};`;
      } else if (it.kind === 'process' && it.initial && !['initial', 'always', 'always_comb', 'always_ff', 'always_latch', 'final'].includes(kw)
        && it.body?.length && it.body.every(b => b.kind === 'assign' && b.target)) {
        // a variable declared with its initial value ("reg [7:0] q = 8'h05;" of an output port q,
        // #225): an initial statement (the port is declared in the module's header)
        code = it.body.map(b => `initial ${squash(prVlog(b.target))} = ${unparen(prVlog(b.value))};`).join('\n');
      }
      if (it.kind === 'generate_for' || it.kind === 'generate_if') code = `generate\n${code}\nendgenerate`;
      itemSpan.set(it, { code, start: s0, end: e0, kw });
    }
  }
  if (!ci && archText) {
    // `define macros used by the verbatim pieces
    const used = [doc.hdl.decls, ...[...itemSpan.values()].map(x => x.code)].join('\n');
    // (the ones of the file before the module's end; #225: and the `include lines before the module
    // when a macro used is not defined in the file: the included file defines it)
    const upTo = archText.slice(0, toks[modEnd]?.s ?? archText.length);
    const defs = [...upTo.matchAll(/^[ \t]*`define\s+(\w+)[^\n]*$/gm)].filter(m => new RegExp('`' + m[1] + '\\b').test(used));
    const DIRECTIVES = /^(ifdef|ifndef|elsif|else|endif|define|undef|include|timescale|default_nettype|resetall|celldefine|endcelldefine|line|pragma|__FILE__|__LINE__)$/;
    const local = new Set([...upTo.matchAll(/^[ \t]*`define\s+(\w+)/gm)].map(m => m[1]));
    const foreign = [...used.matchAll(/`(\w+)/g)].some(m => !DIRECTIVES.test(m[1]) && !local.has(m[1]));
    const incs = foreign ? [...archText.slice(0, toks[modStart]?.s ?? 0).matchAll(/^[ \t]*`include\s+("[^"\n]*"|<[^>\n]*>)[^\n]*$/gm)] : [];
    if (defs.length || incs.length) doc.hdl.context = [doc.hdl.context, ...incs.map(m => m[0].trim()), ...defs.map(m => m[0].trim())].filter(Boolean).join('\n');
  }
  if (!archText) diags.push({ severity: 'warning', message: `source text of '${inst.module}' not available: HDL blocks are placeholders` });

  // ---- map elaborated processes / children to top-level items
  const owner = new Map();   // ir object -> top-level item
  for (const it of mod.items || []) for (const x of nestedOf(it)) if (x) owner.set(x, it);
  const itemRW = new Map();  // item -> { reads:Set, writes:Set, procs:[], children:[] }
  const rwOf = it => { let r = itemRW.get(it); if (!r) itemRW.set(it, r = { reads: new Set(), writes: new Set(), procs: [], children: [], clocks: new Set() }); return r; };
  for (const p of inst.procs) {
    if (p.kind === 'glue') continue;
    const it = owner.get(p.item) || owner.get(p.loc);
    if (!it) { diags.push({ severity: 'warning', message: `process '${p.name}' not mapped to a source item` }); continue; }
    const r = rwOf(it);
    r.procs.push(p);
    for (const s of p.reads) if (moduleLevel(s)) r.reads.add(s);
    for (const t of p.triggers || []) if (t.sig && moduleLevel(t.sig)) r.reads.add(t.sig);
    for (const s of p.writes) if (moduleLevel(s)) r.writes.add(s);
    if (p.kind === 'process') { try { for (const c of clocksOf(p).clocks) r.clocks.add(c); } catch { /* ignore */ } }
  }
  for (const c of inst.children) {
    const it = owner.get(c.loc);
    if (!it) { diags.push({ severity: 'warning', message: `instance '${c.name}' not mapped to a source item` }); continue; }
    const r = rwOf(it);
    r.children.push(c);
    for (const ci2 of c.connInfo || []) {
      for (const s of ci2.reads || []) if (moduleLevel(s)) r.reads.add(s);
      for (const s of ci2.writes || []) if (moduleLevel(s)) r.writes.add(s);
    }
  }

  // ---- VHDL: the names as written in the design (the elaborator lower-cases them, #131): the
  // spelling of each identifier where the entity or the architecture first writes it (its declaration)
  const spell = new Map();
  if (ci) {
    if (entText) {
      const et = tokenize(entText, 'vhdl');
      const e0 = entityTok(et, mod.name);
      if (e0 >= 0) idSpelling(et, e0, et.findIndex((x, k) => k > e0 && x.v === 'end'), spell);
    }
    if (archTok >= 0) {
      let e = archTok + 1;
      while (e < toks.length && !(toks[e].v === 'architecture' || toks[e].v === 'package' || (toks[e].v === 'entity' && toks[e + 2]?.v === 'is'))) e++;
      idSpelling(toks, archTok, e, spell);
    }
  }
  const sp = name => spell.get(String(name).toLowerCase()) ?? name;
  if (!opts.name) doc.name = sp(doc.name);
  const modsN = normModules(opts.modules);

  // ---- connectivity being built: net name -> { width, drivers: [ep], sinks: [ep] } ; ep = { sym, pin } | { port }
  const nets = new Map();
  const netOf = (name, width) => { let n = nets.get(nk(name)); if (!n) nets.set(nk(name), n = { name, width, eps: [], drivers: [] }); return n; };
  let autoK = 0;
  const anonNet = width => netOf(`__n${++autoK}`, width);
  const symbols = [];
  let gateK = 0;
  const usedNames = new Set([...inst.children.map(c => nk(c.name)), ...[...sigByName.keys()]]);
  const gateName = () => { let nm; do nm = `inst_${++gateK}`; while (usedNames.has(nk(nm))); usedNames.add(nk(nm)); return nm; };
  const addSym = (type, params, name, extra = {}) => {
    const s = { id: `S${symbols.length + 1}`, type, x: 0, y: 0, rot: 0, mirror: false, name: name || gateName(), params: { ...defaultParams(type), ...params }, ...extra };
    symbols.push(s); return s;
  };
  const connect = (netName, width, ep, isDriver) => { const n = typeof netName === 'object' ? netName : netOf(netName, width); n.eps.push(ep); if (isDriver) n.drivers.push(ep); return n; };

  // ---- ports -> I/O markers
  for (const p of inst.ports) {
    const port = { id: `P${doc.ports.length + 1}`, name: sp(p.name), dir: p.dir === 'out' ? 'out' : p.dir === 'inout' ? 'inout' : 'in', width: W(p.sig), x: 0, y: 0 };
    if (ci) {
      port.type = typeText.get(nk(p.name)) || typeTextVhdl(mod.ports.find(q => nk(q.name) === nk(p.name))?.type);
      // a buffer port stays one, a port's default value stays (#225)
      const ip = itf.ports.get(nk(p.name));
      if (ip?.mode === 'buffer') port.mode = 'buffer';
      if (ip?.default) port.default = ip.default;
    } else {
      const ip = mod.ports.find(q => q.name === p.name);
      const rng = rangeTextVlog(ip?.type);
      port.type = `${ip?.type?.signed ? 'signed ' : ''}${rng}`.trim();
      if (!port.type) delete port.type;
    }
    doc.ports.push(port);
    connect(p.name, W(p.sig), { port: port.id }, port.dir === 'in');
  }

  // ---- type classes for gate conversion
  const clsOfSig = s => {
    if (!ci) return s.t.s ? 'vs' : 'v';
    const t = typeText.get(nk(s.name));
    return t ? vhdlClass(t) : 'other';
  };
  const sigOfRef = e => (e && e.op === 'ref' ? sigByName.get(nk(e.name)) : null);
  const constIdx = e => (e && e.op === 'int' ? +e.value : null);
  // try to express an expression as gates; returns { net } (existing net name) / { sym, pin, w, cls } / null
  function exprToGates(e, plan) {
    if (!e) return null;
    const ref = sigOfRef(e);
    if (ref) { if (!moduleLevel(ref)) return null; const cls = clsOfSig(ref); if (cls === 'other' || cls === 'u' || cls === 's' || cls === 'vs') return null; return { net: ref.name, w: W(ref), cls }; }
    // bit / slice selection of a whole signal with constant indices
    if ((e.op === 'index' || (e.op === 'apply' && e.args.length === 1 && !e.args[0].named)) || e.op === 'slice') {
      const base = e.op === 'apply' ? sigByName.get(nk(e.name)) : sigOfRef(e.base);
      if (!base || !moduleLevel(base)) return null;
      const bc = clsOfSig(base);
      if (!(bc === 'slv' || bc === 'v')) return null;
      let msb, lsb;
      if (e.op === 'slice') { msb = constIdx(e.left); lsb = constIdx(e.right); }
      else { msb = lsb = constIdx(e.op === 'apply' ? e.args[0] : e.index); }
      if (msb == null || lsb == null) return null;
      const w = Math.abs(msb - lsb) + 1;
      plan.push(() => {
        const s = addSym('slice', { msb, lsb });
        connect(base.name, W(base), { sym: s.id, pin: 'I' });
        return s;
      });
      return { pending: plan.length - 1, pin: 'O', w, cls: ci ? (e.op === 'slice' ? 'slv' : 'sl') : 'v' };
    }
    if (e.op === 'lit' && (e.sized !== false || ci)) {
      const w = e.bits.length;
      plan.push(() => addSym('constant', { value: bitsValue(e.bits), width: w }));
      return { pending: plan.length - 1, pin: 'O', w, cls: ci ? (e.scalar ? 'sl' : 'slv') : 'v', lit: true };
    }
    const gate = (type, args, outW, outCls, pins) => {
      plan.push(() => addSym(type, { width: outW }));
      const idx = plan.length - 1;
      return { pending: idx, pin: 'O', w: outW, cls: outCls, args, pins };
    };
    if (e.op === 'unary' && e.o === '~' && !(e.a.op === 'binary' && ['&', '|', '^'].includes(e.a.o))) {
      const a = exprToGates(e.a, plan); if (!a || a.lit) return null;
      return gate('inv', [[a, 'I']], a.w, a.cls);
    }
    let inverted = false;
    if (e.op === 'unary' && e.o === '~' && e.a.op === 'binary' && ['&', '|', '^'].includes(e.a.o)) { inverted = true; e = e.a; }
    if (e.op === 'binary' && ['&', '|', '^', '~^', 'nand', 'nor'].includes(e.o)) {
      // flatten associative chains
      const flat = [];
      const f = x => { if (x.op === 'binary' && x.o === e.o && ['&', '|', '^'].includes(e.o) && flat.length < 16) { f(x.a); f(x.b); } else flat.push(x); };
      if (['&', '|', '^'].includes(e.o)) f(e); else flat.push(e.a, e.b);
      // (a NAND / NOR / XNOR: one gate, at most 4 / 2 inputs; an AND / OR / XOR of more: a tree of gates, #171)
      const maxN = inverted ? ({ '&': 4, '|': 4, '^': 2 }[e.o]) : ({ '&': 16, '|': 16, '^': 16 }[e.o] || 2);
      if (flat.length > maxN) return null;
      // operands '~signal' of an AND/OR become the inverted inputs of an ANDnBk/ORnBk (NANDnBk/NORnBk) gate
      const simpleNot = x => x.op === 'unary' && x.o === '~' && ['ref', 'index', 'slice', 'apply'].includes(x.a.op);
      const nInv = ['&', '|'].includes(e.o) ? flat.filter(simpleNot).length : 0;
      if (nInv && flat.length > 1 && flat.length <= 4) {
        const op0 = inverted ? { '&': 'nand', '|': 'nor' }[e.o] : { '&': 'and', '|': 'or' }[e.o];
        const type = `${op0}${flat.length}b${nInv}`;
        if (SYMBOLS[type]) {
          const ord = [...flat.filter(simpleNot).map(x => x.a), ...flat.filter(x => !simpleNot(x))];
          const args = ord.map(x => exprToGates(x, plan));
          if (args.every(Boolean) && !args.some((a, k) => k < nInv && a.lit)) {
            const w = args[0].w, cls = args.find(a => !a.lit)?.cls || args[0].cls;
            const okT = args.every(a => a.w === w && (a.cls === cls || (a.lit && ((cls === 'sl' && a.cls === 'sl') || (cls !== 'sl' && a.cls !== 'sl')))));
            if (okT && !args.every(a => a.lit)) return gate(type, args.map((a, k) => [a, `I${k}`]), w, cls);
          }
          return null;
        }
      }
      const args = flat.map(x => exprToGates(x, plan));
      if (args.some(a => !a)) return null;
      const w = args[0].w, cls = args.find(a => !a.lit)?.cls || args[0].cls;
      if (args.some(a => a.w !== w || (a.cls !== cls && !(a.lit && ((cls === 'sl' && a.cls === 'sl') || (cls !== 'sl' && a.cls !== 'sl')))))) return null;
      if (args.every(a => a.lit)) return null;
      const op = inverted ? { '&': 'nand', '|': 'nor', '^': 'xnor' }[e.o] : { '&': 'and', '|': 'or', '^': 'xor', '~^': 'xnor', nand: 'nand', nor: 'nor' }[e.o];
      if ((args.length <= 4 && SYMBOLS[`${op}${args.length}`] && !SYMBOLS[`${op}${args.length}`].hidden) || !SYMBOLS[`${op}2`]) return SYMBOLS[`${op}${args.length}`] ? gate(`${op}${args.length}`, args.map((a, k) => [a, `I${k}`]), w, cls) : null;
      // more than 4 operands (#171: gates of at most 4 inputs): AND / OR / XOR as a tree of them, the
      // inverted ones (NAND, NOR) left to an HDL block
      if (!['and', 'or', 'xor'].includes(op)) return null;
      const K = SYMBOLS[`${op}4`] ? 4 : 2;   // (XOR: 2 inputs a gate)
      const tree = list => (list.length <= K ? gate(`${op}${list.length}`, list.map((a, k) => [a, `I${k}`]), w, cls)
        : tree(Array.from({ length: Math.ceil(list.length / K) }, (_, i) => list.slice(K * i, K * i + K)).map(g => (g.length === 1 ? g[0] : gate(`${op}${g.length}`, g.map((a, k) => [a, `I${k}`]), w, cls)))));
      return tree(args);
    }
    if (e.op === 'cond') {
      // Verilog s ? a : b ; VHDL a when s = '1' else b
      let sel = null, a = e.then, b = e.else;
      if (!ci) sel = e.cond;
      else if (e.cond.op === 'binary' && e.cond.o === '==' && e.cond.b?.op === 'lit' && e.cond.b.scalar) {
        sel = e.cond.a;
        if (e.cond.b.bits === '0') [a, b] = [b, a]; else if (e.cond.b.bits !== '1') return null;
      }
      if (!sel) return null;
      const sv = exprToGates(sel, plan);
      if (!sv || sv.w !== 1 || sv.lit || (ci && sv.cls !== 'sl')) return null;
      const A = exprToGates(a, plan), B = exprToGates(b, plan);
      if (!A || !B || A.w !== B.w || (A.cls !== B.cls && !(A.lit || B.lit))) return null;
      return gate('mux2', [[B, 'D0'], [A, 'D1'], [sv, 'S0']], A.w, A.lit ? B.cls : A.cls);
    }
    if (e.op === 'concat' && e.parts.length <= 8) {
      const args = e.parts.map(x => exprToGates(x, plan));
      if (args.some(a => !a)) return null;
      if (ci && args.some(a => a.cls !== 'sl' && a.cls !== 'slv')) return null;
      const w = args.reduce((s, a) => s + a.w, 0);
      plan.push(() => addSym('busjoin', { widths: args.map(a => a.w).join(',') }));
      return { pending: plan.length - 1, pin: 'O', w, cls: ci ? 'slv' : 'v', args: args.map((a, k) => [a, `I${k}`]) };
    }
    return null;
  }
  // a tri-state driver: { sel, data, low } (low = the buffer drives while sel is 0) or null
  const isZ = x => !!x && ((x.op === 'lit' && /^z+$/i.test(x.bits)) || (x.op === 'repl' && isZ(x.value))
    || (x.op === 'aggregate' && x.items?.length === 1 && x.items[0].choices?.length === 1 && x.items[0].choices[0] === 'others' && isZ(x.items[0].value)));
  function triParts(e) {
    if (!e || e.op !== 'cond') return null;
    let sel, hi = true;
    if (!ci) sel = e.cond;
    else if (e.cond.op === 'binary' && e.cond.o === '==' && e.cond.b?.op === 'lit' && e.cond.b.scalar && /^[01]$/.test(e.cond.b.bits)) { sel = e.cond.a; hi = e.cond.b.bits === '1'; }
    else return null;
    if (isZ(e.else) && !isZ(e.then)) return { sel, data: e.then, low: !hi };
    if (isZ(e.then) && !isZ(e.else)) return { sel, data: e.else, low: hi };
    return null;
  }
  // materialise a planned gate tree: returns { net } handled by caller
  function materialise(node, plan, built) {
    if (node.net) return { netName: node.net, w: node.w };
    const s = built[node.pending] || (built[node.pending] = plan[node.pending]());
    for (const [arg, pin] of node.args || []) {
      const src = materialise(arg, plan, built);
      if (src.netName) connect(src.netName, src.w, { sym: s.id, pin });
      else { const n = anonNet(arg.w); connect(n, arg.w, { sym: src.sym.id, pin: src.pin }, true); connect(n, arg.w, { sym: s.id, pin }); }
    }
    return { sym: s, pin: node.pin, w: node.w };
  }

  // ---- items
  // signals written by items other than Verilog `initial` blocks: an `initial r = ...;` next to
  // the always block that drives r only gives r its power-up value, it is not a second driver
  const drivenElsewhere = new Set();
  for (const it of mod.items || []) if (!(it.kind === 'process' && it.initial)) for (const x of itemRW.get(it)?.writes || []) drivenElsewhere.add(x);
  let blockK = 0;
  for (const it of mod.items || []) {
    const span = itemSpan.get(it);
    const rw = itemRW.get(it) || { reads: new Set(), writes: new Set(), procs: [], children: [], clocks: new Set() };
    // 1. simple continuous assignment -> gates
    if (it.kind === 'assign' && !it.delay && rw.procs.length === 1 && rw.children.length === 0) {
      const tsig = sigOfRef(it.target);
      if (tsig && moduleLevel(tsig)) {
        const tcls = clsOfSig(tsig);
        // tri-state driver (x when e = '1' else 'Z' / e ? x : 'bz) -> tri-state buffer BUFE / BUFT
        const tri = (tcls === 'sl' || tcls === 'slv' || tcls === 'v') ? triParts(it.value) : null;
        if (tri) {
          const plan = [];
          const sv = exprToGates(tri.sel, plan), dv = exprToGates(tri.data, plan);
          if (sv && sv.w === 1 && !sv.lit && (!ci || sv.cls === 'sl') && dv && dv.w === W(tsig) && (dv.cls === tcls || dv.lit)) {
            const en = tri.low ? 'T' : 'E';
            const s = addSym('tbuf', { width: dv.w, enable: en });
            const built = [];
            for (const [node, pin] of [[sv, en], [dv, 'I']]) {
              const src = materialise(node, plan, built);
              if (src.netName) connect(src.netName, src.w, { sym: s.id, pin });
              else { const n = anonNet(node.w); connect(n, node.w, { sym: src.sym.id, pin: src.pin }, true); connect(n, node.w, { sym: s.id, pin }); }
            }
            connect(tsig.name, W(tsig), { sym: s.id, pin: 'O' }, true);
            continue;
          }
        }
        const plan = [];
        const g = (tcls === 'sl' || tcls === 'slv' || tcls === 'v') ? exprToGates(it.value, plan) : null;
        if (g && g.w === W(tsig) && (g.cls === tcls || g.lit)) {
          if (g.net) {
            const s = addSym('buf', { width: g.w });
            connect(g.net, g.w, { sym: s.id, pin: 'I' });
            connect(tsig.name, W(tsig), { sym: s.id, pin: 'O' }, true);
          } else {
            const built = [];
            const r = materialise(g, plan, built);
            connect(tsig.name, W(tsig), { sym: r.sym.id, pin: r.pin }, true);
          }
          continue;
        }
      }
    }
    // 2. module instance -> module symbol
    if (it.kind === 'instance' && rw.children.length === 1 && !rw.children[0].blackbox) {
      const c = rw.children[0];
      const info = c.connInfo || [];
      const plan = [];
      const pinsOK = [];
      let ok = true;
      for (const ci2 of info) {
        const conn = (() => {
          const k = it.conns.findIndex(x => x.port != null && nk(x.port) === nk(ci2.port));
          if (k >= 0) return it.conns[k];
          const pos = info.indexOf(ci2);
          const posConn = it.conns.filter(x => x.port == null);
          return posConn.length ? posConn[pos] : null;
        })();
        const expr = conn ? conn.expr : null;
        const pw = ci2.t?.w ?? 1;
        if (!expr) { pinsOK.push({ port: ci2.port, none: true }); continue; }
        const ref = sigOfRef(expr);
        if (ref && moduleLevel(ref) && W(ref) === pw) { pinsOK.push({ port: ci2.port, net: ref.name, w: pw, out: ci2.dir === 'out' || ci2.dir === 'inout' }); continue; }
        if (ci2.dir === 'in' && (expr.op === 'lit' || expr.op === 'int')) {
          const bits = expr.op === 'lit' ? expr.bits : constBits(expr.value, pw);
          pinsOK.push({ port: ci2.port, constBits: bits.length === pw ? bits : constBits(`0b${bits}`, pw), w: pw }); continue;
        }
        if (ci2.dir === 'in') {
          const g = exprToGates(expr, plan);
          if (g && g.w === pw && !g.net) { pinsOK.push({ port: ci2.port, gate: g, w: pw }); continue; }
          if (g && g.net && g.w === pw) { pinsOK.push({ port: ci2.port, net: g.net, w: pw }); continue; }
        }
        ok = false; break;
      }
      if (ok) {
        const generics = {};
        it.params.forEach((pp, k) => {
          if (!pp.value) return;
          let nm = pp.name;
          if (nm == null) { const nl2 = (c.mod?.params || []).filter(x => !x.local); nm = nl2[k]?.name; }
          if (nm) generics[nm] = unparen(ci ? prVhdl(pp.value) : prVlog(pp.value));
        });
        // the module, its pins and generics named as the modules name them (VHDL: case-insensitive)
        const cm = c.mod?.lang === 'vhdl' ? findMod(modsN, c.module) : null;
        const asIn = (list, n) => (cm && list?.find(x => x.name.toLowerCase() === String(n).toLowerCase())?.name) || n;
        for (const g of Object.keys(generics)) { const g2 = asIn(cm?.generics, g); if (g2 !== g) { generics[g2] = generics[g]; delete generics[g]; } }
        // a block of a schematic (its own entity, marked silinx-symbol, #175): the symbol it was drawn as
        const mark = blockMarkOf(srcOf(c.mod?.file) ?? archText, c.mod?.name || c.module);
        const s = mark ? addSym(mark.type, mark.params, sp(c.name))
          : addSym('module', { module: cm?.name || c.module, generics, ports: info.map(x => ({ name: asIn(cm?.ports, x.port), dir: x.dir, width: x.t?.w ?? 1 })) }, sp(c.name));
        const built = [];
        for (const q of pinsOK) {
          if (q.none) continue;
          const ep = { sym: s.id, pin: asIn(cm?.ports, q.port) };
          if (q.net) connect(q.net, q.w, ep, q.out);
          else if (q.constBits) {
            const k = addSym('constant', { value: bitsValue(q.constBits), width: q.w });
            const n = anonNet(q.w); connect(n, q.w, { sym: k.id, pin: 'O' }, true); connect(n, q.w, ep);
          } else if (q.gate) {
            const r = materialise(q.gate, plan, built);
            const n = anonNet(q.w); connect(n, q.w, { sym: r.sym.id, pin: r.pin }, true); connect(n, q.w, ep);
          }
        }
        continue;
      }
    }
    // 3. everything else -> HDL block carrying the original text
    const kindTag = it.kind === 'process' ? (it.initial || it.sens === null ? 'tb' : rw.clocks.size ? 'reg' : 'comb') : it.kind === 'instance' ? 'inst' : it.kind.startsWith('generate') ? 'gen' : 'logic';
    const procedural = rw.procs.some(p => p.kind === 'process');
    const outs = [...rw.writes].filter(x => !(it.kind === 'process' && it.initial && drivenElsewhere.has(x)));
    const ins = [...rw.reads].filter(s => !rw.writes.has(s));
    const clocks = ins.filter(s => rw.clocks.has(s));
    const others = ins.filter(s => !rw.clocks.has(s));
    const title = it.label ? sp(it.label) : (it.kind === 'instance' ? `${sp(it.name)} : ${findMod(modsN, it.module)?.name || it.module}` : it.kind === 'process' ? (ci ? ({ with: 'with select', assert: 'assert', process: 'process' }[span?.kw] || (span?.kw ? 'statement' : 'process')) : (it.initial ? 'initial' : 'always')) : it.kind === 'assign' ? 'assign' : it.kind.replace('_', ' '));
    let nm = it.label ? sp(it.label) : (it.kind === 'instance' ? sp(it.name) : null);
    if (!nm || usedNames.has(nk(nm)) && it.kind !== 'instance') { nm = `${kindTag === 'reg' ? 'REG' : kindTag === 'tb' ? 'TB' : kindTag === 'comb' ? 'COMB' : kindTag === 'gen' ? 'GEN' : 'LOGIC'}_${++blockK}`; while (usedNames.has(nk(nm))) nm = `BLK_${++blockK}`; }
    usedNames.add(nk(nm));
    const s = addSym('hdlblock', {
      title,
      kind: kindTag,
      inputs: [...clocks, ...others].map(x => ({ name: sp(x.name), width: W(x), ...(rw.clocks.has(x) ? { clock: true } : {}) })),
      outputs: outs.map(x => ({ name: sp(x.name), width: W(x), ...(procedural && !rw.children.length ? { reg: true } : {}) })),
    }, nm, { hdl: span ? span.code : (ci ? `-- source of item at line ${it.loc?.line} not available` : `// source of item at line ${it.loc?.line} not available`) });
    if (!ci && procedural) {
      // outputs written by always/initial blocks are Verilog regs (unless driven by an instance in a generate)
      const drivenByInst = new Set(rw.children.flatMap(c => (c.connInfo || []).flatMap(x => [...(x.writes || [])])));
      s.params.outputs = outs.map(x => ({ name: x.name, width: W(x), ...(!drivenByInst.has(x) && rw.procs.some(p => p.kind === 'process' && p.writes.has(x)) ? { reg: true } : {}) }));
    }
    for (const x of [...clocks, ...others]) connect(x.name, W(x), { sym: s.id, pin: sp(x.name) });
    for (const x of outs) connect(x.name, W(x), { sym: s.id, pin: sp(x.name) }, true);
  }
  // hide hdlblock output pins whose signal nobody else uses (internal state)
  for (const s of symbols) {
    if (s.type !== 'hdlblock') continue;
    s.params.outputs = s.params.outputs.filter(q => {
      const n = nets.get(nk(q.name));
      const others = n ? n.eps.filter(e => e.sym !== s.id) : [];
      if (others.length) return true;
      if (n) n.eps = n.eps.filter(e => e.sym !== s.id);
      return false;
    });
  }
  // and its input pins whose signal nothing else drives nor reads (#225: a register read with only
  // its initial value, a constant signal): the block reads the declared signal itself (a pin left
  // without a wire would be tied to 0 in the HDL)
  for (const s of symbols) {
    if (s.type !== 'hdlblock') continue;
    s.params.inputs = s.params.inputs.filter(q => {
      const n = nets.get(nk(q.name));
      if (!n || n.eps.some(e => e.sym !== s.id)) return true;
      n.eps = n.eps.filter(e => e.sym !== s.id);
      return false;
    });
  }
  doc.symbols = symbols;

  // ---- geometry
  for (const n of nets.values()) n.name = sp(n.name);
  const conns = [...nets.values()].filter(n => n.eps.length > 0);
  await placeAndRoute(doc, conns, { layout: opts.layout, modules: normModules(opts.modules), nk });
  if (diags.length) doc.importDiagnostics = diags;
  return doc;
}

// ===================================================================== placement & routing
function epPos(doc, ep, modules, cache) {
  if (ep.port) { const p = doc.ports.find(q => q.id === ep.port); return { x: p.x, y: p.y, side: p.dir === 'in' ? 'E' : 'W' }; }
  const s = doc.symbols.find(q => q.id === ep.sym);
  let pins = cache.get(s.id);
  if (!pins) cache.set(s.id, pins = symbolPins(s, modules));
  const p = pins.find(q => q.name === ep.pin);
  return p ? { x: p.x, y: p.y, side: p.side } : { x: s.x, y: s.y, side: 'W' };
}

// Merge the segments of one net into a clean set of polylines split at junctions.
export function mergeNetWires(polys) {
  const H = new Map(), Vv = new Map();
  const pts = new Set();
  const addPt = (x, y) => pts.add(key(x, y));
  for (const P of polys) {
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      if (a.y === b.y) { let l = H.get(a.y); if (!l) H.set(a.y, l = []); l.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]); }
      else if (a.x === b.x) { let l = Vv.get(a.x); if (!l) Vv.set(a.x, l = []); l.push([Math.min(a.y, b.y), Math.max(a.y, b.y)]); }
      addPt(a.x, a.y); addPt(b.x, b.y);
    }
  }
  const merge = l => { l.sort((p, q) => p[0] - q[0]); const out = []; for (const iv of l) { const last = out[out.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else out.push([...iv]); } return out; };
  const pieces = [];   // [a, b]
  const allPts = [...pts].map(k => k.split(',').map(Number));
  for (const [y, l] of H) for (const [x0, x1] of merge(l)) {
    const cuts = [...new Set([x0, x1, ...allPts.filter(([x, yy]) => yy === y && x > x0 && x < x1).map(([x]) => x)])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) pieces.push([{ x: cuts[i], y }, { x: cuts[i + 1], y }]);
  }
  for (const [x, l] of Vv) for (const [y0, y1] of merge(l)) {
    const cuts = [...new Set([y0, y1, ...allPts.filter(([xx, y]) => xx === x && y > y0 && y < y1).map(([, y]) => y)])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) pieces.push([{ x, y: cuts[i] }, { x, y: cuts[i + 1] }]);
  }
  // also cut horizontal pieces at vertical piece end points and vice versa (T junctions)
  // join pieces through degree-2 vertices into polylines
  const adj = new Map();
  pieces.forEach((pc, i) => { for (const p of pc) { const k = key(p.x, p.y); let a = adj.get(k); if (!a) adj.set(k, a = []); a.push(i); } });
  const usedP = new Set();
  const out = [];
  const walk = (i, from) => {
    const line = [from];
    let cur = i, at = from;
    for (;;) {
      usedP.add(cur);
      const pc = pieces[cur];
      const nxt = pc[0].x === at.x && pc[0].y === at.y ? pc[1] : pc[0];
      line.push(nxt);
      const a = adj.get(key(nxt.x, nxt.y));
      if (a.length !== 2) break;
      const other = a.find(j => j !== cur);
      if (usedP.has(other)) break;
      cur = other; at = nxt;
    }
    return line;
  };
  for (const [k, a] of adj) if (a.length !== 2) for (const i of a) if (!usedP.has(i)) { const [x, y] = k.split(',').map(Number); out.push(walk(i, { x, y })); }
  for (let i = 0; i < pieces.length; i++) if (!usedP.has(i)) out.push(walk(i, pieces[i][0]));
  // drop collinear interior points
  return out.map(line => line.filter((p, i) => {
    if (i === 0 || i === line.length - 1) return true;
    const a = line[i - 1], b = line[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  }));
}

function orthoRoute(start, bends, end) {
  const pts = [start];
  let prev = start;
  const raw = [start, ...bends, end];
  for (let i = 1; i < raw.length - 1; i++) {
    const o = raw[i], op = raw[i - 1];
    const horiz = Math.abs(o.y - op.y) < Math.abs(o.x - op.x);
    const q = horiz ? { x: snap(o.x), y: prev.y } : { x: prev.x, y: snap(o.y) };
    pts.push(q); prev = q;
  }
  // final approach
  const last = pts[pts.length - 1];
  if (last.x !== end.x && last.y !== end.y) {
    const n = raw.length;
    const lastHoriz = n >= 2 && Math.abs(raw[n - 1].y - raw[n - 2].y) < Math.abs(raw[n - 1].x - raw[n - 2].x);
    if (lastHoriz) {
      if (pts.length > 1) { const q = pts[pts.length - 1]; const pq = pts[pts.length - 2]; if (pq.x === q.x) q.y = end.y; else pts.push({ x: q.x, y: end.y }); }
      else pts.push({ x: last.x, y: end.y });
    } else pts.push({ x: end.x, y: last.y });
  }
  pts.push(end);
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l.x !== p.x || l.y !== p.y) out.push({ ...p }); }
  // fix any remaining diagonal
  const fixed = [out[0]];
  for (let i = 1; i < out.length; i++) { const a = fixed[fixed.length - 1], b = out[i]; if (a.x !== b.x && a.y !== b.y) fixed.push({ x: b.x, y: a.y }); fixed.push(b); }
  return fixed;
}

async function placeAndRoute(doc, conns, { layout, modules, nk }) {
  const portW = p => portBox(p).w;
  let done = false;
  if (typeof layout === 'function' && (doc.symbols.length + doc.ports.length) > 0) {
    try {
      const SIDE = { W: 'WEST', E: 'EAST', N: 'NORTH', S: 'SOUTH' };
      const children = doc.symbols.map(s => {
        const def = symbolDef(s, modules);
        return {
          id: s.id, width: def.w, height: def.h,
          layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
          ports: def.pins.map(p => ({ id: `${s.id}\u0001${p.name}`, x: p.x, y: p.y, width: 0, height: 0, layoutOptions: { 'elk.port.side': SIDE[p.side] } })),
        };
      });
      for (const p of doc.ports) {
        const w = portW(p);
        children.push({
          id: p.id, width: w, height: 20,
          layoutOptions: { 'elk.portConstraints': 'FIXED_POS', 'elk.layered.layering.layerConstraint': p.dir === 'in' ? 'FIRST' : 'LAST' },
          ports: [{ id: `${p.id}\u0001p`, x: p.dir === 'in' ? w : 0, y: 10, width: 0, height: 0, layoutOptions: { 'elk.port.side': p.dir === 'in' ? 'EAST' : 'WEST' } }],
        });
      }
      const pid = ep => (ep.port ? `${ep.port}\u0001p` : `${ep.sym}\u0001${ep.pin}`);
      const edges = [];
      conns.forEach((n, k) => {
        const src = n.drivers[0] || n.eps[0];
        n.eps.filter(e => e !== src).forEach((e, j) => edges.push({ id: `e${k}_${j}`, sources: [pid(src)], targets: [pid(e)], _net: k }));
      });
      const graph = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
          'elk.spacing.nodeNode': '40', 'elk.layered.spacing.nodeNodeBetweenLayers': '70',
          'elk.spacing.edgeEdge': '20', 'elk.spacing.edgeNode': '20',
          'elk.layered.spacing.edgeEdgeBetweenLayers': '20', 'elk.layered.spacing.edgeNodeBetweenLayers': '20',
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          'elk.layered.unnecessaryBendpoints': 'false', 'elk.padding': '[top=60,left=60,bottom=60,right=60]',
          'elk.separateConnectedComponents': 'false',
          // large graphs (technology schematics: hundreds of LUTs / flip-flops): cheaper placement
          ...(children.length > 100 || edges.length > 500 ? {
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.layered.thoroughness': '1',
            'elk.layered.crossingMinimization.greedySwitch.type': 'OFF', 'elk.layered.considerModelOrder.strategy': 'NONE',
          } : {}),
        },
        children, edges: edges.map(({ _net, ...e }) => e),
      };
      const res = await layout(graph);
      const pos = new Map((res.children || []).map(c => [c.id, c]));
      for (const s of doc.symbols) { const c = pos.get(s.id); if (c) { s.x = snap(c.x); s.y = snap(c.y); } }
      for (const p of doc.ports) { const c = pos.get(p.id); if (c) { p.x = snap(c.x + (p.dir === 'in' ? portW(p) : 0)); p.y = snap(c.y + 10); } }
      const cache = new Map();
      const resEdges = new Map((res.edges || []).map(e => [e.id, e]));
      const perNet = new Map();
      for (const e of edges) {
        const r = resEdges.get(e.id);
        const n = conns[e._net];
        const src = n.drivers[0] || n.eps[0];
        const dst = n.eps.filter(x => x !== src)[+e.id.split('_')[1]];
        const a = epPos(doc, src, modules, cache), b = epPos(doc, dst, modules, cache);
        const sec = r?.sections?.[0];
        const bends = sec ? (sec.bendPoints || []) : [{ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }];
        const poly = orthoRoute({ x: a.x, y: a.y }, bends, { x: b.x, y: b.y });
        let l = perNet.get(e._net); if (!l) perNet.set(e._net, l = []); l.push(poly);
      }
      const wires = [], labels = [];
      const netWires = [];   // [net, its wire ids]
      perNet.forEach((polys, k) => {
        const n = conns[k];
        const lines = mergeNetWires(polys);
        const ids = new Set();
        for (const pts of lines) { ids.add(`W${wires.length + 1}`); wires.push({ id: `W${wires.length + 1}`, points: pts, ...(n.width > 1 ? { bus: true } : {}) }); }
        netWires.push([n, ids]);
        if (!n.name.startsWith('__n') && !n.eps.some(e => e.port)) {
          const src = n.drivers[0] || n.eps[0];
          const a = epPos(doc, src, modules, cache);
          // put the label on the wire that starts at the driver pin, a little away from it
          const w0 = lines.find(L => (L[0].x === a.x && L[0].y === a.y) || (L[L.length - 1].x === a.x && L[L.length - 1].y === a.y)) || lines[0];
          if (w0) {
            const L = w0[0].x === a.x && w0[0].y === a.y ? w0 : w0.slice().reverse();
            const b = L[1];
            const d = Math.sign(b.x - a.x) * Math.min(20, Math.abs(b.x - a.x)) || 0, dy = Math.sign(b.y - a.y) * Math.min(20, Math.abs(b.y - a.y)) || 0;
            labels.push({ id: `L${labels.length + 1}`, x: a.x + d, y: a.y + dy, net: n.name });
          }
        }
      });
      doc.wires = wires; doc.labels = labels;
      // each net's wires joined where they branch and at its pins (#678)
      for (const [n, ids] of netWires) joinWires(doc, n.eps.map(e => epPos(doc, e, modules, cache)), ids);
      done = true;
      // verify connectivity; fall back to labelled stubs for nets that came out wrong
      const bad = verifyImport(doc, conns, modules, nk);
      if (bad.size) {
        stubNets(doc, conns, bad, modules);
        if (verifyImport(doc, conns, modules, nk).size) stubNets(doc, conns, new Set(conns.map((_, k) => k)), modules);
      }
    } catch (e) {
      done = false;
    }
  }
  if (!done) {
    columnLayout(doc, conns, modules);
    stubNets(doc, conns, new Set(conns.map((_, k) => k)), modules);
  }
  // sheet size
  let mx = 0, my = 0;
  for (const s of doc.symbols) { const b = symbolBox(s, modules); mx = Math.max(mx, b.x + b.w); my = Math.max(my, b.y + b.h); }
  for (const p of doc.ports) { const b = portBox(p); mx = Math.max(mx, b.x + b.w); my = Math.max(my, b.y + b.h); }
  for (const w of doc.wires) for (const p of w.points) { mx = Math.max(mx, p.x); my = Math.max(my, p.y); }
  doc.sheet = { w: Math.max(1700, r10(mx + 120)), h: Math.max(1100, r10(my + 120)) };
}

function verifyImport(doc, conns, modules, nk) {
  const nl = netlist(doc, { modules });
  const bad = new Set();
  const owner = new Map();
  conns.forEach((n, k) => {
    const nets = new Set(n.eps.map(e => (e.port ? nl.portNet.get(e.port) : nl.pinNet.get(`${e.sym}/${e.pin}`))));
    if (nets.size !== 1 || nets.has(undefined)) bad.add(k);
    // a named net must keep its name (#225: a signal with a single pin, e.g. an instance's output
    // read by a task only, has no wire: without a label it would be an anonymous net, the signal
    // left undriven)
    else if (!n.name.startsWith('__n') && [...nets][0].auto) bad.add(k);
    for (const x of nets) if (x) { if (owner.has(x) && owner.get(x) !== k) { bad.add(k); bad.add(owner.get(x)); } else owner.set(x, k); }
  });
  return bad;
}

// replace the wires of the given nets by short stubs with net-name labels
function stubNets(doc, conns, which, modules) {
  const cache = new Map();
  if (which.size >= conns.length) { doc.wires = []; doc.labels = []; }
  else {
    const nl = netlist(doc, { modules });
    const badNetObjs = new Set();
    for (const k of which) for (const e of conns[k].eps) { const n = e.port ? nl.portNet.get(e.port) : nl.pinNet.get(`${e.sym}/${e.pin}`); if (n) badNetObjs.add(n); }
    doc.wires = doc.wires.filter(w => !badNetObjs.has(nl.wireNet.get(w.id)));
    doc.labels = doc.labels.filter(l => !badNetObjs.has(nl.labelNet.get(l.id)));
  }
  // occupancy: pins, marker points and existing wire geometry
  const pinPts = new Set();
  for (const s of doc.symbols) for (const p of symbolPins(s, modules)) pinPts.add(key(p.x, p.y));
  for (const p of doc.ports) pinPts.add(key(p.x, p.y));
  const segs = [];
  const endPts = new Set();
  for (const w of doc.wires) { for (let i = 0; i + 1 < w.points.length; i++) segs.push([w.points[i], w.points[i + 1]]); for (const p of w.points) endPts.add(key(p.x, p.y)); }
  const free = (a, b) => {
    if (pinPts.has(key(b.x, b.y)) || endPts.has(key(b.x, b.y))) return false;
    for (const [p, q] of segs) if (onSeg(b, p, q) || onSeg(a, p, q) && !(a.x === p.x && a.y === p.y) && !(a.x === q.x && a.y === q.y)) return false;
    // nothing else may touch the stub
    for (const k of [...pinPts, ...endPts]) {
      if (k === key(a.x, a.y)) continue;
      const [x, y] = k.split(',').map(Number);
      if (onSeg({ x, y }, a, b)) return false;
    }
    return true;
  };
  let wk = doc.wires.reduce((m, w) => Math.max(m, +String(w.id).replace(/\D/g, '') || 0), 0);
  let lk = doc.labels.reduce((m, l) => Math.max(m, +String(l.id).replace(/\D/g, '') || 0), 0);
  const taken = new Set(conns.map(c => c.name));
  for (const k of [...which].sort((a, b) => a - b)) {
    const n = conns[k];
    if (n.name.startsWith('__n')) { let j = 1; while (taken.has(`n_${j}`)) j++; n.name = `n_${j}`; taken.add(n.name); }
    for (const e of n.eps) {
      const p = epPos(doc, e, modules, cache);
      const [dx, dy] = SIDE_V[p.side] || [-1, 0];
      let q = null;
      for (const len of [30, 40, 20, 50, 60, 70, 80, 100]) {
        const c = { x: p.x + dx * len, y: p.y + dy * len };
        if (free(p, c)) { q = c; break; }
      }
      if (!q) q = { x: p.x + dx * 30, y: p.y + dy * 30 };
      doc.wires.push({ id: `W${++wk}`, points: [{ x: p.x, y: p.y }, q], ...(n.width > 1 ? { bus: true } : {}) });
      segs.push([{ x: p.x, y: p.y }, q]); endPts.add(key(q.x, q.y)); endPts.add(key(p.x, p.y));
      if (!e.port || nk2(doc, e.port) !== n.name) doc.labels.push({ id: `L${++lk}`, x: q.x, y: q.y, net: n.name });
    }
  }
}
function nk2(doc, portId) { return doc.ports.find(p => p.id === portId)?.name; }

function columnLayout(doc, conns, modules) {
  // longest-path layering from drivers to sinks
  const succ = new Map(), pred = new Map();
  const nodeOf = ep => (ep.port ? ep.port : ep.sym);
  for (const n of conns) {
    const src = n.drivers[0];
    if (!src) continue;
    for (const e of n.eps) if (e !== src && nodeOf(e) !== nodeOf(src)) {
      const a = nodeOf(src), b = nodeOf(e);
      if (!succ.has(a)) succ.set(a, new Set()); succ.get(a).add(b);
      if (!pred.has(b)) pred.set(b, new Set()); pred.get(b).add(a);
    }
  }
  const layer = new Map();
  const ids = [...doc.ports.filter(p => p.dir === 'in').map(p => p.id), ...doc.symbols.map(s => s.id)];
  for (const id of ids) layer.set(id, 0);
  for (let it = 0; it < ids.length + 2; it++) {
    let changed = false;
    for (const [a, bs] of succ) for (const b of bs) {
      const la = layer.get(a) ?? 0;
      if (doc.ports.some(p => p.id === b)) continue;
      if ((layer.get(b) ?? 0) < la + 1 && la + 1 <= ids.length) { layer.set(b, la + 1); changed = true; }
    }
    if (!changed) break;
  }
  // cycles may push layers up; compress
  const used = [...new Set(doc.symbols.map(s => layer.get(s.id) ?? 0))].sort((a, b) => a - b);
  const remap = new Map(used.map((l, i) => [l, i + 1]));
  const cols = [];
  for (const s of doc.symbols) { const c = remap.get(layer.get(s.id) ?? 0); (cols[c] ||= []).push(s); }
  let x = 60;
  const inPorts = doc.ports.filter(p => p.dir === 'in'), outPorts = doc.ports.filter(p => p.dir !== 'in');
  const inW = Math.max(60, ...inPorts.map(p => portBox(p).w));
  let y = 60;
  for (const p of inPorts) { p.x = x + inW; p.y = y; y += 60; }
  x += inW + 160;
  for (let c = 1; c < cols.length; c++) {
    const col = cols[c] || [];
    let cy = 60, cw = 0;
    for (const s of col) { const def = symbolDef(s, modules); s.x = snap(x); s.y = snap(cy); cy += def.h + 60; cw = Math.max(cw, def.w); }
    x += cw + 200;
  }
  y = 60;
  for (const p of outPorts) { p.x = snap(x); p.y = y; y += 60; }
}

