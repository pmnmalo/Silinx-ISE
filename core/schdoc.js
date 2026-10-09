// Silinx schematic documents (<name>.sch.json): model, symbol library, connectivity,
// HDL generation and HDL -> schematic import. Isomorphic (no DOM).
//
//   import { SYMBOLS, newDoc, normalizeDoc, symbolDef, symbolPins, netlist, generateHdl,
//            schematicFromHdl, modulesFromLibrary } from '/core/schdoc.js';
//
// Document format (version 1, all coordinates in sheet pixels on a GRID = 10 px grid):
//   { version: 1, name, lang: 'vhdl'|'verilog', sheet: { w, h },
//     symbols: [{ id, type, x, y, rot: 0|90|180|270, mirror: bool, name, params: {...}, hdl?: string }],
//     wires:   [{ id, points: [{x,y},...], bus?: bool }],
//     labels:  [{ id, x, y, net }],          // net name attached to the wire point (x,y)
//     ports:   [{ id, name, dir: 'in'|'out'|'inout', width, x, y, type? }],   // I/O markers
//     hdl?:    { lang, context, generics: [{ name, type, default }], decls, arch },  // verbatim HDL
//     generatedFile?: 'src/name.vhd',
//     description?: 'text' }                // shown on the sheet, a comment in the generated HDL
//
// (x, y) of a symbol is the top-left corner of its (rotated) bounding box; rotation is clockwise.
// Connectivity is purely geometric: a pin connects to a wire whose end point or vertex lies on it,
// a wire end point lying on another wire's segment makes a T-junction, labels (and I/O markers)
// with the same name join their nets.
import { parse as parseVhdl } from './vhdl/parser.js';
import { parse as parseVerilog } from './verilog/parser.js';
import { clocksOf } from './schematic.js';
import { elaborate } from './elaborate.js';

export const GRID = 10;
export const DOC_VERSION = 1;

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
// gates, each followed by its inverted-input variants (Xilinx ANDnBk...: inputs I0..I(k-1) inverted)
for (const [op, ns, inv] of [['and', [2, 3, 4, 5], true], ['or', [2, 3, 4, 5], true], ['nand', [2, 3, 4], true], ['nor', [2, 3, 4], true], ['xor', [2]], ['xnor', [2]]])
  for (const n of ns) {
    SYMBOLS[`${op}${n}`] = gateSym(op, n, `${op.toUpperCase()}${n}`);
    if (inv) for (let k = 1; k <= n; k++) {
      SYMBOLS[`${op}${n}b${k}`] = {
        ...gateSym(op, n, `${op.toUpperCase()}${n}B${k}`), invIn: k,
        description: `${n}-input ${op.toUpperCase()} gate with ${k === 1 ? 'input I0' : k === 2 ? 'inputs I0 and I1' : `inputs I0..I${k - 1}`} inverted (bitwise when Width > 1)`,
      };
    }
  }
