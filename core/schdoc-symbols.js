// Silinx schematic symbol library (#405: out of core/schdoc.js): the symbols (gates, flip-flops, multiplexers,
// arithmetic, I/O, module and HDL blocks, the device's primitives), their parameters and local geometry, the I/O
// markers' geometry. Isomorphic (no DOM).
import { DEVICE_PRIMITIVES, primitiveOf } from './primitives.js';
import { parseNetName, r10 } from './schdoc.js';
import { intOr as int } from './util.js';
export { int };   // (core/util.js's intOr)

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
// (INV and BUF wider than a bit: one pin per bit when asked, as the Xilinx INV4 / BUF4, one triangle each, #2067)
const P_GATE_BITS = { name: 'bits', label: 'Pins per bit (I0.., O0..)', kind: 'bool', default: false };
SYMBOLS.inv = { category: 'Logic', title: 'INV', gate: 'not', inputs: 1, description: 'Inverter', params: [P_WIDTH, P_GATE_BITS] };
SYMBOLS.buf = { category: 'Buffers', title: 'BUF', gate: 'buf', inputs: 1, description: 'Buffer', params: [P_WIDTH, P_GATE_BITS] };
// tri-state buffers (Xilinx BUFE / BUFT families): O = I while enabled, Z (released) otherwise, so that
// several of them (and bidirectional pins / I/O markers) may drive one net, a bus; with BUF the category Buffers (#1987)
SYMBOLS.tbuf = {
  // (BUFE and BUFT only in the palette, their Width and Pins per bit making BUFE4, BUFT8…, #326)
  category: 'Buffers', title: 'TBUF', presetsOnly: true,
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
// the multiplexers' body width (#1136: the DEMUX's, 70 px; M16_1's 80, room for its 4 select bits), and where their
// select bits are centred: the middle of the body they had before, 40 px wide for M2_1 / M4_1, 60 for M8_1, 80 for
// M16_1 (k select bits)
export const MUX_OLD_BODY_W = k => Math.max(40, 20 * k);
export const MUX_BODY_W = k => Math.max(70, MUX_OLD_BODY_W(k));
export const MUX_SEL_X = k => 20 + MUX_OLD_BODY_W(k) / 2;
// the bus join (#1910): its bar's middle and its width; before document version 6, 20 and 40
export const JOIN_BAR = 40, JOIN_W = 60, JOIN_OLD_W = 40;
// (INV, BUF, BUFE / BUFT before #1988: 60 wide)
export const BUF_OLD_W = 60;
SYMBOLS.demux = {
  // (one entry, DEMUX, the enable E, the select bits and the select bus its parameters, #313, #334; drawn DEMUX1_4…)
  category: 'Mux', title: 'DEMUX', description: '1:2^n demultiplexer: output O<S> = D, the other outputs 0 (bitwise when Width > 1)',
  params: [P_WIDTH, { name: 'sel', label: 'Select bits', kind: 'int', default: 1, min: 1, max: 4 }, P_EN, P_SELBUS],
};
// (one palette entry each, #324: DECODER as D2_4E, ENCODER as PENC4_2 (a priority encoder by default, #1553); their
// options make D3_8E, ENC8_3…, the Xilinx-style name drawn)
SYMBOLS.decoder = {
  category: 'Decoders/Encoders', title: 'DECODER', description: 'n:2^n binary decoder (one-hot outputs, all 0 when E = 0; like Xilinx D2_4E / D3_8E / D4_16E)',
  params: [{ name: 'n', label: 'Address bits', kind: 'int', default: 2, min: 1, max: 5 },
    { name: 'en', label: 'Enable input E', kind: 'bool', default: true },
    { name: 'bus', label: 'Bus pins (A, D)', kind: 'bool', default: false }],
};
SYMBOLS.encoder = {
  category: 'Decoders/Encoders', title: 'ENCODER', description: '2^n:n binary encoder: priority (highest active input wins) or one-hot (OR of the inputs); V = some input is 1',
  params: [{ name: 'n', label: 'Output bits', kind: 'int', default: 2, min: 2, max: 5 },
    { name: 'mode', label: 'Type', kind: 'select', options: ['priority', 'one-hot'], default: 'priority' },
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
export const arithIo = (t, p) => (t === 'sub' ? { o: 'D', ci: 'BI', co: 'BO', cin: !!p.bin, cout: !!p.bout, op: '-' } : { o: 'S', ci: 'CI', co: 'CO', cin: !!p.cin, cout: !!p.cout, op: '+' });
// the comparisons a COMP makes (#1555): one, its output O ('eq'), or several, an output each, EQ NE LT LE GT GE in
// that order ('eq,gt': op a list, ticked in its properties)
export const COMPARE_OPS = ['eq', 'ne', 'lt', 'le', 'gt', 'ge'];
export const COMPARE_SYM = { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' };
/** A COMP's comparisons, in pin order (['eq'] when it names none). */
export function compareOps(p) {
  const want = new Set(String(p?.op ?? '').toLowerCase().split(/[,\s]+/));
  const ops = COMPARE_OPS.filter(o => want.has(o));
  return ops.length ? ops : ['eq'];
}
/** The output pin of a COMP's comparison op: O when it makes that one only, else EQ, NE… (#1555). */
export const comparePin = (p, op) => (compareOps(p).length > 1 ? op.toUpperCase() : 'O');
SYMBOLS.compare = {
  category: 'Arithmetic', title: 'COMP', description: 'Comparator O = A <op> B, or several comparisons at once (EQ, NE, LT, LE, GT, GE)',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'op', label: 'Comparisons', kind: 'multi', options: COMPARE_OPS, default: 'eq' },
    { name: 'signed', label: 'Signed', kind: 'bool', default: false },
    // (#319: A0.. and B0.., as ADD's)
    { name: 'bits', label: 'Pins per bit (A0.., B0..)', kind: 'bool', default: false }],
};
SYMBOLS.constant = {
  category: 'General', title: 'CONSTANT', description: 'Constant value (decimal, 0x.. hex or 0b.. binary)',
  params: [{ name: 'value', label: 'Value', kind: 'text', default: '0' }, { ...P_WIDTH, default: 1 }],
};
// (a Width of their own, #953; one saved before it, with none, takes the width of its net)
SYMBOLS.vcc = { category: 'General', title: 'VCC', description: 'Logic 1 (all bits)', params: [P_WIDTH] };
SYMBOLS.gnd = { category: 'General', title: 'GND', description: 'Logic 0 (all bits)', params: [P_WIDTH] };
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

export const SYMBOL_CATEGORIES = ['Logic', 'Buffers', 'Arithmetic', 'Flip-Flops', 'Mux', 'Decoders/Encoders', 'Bus', 'General', 'Device Primitives', 'Project modules'];

export function defaultParams(type) {
  const s = SYMBOLS[type];
  const p = {};
  for (const d of s?.params || []) p[d.name] = d.default;
  if (type === 'hdlblock') { p.inputs = [{ name: 'a', width: 1 }]; p.outputs = [{ name: 'y', width: 1 }]; p.title = 'logic'; }
  if (type === 'module') { p.module = ''; p.generics = {}; }
  return p;
}

const widthsOf = s => String(s ?? '').split(/[,\s]+/).map(x => int(x, 0)).filter(x => x > 0);
const chW = 6.2;   // approx char width of 9-11px Arial used for sizing boxes

export function normModules(modules) {
  const out = {};
  if (!modules) return out;
  const list = Array.isArray(modules) ? modules : Object.values(modules);
  for (const m of list) if (m && m.name) out[m.name] = m;
  return out;
}
export function findMod(modules, name) {
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

// The width of a VCC / GND (#953): its Width; null (its net's width) for one saved before it had one
export function constWidth(sym) {
  const w = sym?.params?.width;
  return w == null || w === '' ? null : Math.max(1, int(w, 1));
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
  // (INV, BUF and the tri-state buffers as wide as the 2-input gates, 80: room for a bus width on the output's lead,
  // #1988, they were 60, BUF_OLD_W; BUF's and BUFE / BUFT's triangle 4 grid steps, 40, its type inside it, INV's 34 and
  // its bubble, #2068)
  // (Pins per bit: a row each, I0 / O0 at the top, #2067)
  if (t === 'inv' || t === 'buf') {
    if (W > 1 && p.bits) {
      const pins = [...Array(W).keys()].map(k => ({ name: `I${k}`, dir: 'in', x: 0, y: 10 + 20 * k, side: 'W', width: 1 }));
      for (let k = 0; k < W; k++) pins.push({ name: `O${k}`, dir: 'out', x: 80, y: 10 + 20 * k, side: 'E', width: 1 });
      return { w: 80, h: 20 * W, shape: t, rows: W, body: { x: 20, y: 0, w: t === 'buf' ? 40 : 34, h: 20 * W }, pins };
    }
    return { w: 80, h: 20, shape: t, body: { x: 20, y: 0, w: t === 'buf' ? 40 : 34, h: 20 },
      pins: [{ name: 'I', dir: 'in', x: 0, y: 10, side: 'W', width: W }, { name: 'O', dir: 'out', x: 80, y: 10, side: 'E', width: W }] };
  }
  if (t === 'tbuf') {
    // the enable on the left, one row above the data (as the Xilinx BUFE / BUFT symbols); one triangle per
    // bit when the bits have their own pins (BUFE4 / BUFT4), the enable line joining their top edges
    const en = p.enable === 'T' ? 'T' : 'E', bits = W > 1 && !!p.bits, n = bits ? W : 1;
    const pins = [{ name: en, dir: 'in', x: 0, y: 10, side: 'W', width: 1 }];
    for (let k = 0; k < n; k++) pins.push({ name: bits ? `I${k}` : 'I', dir: 'in', x: 0, y: 30 + 20 * k, side: 'W', width: bits ? 1 : W });
    for (let k = 0; k < n; k++) pins.push({ name: bits ? `O${k}` : 'O', dir: 'out', x: 80, y: 30 + 20 * k, side: 'E', width: bits ? 1 : W, tri: true });
    const title = `BUF${en}${W > 1 ? W : ''}`;
    return { w: 80, h: 20 + 20 * n, shape: 'tbuf', activeLow: en === 'T', rows: n, title, body: { x: 20, y: 20, w: 40, h: 20 * n }, pins };
  }
  // the select pins at the bottom, the most significant on the left, 20 apart around cx (#301): one bus pin S
  // (selBus) or S<k-1> … S0
  const selPins = (k, cx, h) => (k === 1 ? [{ name: 'S0', dir: 'in', x: cx, y: h, side: 'S', width: 1 }]
    : p.selBus ? [{ name: 'S', dir: 'in', x: cx, y: h, side: 'S', width: k }]
      : [...Array(k).keys()].map(i => ({ name: `S${k - 1 - i}`, dir: 'in', x: cx - 10 * (k - 1) + 20 * i, y: h, side: 'S', width: 1 })));
  if (MUX_INPUTS[t]) {
    // (the enable E: a data row more, on the left below the data inputs, as the Xilinx M2_1E … M16_1E)
    // (the body 70 px wide, as the DEMUX's, #1136, M16_1's 80; the select bits, 20 apart, where they were on the narrower body
    // of before, MUX_SEL_X, so that a schematic of before keeps them: only its output moves, schdoc-upgrade.js)
    const n = MUX_INPUTS[t], k = Math.log2(n), en = !!p.en, bh = n * 20 + 20 + (en ? 20 : 0), h = bh + 10, bw = MUX_BODY_W(k);
    const pins = [];
    for (let i = 0; i < n; i++) pins.push({ name: `D${i}`, dir: 'in', x: 0, y: 20 + 20 * i, side: 'W', width: W });
    if (en) pins.push({ name: 'E', dir: 'in', x: 0, y: 20 + 20 * n, side: 'W', width: 1 });
    pins.push(...selPins(k, MUX_SEL_X(k), h));
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
  const cmp = t === 'compare' ? compareOps(p) : null;
  if (cmp && ((p.bits && W > 1) || cmp.length > 1)) {
    // (#319) a box: A0.. B0.. (or A, B) on the left, O on the right, its relation in its name; several comparisons
    // (#1555): an output each, EQ … GE
    const west = [];
    if (p.bits && W > 1) for (const g of ['A', 'B']) for (let i = 0; i < W; i++) west.push({ name: `${g}${i}`, dir: 'in', width: 1 });
    else for (const g of ['A', 'B']) west.push({ name: g, dir: 'in', width: W });
    const east = cmp.length > 1 ? cmp.map(o => ({ name: o.toUpperCase(), dir: 'out', width: 1 })) : [{ name: 'O', dir: 'out', width: 1 }];
    const title = `COMP${W}${cmp.length > 1 ? '' : ` ${COMPARE_SYM[cmp[0]]}`}`;
    return { ...boxDef(west, east, title, 80, 40), shape: 'lib', title };
  }
  if (t === 'add' || t === 'sub' || t === 'compare') {
    const h = t === 'compare' ? 40 : 60;
    const pins = [{ name: 'A', dir: 'in', x: 0, y: 10, side: 'W', width: W }, { name: 'B', dir: 'in', x: 0, y: 30, side: 'W', width: W }];
    const io = t === 'compare' ? null : arithIo(t, p);
    if (io?.cin) pins.push({ name: io.ci, dir: 'in', x: 0, y: 50, side: 'W', width: 1 });
    if (t === 'compare') pins.push({ name: 'O', dir: 'out', x: 80, y: 20, side: 'E', width: 1 });
    else pins.push({ name: io.o, dir: 'out', x: 80, y: 30, side: 'E', width: W });
    if (io?.cout) pins.push({ name: io.co, dir: 'out', x: 80, y: 50, side: 'E', width: 1 });
    const op = t === 'add' ? '+' : t === 'sub' ? '−' : COMPARE_SYM[cmp[0]];
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
    // (drawn as ISE's, #1726: its input on the bus, a diagonal entry from it down to its output's line)
    return { w: 40, h: 20, shape: 'slice', text: msb === lsb ? `(${msb})` : `(${msb}:${lsb})`, body: { x: 0, y: 0, w: 10, h: 10 },
      pins: [{ name: 'I', dir: 'in', x: 0, y: 0, side: 'W', width: p.inWidth ? int(p.inWidth, null) : null },
        { name: 'O', dir: 'out', x: 40, y: 10, side: 'E', width: Math.abs(msb - lsb) + 1 }] };
  }
  if (t === 'busjoin') {
    const ws = widthsOf(p.widths);
    const n = Math.max(1, ws.length), h = n * 20;
    const pins = ws.map((w, i) => ({ name: `I${i}`, dir: 'in', x: 0, y: 10 + 20 * i, side: 'W', width: w }));
    // (its inputs' leads long enough for their bits' labels, (15:8), #1910: its bar at JOIN_BAR, its output at JOIN_W)
    pins.push({ name: 'O', dir: 'out', x: JOIN_W, y: h / 2, side: 'E', width: ws.reduce((a, b) => a + b, 0) || null });
    return { w: JOIN_W, h, shape: 'join', body: { x: JOIN_BAR - 2, y: 0, w: 4, h }, pins };
  }
  if (t === 'constant') {
    const txt = String(p.value ?? '0');
    const w = r10(Math.max(40, txt.length * 7 + 24));
    return { w, h: 20, shape: 'const', text: txt, body: { x: 0, y: 0, w: w - 20, h: 20 },
      pins: [{ name: 'O', dir: 'out', x: w, y: 10, side: 'E', width: W }] };
  }
  if (t === 'vcc' || t === 'gnd') {
    const cw = constWidth(sym);
    return t === 'vcc' ? { w: 20, h: 30, shape: 'vcc', body: { x: 0, y: 0, w: 20, h: 10 }, pins: [{ name: 'P', dir: 'out', x: 10, y: 30, side: 'S', width: cw }] }
      : { w: 20, h: 30, shape: 'gnd', body: { x: 0, y: 20, w: 20, h: 10 }, pins: [{ name: 'G', dir: 'out', x: 10, y: 0, side: 'N', width: cw }] };
  }
  if (t === 'module') {
    const m = findMod(modules, p.module);
    // (its pins the ports it was placed with, not its module's as they are now: a change of the module moves no pin
    // under its wires, #1183, core/schdoc-modsym.js; their widths the module's, unless its generics are overridden)
    let ports = Array.isArray(p.ports) ? p.ports : m ? m.ports : [];
    const snapW = new Map((p.ports || []).map(q => [String(q.name).toLowerCase(), q.width]));
    const theirs = new Map((m?.ports || []).map(q => [String(q.name).toLowerCase(), q]));
    const overridden = p.generics && Object.keys(p.generics).length > 0;
    ports = ports.map(q => {
      const k = String(q.name).toLowerCase(), t = theirs.get(k);
      return { name: q.name, dir: q.dir || 'in', width: (overridden && snapW.has(k)) ? snapW.get(k) : ((t ? t.width : q.width) ?? 1), type: t ? t.type : q.type };
    });
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

export const ROT_OK = new Set([0, 90, 180, 270]);
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
export const SIDE_V = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
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