SYMBOLS.inv = { category: 'Logic', title: 'INV', gate: 'not', inputs: 1, description: 'Inverter', params: [P_WIDTH] };
SYMBOLS.buf = { category: 'Logic', title: 'BUF', gate: 'buf', inputs: 1, description: 'Buffer', params: [P_WIDTH] };
SYMBOLS.mux2 = { category: 'Mux', title: 'M2_1', description: '2:1 multiplexer (O = S0 ? D1 : D0)', params: [P_WIDTH] };
SYMBOLS.mux4 = { category: 'Mux', title: 'M4_1', description: '4:1 multiplexer (2-bit select S)', params: [P_WIDTH] };
SYMBOLS.demux = {
  category: 'Mux', title: 'DEMUX', description: '1:2^n demultiplexer: output O<S> = D, the other outputs 0 (bitwise when Width > 1)',
  params: [P_WIDTH, { name: 'sel', label: 'Select bits', kind: 'int', default: 1, min: 1, max: 4 }],
  presets: [1, 2, 3].map(k => ({ title: `DEMUX1_${1 << k}`, params: { sel: k }, description: `1:${1 << k} demultiplexer (${k === 1 ? 'select S0' : `${k}-bit select S`}): O<S> = D, the other outputs 0 (bitwise when Width > 1)` })),
};
SYMBOLS.decoder = {
  category: 'Decoders/Encoders', title: 'DECODER', description: 'n:2^n binary decoder (one-hot outputs, all 0 when E = 0; like Xilinx D2_4E / D3_8E / D4_16E)',
  params: [{ name: 'n', label: 'Address bits', kind: 'int', default: 2, min: 1, max: 5 },
    { name: 'en', label: 'Enable input E', kind: 'bool', default: true },
    { name: 'bus', label: 'Bus pins (A, D)', kind: 'bool', default: false }],
  presets: [2, 3, 4].map(k => ({ title: `D${k}_${1 << k}E`, params: { n: k }, description: `${k}:${1 << k} decoder with enable (Xilinx D${k}_${1 << k}E): D<A> = E, the other outputs 0` })),
};
SYMBOLS.encoder = {
  category: 'Decoders/Encoders', title: 'ENCODER', description: '2^n:n binary encoder: priority (highest active input wins) or one-hot (OR of the inputs); V = some input is 1',
  params: [{ name: 'n', label: 'Output bits', kind: 'int', default: 2, min: 2, max: 5 },
    { name: 'mode', label: 'Type', kind: 'select', options: ['priority', 'one-hot'], default: 'priority' },
    { name: 'bus', label: 'Bus pins (I, A)', kind: 'bool', default: false }],
  presets: [2, 3, 4].flatMap(k => [
    { title: `PENC${1 << k}_${k}`, params: { n: k }, description: `${1 << k}:${k} priority encoder: A = index of the highest input at 1 (0 when none), V = some input is 1` },
    { title: `ENC${1 << k}_${k}`, params: { n: k, mode: 'one-hot' }, description: `${1 << k}:${k} one-hot encoder: A = OR of the indices of the inputs at 1, V = some input is 1` },
  ]),
};
SYMBOLS.add = {
  category: 'Arithmetic', title: 'ADD', description: 'Adder S = A + B (+ CI), optional carry out',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'cin', label: 'Carry in', kind: 'bool', default: false }, { name: 'cout', label: 'Carry out', kind: 'bool', default: false }],
};
SYMBOLS.sub = { category: 'Arithmetic', title: 'SUB', description: 'Subtractor D = A - B', params: [{ ...P_WIDTH, default: 8 }] };
SYMBOLS.compare = {
  category: 'Arithmetic', title: 'COMP', description: 'Comparator O = A <op> B',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'op', label: 'Operation', kind: 'select', options: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'], default: 'eq' },
    { name: 'signed', label: 'Signed', kind: 'bool', default: false }],
};
SYMBOLS.constant = {
  category: 'I/O', title: 'CONSTANT', description: 'Constant value (decimal, 0x.. hex or 0b.. binary)',
  params: [{ name: 'value', label: 'Value', kind: 'text', default: '0' }, { ...P_WIDTH, default: 1 }],
};
SYMBOLS.vcc = { category: 'I/O', title: 'VCC', description: 'Logic 1 (all bits)', params: [] };
SYMBOLS.gnd = { category: 'I/O', title: 'GND', description: 'Logic 0 (all bits)', params: [] };
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
  return { category: 'Flip-Flops', title: title || name.toUpperCase(), ff: { k, ...f }, description: desc[0].toUpperCase() + desc.slice(1), params: [{ ...P_INIT, default: init }] };
}
for (const [k, pfx, list] of [
  ['d', 'fd', ['', 'c', 'ce', 'cp', 'cpe', 'e', 'p', 'pe', 'r', 're', 'rs', 'rse', 's', 'se']],
  ['t', 'ft', ['', 'c', 'ce', 'cp', 'cpe', 'p', 'pe', 'rse', 'sre']],
  ['jk', 'fjk', ['', 'c', 'ce', 'cp', 'cpe', 'p', 'pe', 'rse', 'sre']],
]) for (const x of list) {
  const f = { ce: x.endsWith('e') && x !== '', clr: x[0] === 'c', pre: /^c?p/.test(x), r: /^r|^sr/.test(x), s: /^s|^rs/.test(x), sp: /^sr/.test(x) };
  for (const q of Object.keys(f)) if (!f[q]) delete f[q];
  SYMBOLS[pfx + x] = ffSym(pfx + x, k, f);
}
SYMBOLS.register = {
  category: 'Flip-Flops', title: 'REG', description: 'N-bit register',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'en', label: 'Clock enable', kind: 'bool', default: true },
    { name: 'reset', label: 'Reset', kind: 'select', options: ['none', 'async', 'sync'], default: 'async' },
    { name: 'init', label: 'Reset/INIT value', kind: 'text', default: '0' }],
};
SYMBOLS.counter = {
  category: 'Arithmetic', title: 'CNT', description: 'N-bit binary counter',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'en', label: 'Clock enable', kind: 'bool', default: true },
    { name: 'reset', label: 'Reset', kind: 'select', options: ['none', 'async', 'sync'], default: 'async' },
    { name: 'dir', label: 'Direction', kind: 'select', options: ['up', 'down'], default: 'up' }],
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

export const SYMBOL_CATEGORIES = ['Logic', 'Arithmetic', 'Flip-Flops', 'Mux', 'Decoders/Encoders', 'Bus', 'I/O', 'Project modules'];

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
  if (t === 'mux2' || t === 'mux4') {
    const n = t === 'mux2' ? 2 : 4, bh = n * 20 + 20, h = bh + 10;
    const pins = [];
    for (let i = 0; i < n; i++) pins.push({ name: `D${i}`, dir: 'in', x: 0, y: 20 + 20 * i, side: 'W', width: W });
    pins.push(n === 2 ? { name: 'S0', dir: 'in', x: 40, y: h, side: 'S', width: 1 } : { name: 'S', dir: 'in', x: 40, y: h, side: 'S', width: 2 });
    pins.push({ name: 'O', dir: 'out', x: 80, y: bh / 2, side: 'E', width: W });
    return { w: 80, h, shape: 'mux', body: { x: 20, y: 0, w: 40, h: bh }, pins };
  }
  if (t === 'demux') {
    // trapezoid wide on the output side (mirror of M2_1/M4_1), 70 px wide so that the pin names fit inside
    const k = Math.max(1, Math.min(4, int(p.sel, 1))), n = 1 << k, bh = n * 20 + 40, h = bh + 10;   // a free row at the bottom for S
    const pins = [{ name: 'D', dir: 'in', x: 0, y: bh / 2, side: 'W', width: W }];
    pins.push(k === 1 ? { name: 'S0', dir: 'in', x: 60, y: h, side: 'S', width: 1 } : { name: 'S', dir: 'in', x: 60, y: h, side: 'S', width: k });
    for (let i = 0; i < n; i++) pins.push({ name: `O${i}`, dir: 'out', x: 110, y: 20 + 20 * i, side: 'E', width: W });
    return { w: 110, h, shape: 'demux', title: `DEMUX1_${n}`, body: { x: 20, y: 0, w: 70, h: bh }, pins };
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
  if (t === 'add' || t === 'sub' || t === 'compare') {
    const h = t === 'compare' ? 40 : 60;
    const pins = [{ name: 'A', dir: 'in', x: 0, y: 10, side: 'W', width: W }, { name: 'B', dir: 'in', x: 0, y: 30, side: 'W', width: W }];
    if (t === 'add' && p.cin) pins.push({ name: 'CI', dir: 'in', x: 0, y: 50, side: 'W', width: 1 });
    if (t === 'compare') pins.push({ name: 'O', dir: 'out', x: 80, y: 20, side: 'E', width: 1 });
    else pins.push({ name: t === 'add' ? 'S' : 'D', dir: 'out', x: 80, y: 30, side: 'E', width: W });
    if (t === 'add' && p.cout) pins.push({ name: 'CO', dir: 'out', x: 80, y: 50, side: 'E', width: 1 });
    const op = t === 'add' ? '+' : t === 'sub' ? '−' : ({ eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }[p.op] || '?');
    return { w: 80, h, shape: 'arith', op, body: { x: 20, y: 0, w: 40, h }, pins };
  }
  if (S && (S.ff || t === 'register' || t === 'counter')) {
    let ce, clr, pre, r, st, west = [];
    const f = S.ff;
    if (f) ({ ce, clr, pre, r, s: st } = f);
    else { ce = !!p.en; clr = p.reset === 'async'; r = p.reset === 'sync'; }
    const bw = f ? 1 : W;
    // ISE order: PRE / S on top, data, CE, C, CLR / R at the bottom; Q level with the (first) data input
    if (pre) west.push({ name: 'PRE', dir: 'in', width: 1 });
    if (st) west.push({ name: 'S', dir: 'in', width: 1 });
    const q0 = west.length;
    if (f?.k === 't') west.push({ name: 'T', dir: 'in', width: 1 });
    else if (f?.k === 'jk') west.push({ name: 'J', dir: 'in', width: 1 }, { name: 'K', dir: 'in', width: 1 });
    else if (t !== 'counter') west.push({ name: 'D', dir: 'in', width: bw });
    if (ce) west.push({ name: 'CE', dir: 'in', width: 1 });
    west.push({ name: 'C', dir: 'in', width: 1, clock: true });
    if (clr) west.push({ name: 'CLR', dir: 'in', width: 1 });
    if (r) west.push({ name: 'R', dir: 'in', width: 1 });
    const h = Math.max(40, west.length * 20 + 10);   // bottom margin: the type name sits under the last pin name
    const pins = west.map((q, i) => ({ ...q, x: 0, y: 10 + 20 * i, side: 'W' }));
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

// I/O marker geometry: the connection point is (x, y); the body extends to the left (inputs)
// or to the right (outputs/bidirectional).
export function portBox(port) {
  const tw = Math.max(20, String(port.name || '').length * 7.5);
  const w = r10(tw + 34);
  return port.dir === 'in' ? { x: port.x - w, y: port.y - 10, w, h: 20 } : { x: port.x, y: port.y - 10, w, h: 20 };
}

// ===================================================================== documents
export function newDoc(name = 'schematic', lang = 'vhdl') {
  return { version: DOC_VERSION, name, lang, sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [], ports: [] };
}

export function normalizeDoc(d) {
  const doc = d && typeof d === 'object' ? clone(d) : newDoc();
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
    uid(o, 'P'); return o;
  });
  // names for symbols without one
  const names = new Set(doc.symbols.map(s => s.name).filter(Boolean));
  let k = 0;
  for (const s of doc.symbols) if (!s.name) { do k++; while (names.has(`U${k}`)); s.name = `U${k}`; names.add(s.name); }
  if (doc.hdl && typeof doc.hdl !== 'object') delete doc.hdl;
  delete doc.importDiagnostics;
  return doc;
}

// ISE style bus names: "data(7:0)" / "data[7:0]" -> { base: 'data', width: 8 }
export function parseNetName(s) {
  const m = /^\s*([A-Za-z_][\w$]*)\s*(?:[([]\s*(\d+)\s*(?::|downto|to)\s*(\d+)\s*[)\]])?\s*$/i.exec(String(s ?? ''));
  if (!m) return { base: String(s ?? '').trim(), width: null, bad: true };
  return { base: m[1], width: m[2] != null ? Math.abs(+m[2] - +m[3]) + 1 : null };
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
  const doc = docIn && docIn.version ? docIn : normalizeDoc(docIn);
  modules = normModules(modules);
  const ci = doc.lang === 'vhdl';
  const nk = s => (ci ? String(s).toLowerCase() : String(s));
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
      pinInfo.set(id, { kind: 'pin', sym: s.id, pin: p.name, dir: p.dir, width: p.width, x: p.x, y: p.y });
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
  // wires: every vertex touches the wire
  const hseg = new Map(), vseg = new Map(), oseg = [];
  for (const w of doc.wires) {
    const id = `w:${w.id}`;
    dsu.find(id);
    w.points.forEach(pt => addAt(pt.x, pt.y, id));
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
  // T-junctions: wire end points (and I/O marker points) on another wire's segment
  const tjunction = [];
  for (const w of doc.wires) {
    for (const pt of [w.points[0], w.points[w.points.length - 1]]) {
      for (const s of segsAt(pt)) if (s.id !== `w:${w.id}`) { dsu.union(`w:${w.id}`, s.id); tjunction.push(pt); }
    }
  }
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
    // drivers
    const outs = eps.filter(e => e.dir === 'out' && e.kind === 'pin');
    const ins = eps.filter(e => e.kind === 'port' && e.dir === 'in');
    if (outs.length + ins.length > 1)
      diags.push({ severity: 'error', message: `net '${net.name}' has ${outs.length + ins.length} drivers (${[...outs, ...ins].map(e => epName(e, symById, doc)).join(', ')})`, ref: refOf(outs[0] || ins[0], symById), x: (outs[0] || ins[0]).x, y: (outs[0] || ins[0]).y, net: net.name });
    const sinks = eps.filter(e => (e.kind === 'pin' && e.dir !== 'out') || (e.kind === 'port' && e.dir !== 'in'));
    const inouts = eps.filter(e => e.dir === 'inout');
    const isolated = eps.length === 1 && !wires.length && !labels.length;
    if (!drv.length && sinks.length && !inouts.length && !isolated)
      diags.push({ severity: 'warning', message: `net '${net.name}' has no driver (read by ${sinks.map(e => epName(e, symById, doc)).join(', ')})`, ref: refOf(sinks[0], symById), x: sinks[0].x, y: sinks[0].y, net: net.name });
    if (!eps.length) diags.push({ severity: 'warning', message: `dangling wire${wires.length > 1 ? 's' : ''}${labels.length ? ` (net '${net.name}')` : ''} not connected to any pin`, ref: { kind: 'wire', id: wires[0] || '' }, x: pt?.x, y: pt?.y, net: net.name });
    else if (eps.length === 1 && (wires.length || labels.length) && !(labels.length && byNameCount(labels, labelOf, nk) > 0)) {
      const e = eps[0];
      if (e.kind === 'pin' || !wires.length) diags.push({ severity: 'warning', message: `net '${net.name}' connects only ${epName(e, symById, doc)}`, ref: refOf(e, symById), x: e.x, y: e.y, net: net.name });
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
      if (alone && p.dir !== 'out') {
        const pp = symbolPins(s, modules, defs.get(s.id)).find(q => q.name === p.name);
        diags.push({ severity: s.type === 'module' ? 'warning' : 'warning', message: `input pin ${p.name} of ${s.name} (${s.type === 'module' ? s.params.module : s.type}) is not connected`, ref: { kind: 'symbol', id: s.id, pin: p.name }, x: pp.x, y: pp.y });
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

// Junction dots: points where three or more wire branches meet.
function junctionsOf(doc) {
  const arms = new Map();
  const add = (pt, n) => { const k = key(pt.x, pt.y); arms.set(k, (arms.get(k) || 0) + n); };
  const H = new Map(), Vv = new Map();
  const ends = [];
  for (const w of doc.wires) {
    const P = w.points;
    add(P[0], 1); add(P[P.length - 1], 1);
    for (let i = 1; i < P.length - 1; i++) add(P[i], 2);
    ends.push(P[0], P[P.length - 1]);
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      if (a.y === b.y) { let l = H.get(a.y); if (!l) H.set(a.y, l = []); l.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]); }
      else if (a.x === b.x) { let l = Vv.get(a.x); if (!l) Vv.set(a.x, l = []); l.push([Math.min(a.y, b.y), Math.max(a.y, b.y)]); }
    }
  }
  for (const pt of ends) {
    for (const [lo, hi] of H.get(pt.y) || []) if (pt.x > lo && pt.x < hi) add(pt, 2);
    for (const [lo, hi] of Vv.get(pt.x) || []) if (pt.y > lo && pt.y < hi) add(pt, 2);
  }
  const out = [];
  for (const [k, n] of arms) if (n >= 3) { const [x, y] = k.split(',').map(Number); out.push({ x, y }); }
  return out;
}

// ===================================================================== HDL text helpers
const VHDL_RESERVED = new Set(('abs access after alias all and architecture array assert attribute begin block body buffer bus case component configuration constant disconnect downto else elsif end entity exit file for function generate generic group guarded if impure in inertial inout is label library linkage literal loop map mod nand new next nor not null of on open or others out package port postponed procedure process pure range record register reject rem report return rol ror select severity signal shared sla sll sra srl subtype then to transport type unaffected units until use variable wait when while with xnor xor').split(' '));
const VLOG_RESERVED = new Set(('always and assign begin buf case casex casez default defparam else end endcase endfunction endmodule endtask for forever function if initial inout input integer module nand negedge nor not or output parameter posedge reg repeat signed task while wire xnor xor localparam genvar generate endgenerate logic').split(' '));
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
function tokenize(text, lang) {
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
  const name = validIdent(doc.name, lang) ? doc.name : doc.name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z])/, 'x$1').replace(/_+/g, '_').replace(/_$/, '');
  if (name !== doc.name) diags.push({ severity: 'warning', message: `module name '${doc.name}' is not a valid identifier, using '${name}'`, ref: { kind: 'sheet' } });

  // ports
  const portOf = new Map();       // net -> port
  const ports = [];
  for (const p of doc.ports) {
    const net = nl.portNet.get(p.id);
    if (!validIdent(p.name, lang)) diags.push({ severity: 'error', message: `I/O marker name '${p.name}' is not a valid ${lang.toUpperCase()} identifier`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y });
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
    if (d?.type) return d.type;
    return pinType.get(net) || vtype(net.width);
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

  const syms = doc.symbols;
  for (const s of syms) {
    const def = defs.get(s.id);
    const p = s.params;
    const S = SYMBOLS[s.type];
    const cmt = ci ? `-- ${s.name}: ${def.title || S?.title || s.type}` : `// ${s.name}: ${def.title || S?.title || s.type}`;
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
        else if (g === 'nand' || g === 'nor' || g === 'xnor') rhs = ins.length === 2 && g === 'xnor' ? `${ins[0]} xnor ${ins[1]}` : `not (${ins.join(` ${g.slice(1)} `)})`;
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
      // single-bit library flip-flops (FD*, FT*, FJK*): async CLR > PRE, then at the clock edge
      // R / S (in the order of the symbol), then CE, then the D / toggle / J-K update
      const f = S.ff;
      const qo = OUTN(s, 'Q');
      if (!qo) { diags.push({ severity: 'warning', message: `${s.name}: output Q not connected, skipped`, ref: { kind: 'symbol', id: s.id } }); continue; }
      const qn = nl.pinNet.get(`${s.id}/Q`);
      const iv = String(p.init ?? S.params[0].default) === '1' ? '1' : '0';
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
      if (ci && f.k !== 'd') { q = fresh(`${s.name}_q`); extra.push({ name: q, type: 'std_logic', init: iv }); }
      const B = v => (ci ? `'${v}'` : `1'b${v}`);
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
      if (qn) init.set(qn, iv);
      body.push(lines.join('\n'));
      continue;
    }
    switch (s.type) {
      case 'mux2': case 'mux4': {
        const o = OUTN(s, 'O'); if (!o) continue;
        if (s.type === 'mux2') {
          const d0 = INN(s, 'D0'), d1 = INN(s, 'D1'), sel = INN(s, 'S0');
          if (ci) body.push(`${o} <= ${d1} when ${sel} = '1' else ${d0};`); else assign(o, `${sel} ? ${d1} : ${d0}`);
        } else {
          const d = [0, 1, 2, 3].map(i => INN(s, `D${i}`)), sel = INN(s, 'S', true);
          if (ci) body.push(`with ${sel} select ${o} <=\n  ${d[0]} when "00",\n  ${d[1]} when "01",\n  ${d[2]} when "10",\n  ${d[3]} when others;`);
          else assign(o, `${sel}[1] ? (${sel}[0] ? ${d[3]} : ${d[2]}) : (${sel}[0] ? ${d[1]} : ${d[0]})`);
        }
        break;
      }
      case 'demux': {
        const k = Math.max(1, Math.min(4, int(p.sel, 1))), n = 1 << k;
        const dn = inNet(s, 'D');
        const sp = k === 1 ? 'S0' : 'S', sn = inNet(s, sp);
        if (!dn) warnOpen(s, 'D');
        if (!sn) warnOpen(s, sp);
        const d = dn ? (outRead.get(dn) || netName(dn)) : null, sel = sn ? (outRead.get(sn) || netName(sn)) : null;
        const lines = [];
        for (let i = 0; i < n; i++) {
          const o = OUTN(s, `O${i}`); if (!o) continue;
          const w = PW(s, `O${i}`);
          const z = zero(w);
          let rhs;
          if (!d || (!sel && i)) rhs = z;
          else if (!sel) rhs = d;
          else if (ci) rhs = `${d} when ${sel} = ${k === 1 ? `'${i}'` : `"${i.toString(2).padStart(k, '0')}"`} else ${z}`;
          else rhs = `(${sel} == ${k}'d${i}) ? ${d} : ${z}`;
          lines.push(ci ? `${o} <= ${rhs};` : `assign ${o} = ${rhs};`);
        }
        if (lines.length) body.push([cmt, ...lines].join('\n'));
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
        const oname = s.type === 'add' ? 'S' : 'D';
        const o = OUTN(s, oname), co = s.type === 'add' && p.cout ? OUTN(s, 'CO') : null;
        if (!o && !co) continue;
        const a = INN(s, 'A'), b = INN(s, 'B');
        const w = Math.max(1, int(p.width, 1));
        const cin = s.type === 'add' && p.cin ? INN(s, 'CI') : null;
        const op = s.type === 'add' ? '+' : '-';
        if (ci) {
          // a 1-bit operand is a std_logic: unsigned'(0 => x) makes it a 1-bit vector
          const U = x => (w === 1 ? `unsigned'(0 => ${x})` : `unsigned(${x})`);
          if (!co && !cin) {
            if (o) body.push(w === 1 ? `${o} <= ${a} xor ${b};` : `${o} <= ${wrapV(`unsigned(${a}) ${op} unsigned(${b})`, clsOf(o))};`);
          } else {
            const t = fresh(`${s.name}_sum`);
            extra.push({ name: t, type: `unsigned(${w} downto 0)` });
            const base = `resize(${U(a)}, ${w + 1}) ${op} resize(${U(b)}, ${w + 1})`;
            body.push(cin ? `${t} <= ${base} + 1 when ${cin} = '1' else ${base};` : `${t} <= ${base};`);
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
        const a = INN(s, 'A'), b = INN(s, 'B');
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
        const q = OUTN(s, 'Q');
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
        const qn = nl.pinNet.get(`${s.id}/Q`);
        const w = qn.width;
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
          if (s.type === 'counter') lines.push(`${q} <= ${wrapV(tgt, clsOf(q))};`);
          body.push(lines.join('\n'));
        } else {
          const nextv = s.type === 'counter' ? `${q} ${p.dir === 'down' ? '-' : '+'} 1'b1` : d;
          const rz = vlogBits(rv);
          const lines = [cmt];
          if (clr) lines.push(`always @(posedge ${c} or posedge ${clr})`, `  if (${clr}) ${q} <= ${rz};`, `  else${ce ? ` if (${ce})` : ''} ${q} <= ${nextv};`);
          else if (r) lines.push(`always @(posedge ${c})`, `  if (${r}) ${q} <= ${rz};`, `  else${ce ? ` if (${ce})` : ''} ${q} <= ${nextv};`);
          else lines.push(`always @(posedge ${c})`, `  ${ce ? `if (${ce}) ` : ''}${q} <= ${nextv};`);
          if (s.type === 'counter') init.set(qn, rv);
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
  const stmts = body.map(b => indent(b, '  ')).join('\n\n');
  let code;
  const generics = verbatimOK ? (hdl.generics || []) : [];
  if (ci) {
    const ctx = verbatimOK && hdl.context ? String(hdl.context).trim() : 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;';
    const arch = (verbatimOK && hdl.arch) || 'schematic';
    // an output driven directly by a flip-flop / register starts at its INIT value (port default)
    const plist = ports.map(p => {
      const ty = p.type && verbatimOK ? p.type : vtype(p.width);
      const iv = p.dir === 'out' && p.net && regNets.has(p.net) && !outRead.has(p.net) ? init.get(p.net) : null;
      return `${p.name} : ${p.dir} ${ty}${iv ? ` := ${vhdlClass(ty) === 'sl' ? vhdlBits(iv, true) : vhdlBits(iv, false)}` : ''}`;
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
  code = code.replace(/\n{3,}/g, '\n\n');
  return { filename: `${name}.${ci ? 'vhd' : 'v'}`, code, diagnostics: diags };
}

// ===================================================================== HDL -> schematic
// Module port lists for module symbols, from a compiled library ({ name: { name, lang, ports:[{name,dir,width,type}], generics } }).
export function modulesFromLibrary(lib, { sources } = {}) {
  const out = {};
  for (const m of lib.modules.values()) {
    let ports = [];
    try {
      const d = elaborate(lib, m.name);
      if (d.top) ports = d.top.ports.map(p => ({ name: p.name, dir: p.dir, width: p.t.w }));
    } catch { /* ignore */ }
    if (!ports.length) ports = (m.ports || []).map(p => ({ name: p.name, dir: p.dir, width: 1 }));
    if (m.lang === 'vhdl' && sources) {
      const text = sources[m.file];
      if (text) { const itf = vhdlInterface(text, m); for (const p of ports) { const x = itf.ports.get(p.name.toLowerCase()); if (x) p.type = x.type; } }
    }
    out[m.name] = { name: m.name, lang: m.lang, file: m.file, ports, generics: (m.params || []).filter(p => !p.local).map(p => ({ name: p.name, default: p.default ? (m.lang === 'vhdl' ? unparen(prVhdl(p.default)) : unparen(prVlog(p.default))) : '' })) };
  }
  return out;
}

// VHDL entity interface lists: { generics: [{name,type,default}], ports: Map(name -> {type, mode, default}) }
function vhdlInterface(text, mod) {
  const toks = tokenize(text, 'vhdl');
  const ls = lineStarts(text);
  let i = tokAt(toks, offsetOf(ls, mod.loc));
  // find "entity <name> is"
  for (; i < toks.length; i++) if (toks[i].v === 'entity' && toks[i + 1]?.v === mod.name.toLowerCase()) break;
  const res = { generics: [], ports: new Map(), genericMap: new Map() };
  if (i >= toks.length) return res;
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
  for (const el of list('port')) { const e = parseElem(el); for (const n of e.names) res.ports.set(n.toLowerCase(), { type: e.type, mode: e.mode, default: e.default }); }
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
  if (archText) { toks = tokenize(archText, lang); ls = lineStarts(archText); }
  const itemSpan = new Map();     // item -> { code, start, end }
  let modStart = 0, modEnd = toks.length;
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
      const col = s0 - (ls[archText.slice(0, s0).split('\n').length - 1] ?? 0) + 1;
      itemSpan.set(it, { code: dedent(archText.slice(s0, e0), col), start: s0, end: e0 });
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
      let txt = archText.slice(toks[sp.st].s, toks[sp.en - 1].e);
      // net declaration assignment "wire [3:0] s = a + b;" -> declaration only (assignment becomes a block)
      const kw = toks[sp.st].v;
      if (['wire', 'tri', 'logic', 'wand', 'wor', 'supply0', 'supply1'].includes(kw) && sp.names.length === 1) {
        const eq = toks.slice(sp.st, sp.en).findIndex(t => t.v === '=');
        if (eq > 0) { txt = archText.slice(toks[sp.st].s, toks[sp.st + eq - 1].e) + ';'; sp.splitAssign = true; }
      }
      const col = toks[sp.st].s - (ls[archText.slice(0, toks[sp.st].s).split('\n').length - 1] ?? 0) + 1;
      declTexts.push(dedent(txt, col));
      sp.text = txt;
    }
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
      const col = s0 - (ls[archText.slice(0, s0).split('\n').length - 1] ?? 0) + 1;
      code = dedent(archText.slice(s0, e0), col);
      if (['wire', 'tri', 'logic', 'wand', 'wor'].includes(kw) && it.kind === 'assign') {
        // from a net declaration assignment
        const eq = toks.slice(st, en).findIndex(t => t.v === '=');
        code = `assign ${squash(prVlog(it.target))} = ${archText.slice(toks[st + eq + 1].s, toks[en - 2].e).trim()};`;
      }
      if (it.kind === 'generate_for' || it.kind === 'generate_if') code = `generate\n${code}\nendgenerate`;
      itemSpan.set(it, { code, start: s0, end: e0, kw });
    }
  }
  if (!ci && archText) {
    // `define macros used by the verbatim pieces
    const used = [doc.hdl.decls, ...[...itemSpan.values()].map(x => x.code)].join('\n');
    const defs = [...archText.slice(0, toks[modStart]?.s ?? 0).matchAll(/^[ \t]*`define\s+(\w+)[^\n]*$/gm)].filter(m => new RegExp('`' + m[1] + '\\b').test(used));
    if (defs.length) doc.hdl.context = [doc.hdl.context, ...defs.map(m => m[0].trim())].filter(Boolean).join('\n');
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

  // ---- connectivity being built: net name -> { width, drivers: [ep], sinks: [ep] } ; ep = { sym, pin } | { port }
  const nets = new Map();
  const netOf = (name, width) => { let n = nets.get(nk(name)); if (!n) nets.set(nk(name), n = { name, width, eps: [], drivers: [] }); return n; };
  let autoK = 0;
  const anonNet = width => netOf(`__n${++autoK}`, width);
  const symbols = [];
  let gateK = 0;
  const usedNames = new Set([...inst.children.map(c => nk(c.name)), ...[...sigByName.keys()]]);
  const gateName = () => { let nm; do nm = `XLXI_${++gateK}`; while (usedNames.has(nk(nm))); usedNames.add(nk(nm)); return nm; };
  const addSym = (type, params, name, extra = {}) => {
    const s = { id: `S${symbols.length + 1}`, type, x: 0, y: 0, rot: 0, mirror: false, name: name || gateName(), params: { ...defaultParams(type), ...params }, ...extra };
    symbols.push(s); return s;
  };
  const connect = (netName, width, ep, isDriver) => { const n = typeof netName === 'object' ? netName : netOf(netName, width); n.eps.push(ep); if (isDriver) n.drivers.push(ep); return n; };

  // ---- ports -> I/O markers
  for (const p of inst.ports) {
    const port = { id: `P${doc.ports.length + 1}`, name: p.name, dir: p.dir === 'out' ? 'out' : p.dir === 'inout' ? 'inout' : 'in', width: W(p.sig), x: 0, y: 0 };
    if (ci) port.type = typeText.get(nk(p.name)) || typeTextVhdl(mod.ports.find(q => nk(q.name) === nk(p.name))?.type);
    else {
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
      const f = x => { if (x.op === 'binary' && x.o === e.o && ['&', '|', '^'].includes(e.o) && flat.length < 5) { f(x.a); f(x.b); } else flat.push(x); };
      if (['&', '|', '^'].includes(e.o)) f(e); else flat.push(e.a, e.b);
      const maxN = inverted ? ({ '&': 4, '|': 4, '^': 2 }[e.o]) : ({ '&': 5, '|': 5, '^': 2 }[e.o] || 2);
      if (flat.length > maxN) return null;
      // operands '~signal' of an AND/OR become the inverted inputs of an ANDnBk/ORnBk (NANDnBk/NORnBk) gate
      const simpleNot = x => x.op === 'unary' && x.o === '~' && ['ref', 'index', 'slice', 'apply'].includes(x.a.op);
      const nInv = ['&', '|'].includes(e.o) ? flat.filter(simpleNot).length : 0;
      if (nInv && flat.length > 1) {
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
      return gate(`${op}${args.length}`, args.map((a, k) => [a, `I${k}`]), w, cls);
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
        const s = addSym('module', { module: c.module, generics, ports: info.map(x => ({ name: x.port, dir: x.dir, width: x.t?.w ?? 1 })) }, c.name);
        const built = [];
        for (const q of pinsOK) {
          if (q.none) continue;
          const ep = { sym: s.id, pin: q.port };
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
    const title = it.label || (it.kind === 'instance' ? `${it.name} : ${it.module}` : it.kind === 'process' ? (ci ? 'process' : (it.initial ? 'initial' : 'always')) : it.kind === 'assign' ? 'assign' : it.kind.replace('_', ' '));
    let nm = it.label || (it.kind === 'instance' ? it.name : null);
    if (!nm || usedNames.has(nk(nm)) && it.kind !== 'instance') { nm = `${kindTag === 'reg' ? 'REG' : kindTag === 'tb' ? 'TB' : kindTag === 'comb' ? 'COMB' : kindTag === 'gen' ? 'GEN' : 'LOGIC'}_${++blockK}`; while (usedNames.has(nk(nm))) nm = `BLK_${++blockK}`; }
    usedNames.add(nk(nm));
    const s = addSym('hdlblock', {
      title,
      kind: kindTag,
      inputs: [...clocks, ...others].map(x => ({ name: x.name, width: W(x), ...(rw.clocks.has(x) ? { clock: true } : {}) })),
      outputs: outs.map(x => ({ name: x.name, width: W(x), ...(procedural && !rw.children.length ? { reg: true } : {}) })),
    }, nm, { hdl: span ? span.code : (ci ? `-- source of item at line ${it.loc?.line} not available` : `// source of item at line ${it.loc?.line} not available`) });
    if (!ci && procedural) {
      // outputs written by always/initial blocks are Verilog regs (unless driven by an instance in a generate)
      const drivenByInst = new Set(rw.children.flatMap(c => (c.connInfo || []).flatMap(x => [...(x.writes || [])])));
      s.params.outputs = outs.map(x => ({ name: x.name, width: W(x), ...(!drivenByInst.has(x) && rw.procs.some(p => p.kind === 'process' && p.writes.has(x)) ? { reg: true } : {}) }));
    }
    for (const x of [...clocks, ...others]) connect(x.name, W(x), { sym: s.id, pin: x.name });
    for (const x of outs) connect(x.name, W(x), { sym: s.id, pin: x.name }, true);
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
  doc.symbols = symbols;

  // ---- geometry
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
      perNet.forEach((polys, k) => {
        const n = conns[k];
        const lines = mergeNetWires(polys);
        for (const pts of lines) wires.push({ id: `W${wires.length + 1}`, points: pts, ...(n.width > 1 ? { bus: true } : {}) });
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

// convenience for UIs: is the symbol a module that can be opened?
export function symbolTitle(sym) { return sym.type === 'module' ? sym.params?.module : (SYMBOLS[sym.type]?.title || sym.type); }
