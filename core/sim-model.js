// The Post-Synthesis Simulation Model of the Silinx toolchain (#120), as ISE's netgen -sim writes it
// from XST's netlist: the open synthesis's netlist (Yosys's JSON) as a structural VHDL model of the
// UNISIM primitives (core/fpga/techview.js technologyNetlist: LUT1-4 with their INIT, FD* flip-flops,
// MUXF5-8, MUXCY / XORCY, RAMB16, MULT18X18, SRL16, I/O buffers…), the entity with the top's ports, so
// that the user's test bench simulates it in place of the RTL; and the same netlist in Verilog (Yosys's
// write_verilog). Silinx's simulator has the UNISIM models (core/unisim.js).
//
// The generics. A netlist has its constants built in, so a test bench that gives the design other
// generics (a clock divider of 2 instead of 50 000 000, to simulate quickly) would test another
// design. As ISE's model, this one has no generics; it is synthesized with the generics the test bench
// gives its instance of the top (dutGenerics), and says so in its header.
import { technologyNetlist, vhdlName } from './fpga/techview.js';
import { paramBits, paramInt } from './fpga/netlist.js';
import { primitiveInterface } from './netlist-hier.js';
import { validIdent } from './schdoc.js';
import { lutTable } from './xdl.js';
import { UNISIM_SOURCE, SIMPRIM_SOURCE } from './unisim.js';
import * as V from './values.js';

/** The UNISIM primitives Silinx simulates (upper case). */
export const SIM_PRIMITIVES = new Set([...UNISIM_SOURCE.text.matchAll(/^\s*entity\s+(\w+)\s+is/gim)].map(m => m[1].toUpperCase()));

/**
 * The generics a test bench gives its instance of the top: { generics: { NAME: integer }, skipped:
 * [names not integers], instance: its path } or null when the test bench has no instance of the top.
 * simDesign: the elaborated test bench.
 */
export function dutGenerics(simDesign, top) {
  const want = String(top).toLowerCase();
  const find = n => {
    for (const c of n?.children || []) {
      if (String(c.module || '').toLowerCase() === want) return c;
      const d = find(c);
      if (d) return d;
    }
    return null;
  };
  const inst = find(simDesign?.top);
  if (!inst) return null;
  const generics = {}, skipped = [];
  for (const p of inst.params || []) {
    if (!p.given) continue;
    if (p.t?.kind === 'int' && p.value && !Array.isArray(p.value) && p.value.x === 0n) {
      const n = Number(V.toNum(p.value));
      if (Number.isSafeInteger(n)) { generics[p.name] = n; continue; }
    }
    skipped.push(p.name);
  }
  return { generics, skipped, instance: inst.path || inst.name };
}

/**
 * The models from the synthesis's result (core/synth-open.js synthesizeOpen: its files):
 * { vhdl, verilog, cells, unknown: [cell types with no simulation model] }.
 * o: { top, part, generics: { NAME: value } given to the synthesis, testbench: its name }
 */
export function postSynthesisModels(synth, { top, part = '', generics = {}, testbench = null } = {}) {
  const json = JSON.parse(synth.files[`${synth.top}.json`]);
  const tn = technologyNetlist(json, { top });
  // (the top module's cells: the netlist also holds the library cells Yosys read, a primitive's model with its
  // $specify2 timing arcs first, #493)
  const mod = json.modules[synth.top] || Object.values(json.modules).find(m => m.attributes?.top) || Object.values(json.modules)[0];
  const types = new Set(Object.values(mod?.cells || {}).map(c => String(c.type).toUpperCase()));
  const unknown = [...types].filter(t => !SIM_PRIMITIVES.has(t)).sort();
  const gens = Object.entries(generics);
  const head = (c) => [
    `${c} Post-Synthesis Simulation Model of '${top}'${part ? ` (${part})` : ''}: the open synthesis's netlist (Silinx toolchain, Yosys),`,
    `${c} the UNISIM primitives it is made of; written by Silinx. Simulate it with the test bench in place of the`,
    `${c} design's own HDL (its entity has the top's ports).`,
    ...(gens.length ? [`${c} Synthesized with the generics ${testbench ? `the test bench '${testbench}' gives` : 'given'}: ${gens.map(([k, v]) => `${k} = ${v}`).join(', ')}.`] : []),
  ].join('\n');
  // the generics it was synthesized with, declared (they change nothing: the test bench's generic map is
  // accepted as it is)
  let body = tn.flat.replace(/^-- Technology netlist of [^\n]*\n/, '');
  // (a parameter's undefined bits, a memory with no initial contents: INIT_00(256'hxxxx…), are 0, as the
  // FPGA has them and as the VHDL model writes them)
  let vlog = synth.files[`${synth.top}_yosys.v`].replace(/^(\s*\.\w+\(\d+'[bh])([0-9a-fA-FxXzZ_]+)\)/gm, (m, a, digits) => `${a}${digits.replace(/[xXzZ]/g, '0')})`);
  if (gens.length) {
    // (the top's entity: the last one, after the stubs of cells Silinx has no model of)
    const at = body.lastIndexOf('\nentity '), eol = body.indexOf('\n', at + 1) + 1;
    body = `${body.slice(0, eol)}  generic (\n${gens.map(([k, v]) => `    ${k} : integer := ${v}`).join(';\n')}\n  );\n${body.slice(eol)}`;
    vlog = vlog.replace(/^(module [^;]*;\n)/m, `$1${gens.map(([k, v]) => `  parameter ${k} = ${v};\n`).join('')}`);
  }
  const vhdl = `${head('--')}\n${body}`;
  const verilog = `${head('//')}\n${vlog}`;
  return { vhdl, verilog, cells: tn.cells, unknown };
}

// ------------------------------------------------------------------ Post-Translate and Post-Map models (#121)
// As ISE's netgen writes them from the .ngd and from the mapped .ncd: structural netlists of SIMPRIM
// primitives (X_LUT4, X_FF / X_SFF, X_MUX2, X_XOR2, X_BUF, X_OBUF, X_RAMB16_*, X_MULT18X18SIO…), in VHDL
// and in Verilog, with the top's ports.
//   Post-Translate: the netlist of the synthesis, every cell as its SIMPRIM primitive (a MUXCY is an X_MUX2,
//   an FDRE an X_SFF with its reset synchronous, a BUFG an X_CKBUF…), as ngdbuild expands it.
//   Post-Map: the packed design (core/fpga/pack.js): each slice as the elements of the Spartan-3E slice its
//   configuration uses (the LUTs F and G, the F5 and FX multiplexers, the carry chain's multiplexers and XORs,
//   the flip-flops or latches with their clock, enable and set / reset inverters), the pads, the global clock
//   buffers, the block RAMs, multipliers and DCMs, as map's settings say (the same reading of them as the
//   packer's tests, test/fpga-sim.js packedSim). Functional: no timing.

/** The SIMPRIM primitives Silinx simulates (upper case). */
export const SIMPRIM_PRIMITIVES = new Set([...SIMPRIM_SOURCE.text.matchAll(/^\s*entity\s+(\w+)\s+is/gim)].map(m => m[1].toUpperCase()));

// a name as the packer writes it in its configuration strings (pack.js clean)
const cleanName = s => String(s).replace(/^\\/, '').replace(/[\s"\\:]/g, '_');
const bitsOfHex = (hex, w) => { let x = BigInt(`0x${hex || '0'}`); return Array.from({ length: w }, () => { const b = Number(x & 1n); x >>= 1n; return b; }); };
const hexOfBits = bits => { let s = ''; for (let i = 4 * Math.ceil(bits.length / 4) - 4; i >= 0; i -= 4) s += ((bits[i] || 0) | ((bits[i + 1] || 0) << 1) | ((bits[i + 2] || 0) << 2) | ((bits[i + 3] || 0) << 3)).toString(16).toUpperCase(); return s; };
const vecWidth = type => { const m = /\(\s*(\d+)\s+(?:downto|to)\s+(\d+)\s*\)/i.exec(type || ''); return m ? Math.abs(+m[1] - +m[2]) + 1 : 0; };

/**
 * A structural netlist being written: the top's ports (readYosysJson's), signals, instances of primitives.
 * A connection (ref) is { s: signal }, { c: 0 | 1 }, { p: port, i: bit index | null } or { n: net } (a net
 * of the packed design, resolved when written: the output that drives it).
 */
class Structure {
  constructor(nl, name) {
    this.taken = new Set();
    this.signals = [];
    this.insts = [];
    this.alias = new Map();
    this.name = this.uniq(name);
    this.ports = nl.ports.map(p => {
      const bits = p.bits.map(b => ({ ...b, index: /<(-?\d+)>$/.test(b.name) ? +/<(-?\d+)>$/.exec(b.name)[1] : null }));
      const bus = bits.some(b => b.index !== null), idx = bits.map(b => b.index);
      return { name: p.name, ident: this.uniq(p.name), dir: p.dir, bus, msb: bus ? Math.max(...idx) : null, lsb: bus ? Math.min(...idx) : null, bits };
    });
    this.portBit = new Map();
    for (const p of this.ports) for (const b of p.bits) this.portBit.set(cleanName(b.name), { p: p.ident, i: p.bus ? b.index : null });
  }
  uniq(base) {
    let s = vhdlName(base);
    if (!validIdent(s, 'verilog')) s = `${s}_s`;
    let t = s;
    for (let k = 1; this.taken.has(t.toLowerCase()); k++) t = `${s}_${k}`;
    this.taken.add(t.toLowerCase());
    return t;
  }
  signal(base) { const s = this.uniq(base); this.signals.push(s); return { s }; }
  /** An instance: generics [[name, value]] (value: { bits }, { bit }, { int }, { real }, { str }, { bool }),
   *  pins [[formal, ref]] or [[formal, [refs, bit 0 first]]] (a vector formal). Returns its name. */
  inst(type, base, generics, pins) { const name = this.uniq(base); this.insts.push({ name, type, generics, pins }); return name; }
  // the gates the writers use, folded when an input is a constant
  inv(r, base) {
    if (r.c !== undefined) return { c: 1 - r.c };
    const o = this.signal(base);
    this.inst('X_INV', base, [], [['I', r], ['O', o]]);
    return o;
  }
  mux(a, b, s, base) {   // b when s = 1
    if (s.c !== undefined) return s.c ? b : a;
    const o = this.signal(base);
    this.inst('X_MUX2', base, [], [['IA', a], ['IB', b], ['SEL', s], ['O', o]]);
    return o;
  }
  xor(a, b, base) {
    if (a.c === 0) return b;
    if (b.c === 0) return a;
    const o = this.signal(base);
    this.inst('X_XOR2', base, [], [['I0', a], ['I1', b], ['O', o]]);
    return o;
  }
  and(a, b, base) {
    if (a.c !== undefined) return a.c ? b : a;
    if (b.c !== undefined) return b.c ? a : b;
    const o = this.signal(base);
    this.inst('X_AND2', base, [], [['I0', a], ['I1', b], ['O', o]]);
    return o;
  }
  resolve(r, seen = 0) {
    if (r.n === undefined) return r;
    if (seen > 64) throw new Error(`net ${r.n}: its driver is not found`);
    let a = this.alias.get(r.n);
    if (!a) { a = this.signal(`N${r.n}`); this.alias.set(r.n, a); }
    return this.resolve(a, seen + 1);
  }
  ref(r, lang) {
    r = this.resolve(r);
    if (r.c !== undefined) return lang === 'vhdl' ? `'${r.c}'` : `1'b${r.c}`;
    if (r.p !== undefined) return r.i === null ? r.p : lang === 'vhdl' ? `${r.p}(${r.i})` : `${r.p}[${r.i}]`;
    return r.s;
  }
  static value(v, lang) {
    if (v.bits) return v.bits.length % 4 === 0 ? (lang === 'vhdl' ? `X"${hexOfBits(v.bits)}"` : `${v.bits.length}'h${hexOfBits(v.bits)}`)
      : (lang === 'vhdl' ? `"${[...v.bits].reverse().join('')}"` : `${v.bits.length}'b${[...v.bits].reverse().join('')}`);
    if (v.bit !== undefined) return lang === 'vhdl' ? `'${v.bit}'` : `1'b${v.bit}`;
    if (v.int !== undefined) return String(v.int);
    if (v.real !== undefined) return Number.isInteger(v.real) ? `${v.real}.0` : String(v.real);
    if (v.bool !== undefined) return lang === 'vhdl' ? (v.bool ? 'TRUE' : 'FALSE') : (v.bool ? '"TRUE"' : '"FALSE"');
    return `"${String(v.str).replace(/"/g, '')}"`;
  }
  /** The text: VHDL or Verilog, under the comment lines `head`, with the top's generics declared. */
  write(lang, head, generics = {}) {
    const gens = Object.entries(generics);
    // (the outputs of a vector formal left unconnected: a signal of their own)
    for (const it of this.insts) for (const pin of it.pins) if (Array.isArray(pin[1])) pin[1] = pin[1].map((r, k) => r || this.signal(`NLW_${it.name}_${pin[0]}_${k}`));
    const R = r => this.ref(r, lang);
    if (lang === 'vhdl') {
      const portDecl = p => `    ${p.ident} : ${p.dir === 'in' ? 'in' : p.dir === 'out' ? 'out' : 'inout'} ${p.bus ? `STD_LOGIC_VECTOR ( ${p.msb} downto ${p.lsb} )` : 'STD_LOGIC'}`;
      const body = this.insts.map(it => {
        const pins = it.pins.flatMap(([f, r]) => (Array.isArray(r) ? r.map((x, k) => [`${f}(${k})`, x]).reverse() : [[f, r]])).map(([f, r]) => `      ${f} => ${R(r)}`);
        const g = it.generics.length ? `    generic map (\n${it.generics.map(([k, v]) => `      ${k} => ${Structure.value(v, 'vhdl')}`).join(',\n')}\n    )\n` : '';
        return `  ${it.name} : ${it.type}\n${g}    port map (\n${pins.join(',\n')}\n    );`;
      });
      return `${head}
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library SIMPRIM;
use SIMPRIM.VCOMPONENTS.ALL;
use SIMPRIM.VPACKAGE.ALL;

entity ${this.name} is
${gens.length ? `  generic (\n${gens.map(([k, v]) => `    ${k} : integer := ${v}`).join(';\n')}\n  );\n` : ''}  port (
${this.ports.map(portDecl).join(';\n')}
  );
end ${this.name};

architecture STRUCTURE of ${this.name} is
${this.signals.map(s => `  signal ${s} : STD_LOGIC;`).join('\n')}
begin
${body.join('\n')}
end STRUCTURE;
`;
    }
    const portDecl = p => `  ${p.dir === 'in' ? 'input' : p.dir === 'out' ? 'output' : 'inout'} ${p.bus ? `[${p.msb}:${p.lsb}] ` : ''}${p.ident};`;
    const body = this.insts.map(it => {
      const pins = it.pins.map(([f, r]) => `    .${f}(${Array.isArray(r) ? `{${r.map(R).reverse().join(', ')}}` : R(r)})`);
      const g = it.generics.length ? ` #(\n${it.generics.map(([k, v]) => `    .${k}(${Structure.value(v, 'verilog')})`).join(',\n')}\n  )` : '';
      return `  ${it.type}${g} ${it.name} (\n${pins.join(',\n')}\n  );`;
    });
    return `${head}
module ${this.name} (${this.ports.map(p => p.ident).join(', ')});
${gens.map(([k, v]) => `  parameter ${k} = ${v};\n`).join('')}${this.ports.map(portDecl).join('\n')}
${this.signals.map(s => `  wire ${s};`).join('\n')}
${body.join('\n')}
endmodule
`;
  }
}

// a cell's or a site's generics as values, from the primitive's interface (core/unisim.js)
function genericValues(type, get) {
  const out = [];
  for (const g of primitiveInterface(type)?.generics || []) {
    if (/^(LOC|PATHPULSE)$/i.test(g.name)) continue;
    const v = get(g.name);
    if (v === undefined || v === null || v === '') continue;
    const t = g.type.toLowerCase(), w = vecWidth(t);
    if (/^bit_vector/.test(t) && w) {
      const bits = typeof v === 'object' ? v : paramBits(v) ?? (typeof v === 'number' ? [...v.toString(2)].reverse().map(Number) : null);
      if (!bits) continue;
      // block RAM contents left empty: the default
      if (/^INITP?_[0-9A-F]{2}$/i.test(g.name) && !bits.includes(1)) continue;
      out.push([g.name, { bits: Array.from({ length: w }, (_, k) => bits[k] || 0) }]);
    } else if (t === 'bit' || t === 'std_ulogic') out.push([g.name, { bit: paramInt(v) & 1 }]);
    else if (t === 'integer') out.push([g.name, { int: typeof v === 'number' ? v : paramInt(v) }]);
    else if (t === 'real') { const x = typeof v === 'number' ? v : parseFloat(String(v).replace('_', '.')); if (Number.isFinite(x)) out.push([g.name, { real: x }]); }
    else if (t === 'boolean') out.push([g.name, { bool: /^(1|true)$/i.test(String(v).trim()) }]);
    else if (t === 'string') out.push([g.name, { str: String(v).trim() }]);
  }
  return out;
}

const modelHead = (c, what, from, { top, part, generics, testbench }, prims = 'SIMPRIM') => [
  `${c} ${what} Simulation Model of '${top}'${part ? ` (${part})` : ''}: ${from} (Silinx toolchain),`,
  `${c} the ${prims} primitives it is made of (functional, no timing); written by Silinx. Simulate it with the test`,
  `${c} bench in place of the design's own HDL (its entity has the top's ports).`,
  ...(Object.keys(generics || {}).length ? [`${c} Synthesized with the generics ${testbench ? `the test bench '${testbench}' gives` : 'given'}: ${Object.entries(generics).map(([k, v]) => `${k} = ${v}`).join(', ')}.`] : []),
].join('\n');

const FF_ASYNC = /^FD(C|P|CE|PE|CP|CPE)$/, FF_SYNC = /^FD(R|S|RE|SE|RS|RSE)$/;
/**
 * The Post-Translate Simulation Model: the netlist of the synthesis (readYosysJson's) as ngdbuild translates
 * it into SIMPRIM primitives. Returns { vhdl, verilog, instances, unknown: [cell types with no model] }.
 * o: { top, part, generics, testbench } (the header).
 */
export function postTranslateModels(nl, o = {}) {
  const M = new Structure(nl, nl.name);
  const { nets } = nl;
  const sigOf = new Map();
  const net = k => {
    if (k === undefined) return null;
    const n = nets[k];
    if (n.const !== undefined) return { c: n.const };
    if (n.port && M.portBit.has(cleanName(n.port))) return M.portBit.get(cleanName(n.port));
    if (!sigOf.has(k)) sigOf.set(k, M.signal(!n.name || n.name.includes('$') || /^n\d+$/.test(n.name) ? `N${k}` : n.name));
    return sigOf.get(k);
  };
  const unknown = new Set(), count = {};
  for (const c of nl.cells) {
    const p = name => net(c.pins[name]);
    const out = Object.entries(c.pins).find(([pin, k]) => c.dirs[pin.replace(/<\d+>$/, '')] === 'output' && nets[k].name && !nets[k].name.includes('$'));
    const base = !c.name.startsWith('$') ? c.name : out ? `${nets[out[1]].name}_${c.type}` : `${c.type}_${(count[c.type] = (count[c.type] || 0) + 1)}`;
    const invd = (r, pin) => (paramInt(c.params[`IS_${pin}_INVERTED`]) ? M.inv(r, `${base}_${pin}INV`) : r);
    const t = c.type, m = /^(\w+?)(_1)?$/.exec(t), falling = !!m[2];
    const vec = (pin, type) => {
      const w = vecWidth(primitiveInterface(type)?.ports.find(x => x.name.toUpperCase() === pin.toUpperCase())?.type);
      return Array.from({ length: w }, (_, k) => net(c.pins[`${pin}<${k}>`] ?? (w === 1 ? c.pins[pin] : undefined)) || null);
    };
    const vecIn = (pin, type) => vec(pin, type).map(r => r || { c: 0 });
    let k;
    if ((k = /^LUT([1-4])$/.exec(t))) {
      const n = +k[1];
      M.inst(`X_LUT${n}`, base, [['INIT', { bits: Array.from({ length: 1 << n }, (_, j) => (paramBits(c.params.INIT) || [])[j] || 0) }]],
        [...Array.from({ length: n }, (_, j) => [`ADR${j}`, p(`I${j}`) || { c: 0 }]), ['O', p('O')]]);
    } else if (t === 'INV' || t === 'BUF') M.inst(`X_${t}`, base, [], [['I', p('I')], ['O', p('O')]]);
    else if (/^MUXF[5-8]$/.test(t)) M.inst('X_MUX2', base, [], [['IA', p('I0')], ['IB', p('I1')], ['SEL', p('S')], ['O', p('O')]]);
    else if (t === 'MUXCY') M.inst('X_MUX2', base, [], [['IA', p('DI')], ['IB', p('CI')], ['SEL', p('S')], ['O', p('O')]]);
    else if (t === 'XORCY') M.inst('X_XOR2', base, [], [['I0', p('CI')], ['I1', p('LI')], ['O', p('O')]]);
    else if (/^(IBUF|IBUFG)$/.test(t)) M.inst('X_BUF', base, [], [['I', p('I')], ['O', p('O')]]);
    else if (t === 'OBUF') M.inst('X_OBUF', base, [], [['I', p('I')], ['O', p('O')]]);
    else if (t === 'BUFG') M.inst('X_CKBUF', base, [], [['I', p('I')], ['O', p('O')]]);
    else if (t === 'BUFGMUX') M.inst('X_BUFGMUX', base, [], [['I0', p('I0')], ['I1', p('I1')], ['S', p('S')], ['O', p('O')]]);
    else if (/^FD/.test(m[1]) && (FF_ASYNC.test(m[1]) || FF_SYNC.test(m[1]) || /^FDE?$/.test(m[1]))) {
      const clk = falling ^ paramInt(c.params.IS_C_INVERTED) ? M.inv(p('C'), `${base}_CLKINV`) : p('C');
      const ce = c.pins.CE !== undefined ? invd(p('CE'), 'CE') : { c: 1 };
      const pin = x => (c.pins[x] !== undefined ? invd(p(x), x) : { c: 0 });
      const init = c.params.INIT !== undefined ? paramInt(c.params.INIT) & 1 : /^FD(P|PE|S|SE)$/.test(m[1]) ? 1 : 0;
      const sync = FF_SYNC.test(m[1]);
      M.inst(sync ? 'X_SFF' : 'X_FF', base, [['INIT', { bit: init }]], [['I', p('D')], ['CE', ce], ['CLK', clk], ['SET', sync ? { c: 0 } : pin('PRE')], ['RST', sync ? { c: 0 } : pin('CLR')],
        ...(sync ? [['SSET', pin('S')], ['SRST', pin('R')]] : []), ['O', p('Q')]]);
    } else if (/^LD(C|P|CE|PE|E)?$/.test(m[1])) {
      const g = falling ^ paramInt(c.params.IS_G_INVERTED) ? M.inv(p('G'), `${base}_GINV`) : p('G');
      const pin = x => (c.pins[x] !== undefined ? invd(p(x), x) : { c: x === 'GE' ? 1 : 0 });
      const init = c.params.INIT !== undefined ? paramInt(c.params.INIT) & 1 : /^LDP/.test(m[1]) ? 1 : 0;
      M.inst('X_LATCHE', base, [['INIT', { bit: init }]], [['I', p('D')], ['GE', pin('GE')], ['CLK', g], ['SET', pin('PRE')], ['RST', pin('CLR')], ['O', p('Q')]]);
    } else if (/^SRLC?16E?$/.test(m[1])) {
      const clk = falling ^ paramInt(c.params.IS_CLK_INVERTED) ? M.inv(p('CLK'), `${base}_CLKINV`) : p('CLK');
      M.inst('X_SRLC16E', base, [['INIT', { bits: Array.from({ length: 16 }, (_, j) => (paramBits(c.params.INIT) || [])[j] || 0) }]],
        [...[0, 1, 2, 3].map(j => [`A${j}`, p(`A${j}`) || { c: 0 }]), ['D', p('D')], ['CE', c.pins.CE !== undefined ? p('CE') : { c: 1 }], ['CLK', clk], ['Q', p('Q') || M.signal(`NLW_${base}_Q`)], ['Q15', p('Q15') || M.signal(`NLW_${base}_Q15`)]]);
    } else if ((k = /^RAM(16|32|64)X1([SD])$/.exec(m[1]))) {
      const n = Math.log2(+k[1]), clk = falling ^ paramInt(c.params.IS_WCLK_INVERTED) ? M.inv(p('WCLK'), `${base}_WCLKINV`) : p('WCLK');
      const init = [['INIT', { bits: Array.from({ length: +k[1] }, (_, j) => (paramBits(c.params.INIT) || [])[j] || 0) }]];
      const adr = pfx => Array.from({ length: n }, (_, j) => p(`${pfx}${j}`) || { c: 0 });
      if (k[2] === 'S') M.inst(`X_RAMS${k[1]}`, base, init, [...adr('A').map((r, j) => [`ADR${j}`, r]), ['I', p('D')], ['CLK', clk], ['WE', p('WE')], ['O', p('O')]]);
      else for (const [o, ra] of [['SPO', 'A'], ['DPO', 'DPRA']]) {
        if (c.pins[o] === undefined) continue;
        M.inst(`X_RAMD${k[1]}`, `${base}_${o}`, init, [...adr(ra).map((r, j) => [`RADR${j}`, r]), ...adr('A').map((r, j) => [`WADR${j}`, r]), ['I', p('D')], ['CLK', clk], ['WE', p('WE')], ['O', p(o)]]);
      }
    } else if (/^RAMB16_S(1|2|4|9|18|36)(_S(1|2|4|9|18|36))?$/.test(t)) {
      const X = `X_${t}`, itf = primitiveInterface(X);
      const pins = itf.ports.map(x => [x.name, vecWidth(x.type) ? (x.dir === 'out' ? vec(x.name, X) : vecIn(x.name, X)) : p(x.name) || (x.dir === 'out' ? M.signal(`NLW_${base}_${x.name}`) : { c: 0 })]);
      M.inst(X, base, genericValues(X, g => c.params[g] ?? c.params[g.replace(/_([0-9A-F]{2})$/, (x, h) => `_${h.toLowerCase()}`)]), pins);
    } else if (/^MULT18X18(S|SIO)?$/.test(t)) {
      const X = 'X_MULT18X18SIO', S = t === 'MULT18X18S', SIO = t === 'MULT18X18SIO';
      const reg = g => (SIO ? paramInt(c.params[g], 1) : S && g === 'PREG' ? 1 : 0);
      const ctl = x => (SIO ? (c.pins[x] !== undefined ? p(x) : { c: 0 }) : S ? (/^CE/.test(x) ? p('CE') : /^RST/.test(x) ? p('R') : p('C')) : { c: 0 });
      M.inst(X, base, [['AREG', { int: reg('AREG') }], ['BREG', { int: reg('BREG') }], ['PREG', { int: reg('PREG') }], ['B_INPUT', { str: String(c.params.B_INPUT || 'DIRECT').trim() }]],
        [['A', vecIn('A', X)], ['B', vecIn('B', X)], ...['CEA', 'CEB', 'CEP', 'CLK', 'RSTA', 'RSTB', 'RSTP'].map(x => [x, ctl(x) || { c: 0 }]), ['P', vec('P', X)]]);
    } else if (/^DCM(_SP)?$/.test(t)) {
      const X = 'X_DCM_SP';
      const pins = primitiveInterface(X).ports.map(x => [x.name, vecWidth(x.type) ? vec(x.name, X) : p(x.name) || (x.dir === 'out' ? M.signal(`NLW_${base}_${x.name}`) : { c: 0 })]);
      M.inst(X, base, genericValues(X, g => c.params[g]), pins);
    } else unknown.add(t);
  }
  const h = c => modelHead(c, 'Post-Translate', "the netlist of the open synthesis translated", o);
  return { vhdl: M.write('vhdl', h('--'), o.generics), verilog: M.write('verilog', h('//'), o.generics), instances: M.insts.length, unknown: [...unknown].sort() };
}

const WIDTH_OF_ATTR = { '16384X1': 1, '8192X2': 2, '4096X4': 4, '2048X9': 9, '1024X18': 18, '512X36': 36 };
const BRAM_W = { 1: [1, 0, 14], 2: [2, 0, 13], 4: [4, 0, 12], 9: [8, 1, 11], 18: [16, 2, 10], 36: [32, 4, 9] };   // data, parity, address bits

/**
 * The Post-Map Simulation Model: the packed design (core/fpga/pack.js pack()) as map's settings make it, of
 * SIMPRIM primitives; nl: the netlist it was packed from (its ports). Returns { vhdl, verilog, instances,
 * unknown: [kinds of site with no model] }. o: { top, part, generics, testbench } (the header).
 */
export function postMapModels(nl, packed, o = {}) {
  const M = new Structure(nl, nl.name);
  const { insts } = packed;
  const inNet = insts.map(() => new Map());
  packed.nets.forEach((n, k) => { for (const p of n.inpins) inNet[p.inst].set(p.pin, k); });
  const netRef = k => (packed.nets[k].type === 'vcc' ? { c: 1 } : packed.nets[k].type === 'gnd' ? { c: 0 } : { n: k });
  const pin = (i, p) => (inNet[i].has(p) ? netRef(inNet[i].get(p)) : { c: 0 });
  const outs = new Map();   // `${inst}:${pin}` -> the ref of that output (or the function that builds it)
  const unknown = new Set();
  insts.forEach((inst, i) => {
    const c = new Map(inst.cfg.map(x => [x.attr, x]));
    const val = a => c.get(a)?.value;
    const name = inst.name;
    const out = (p, r) => outs.set(`${i}:${p}`, r);
    // an input through its inverter (the site's <pin>INV = <pin>_B)
    const inv = (p, attr = `${p}INV`) => (val(attr) === `${p}_B` ? M.inv(pin(i, p), `${name}_${attr}`) : pin(i, p));
    if (inst.kind === 'iob') {
      const pad = M.portBit.get(c.get('PAD')?.name);
      if (!pad) { unknown.add(`pad ${c.get('PAD')?.name}`); return; }
      if (inst.dir === 'in') { const s = M.signal(`${name}_INBUF`); M.inst('X_BUF', `${name}_IBUF`, [], [['I', pad], ['O', s]]); out('I', s); }
      else M.inst('X_OBUF', `${name}_OBUF`, [], [['I', inv('O1')], ['O', pad]]);
      return;
    }
    if (inst.kind === 'bufg') {
      const s = M.signal(name);
      M.inst('X_BUFGMUX', name, [], [['I0', pin(i, 'I0')], ['I1', pin(i, 'I1')], ['S', inv('S')], ['O', s]]);
      out('O', s);
      return;
    }
    if (inst.kind === 'bram') {
      const ports = ['A', 'B'].filter(x => c.has(`PORT${x}_ATTR`));
      const dual = ports.length === 2, ws = ports.map(x => WIDTH_OF_ATTR[val(`PORT${x}_ATTR`)]);
      const X = `X_RAMB16_${ws.map(w => `S${w}`).join('_')}`;
      const pins = [];
      ports.forEach((x, n) => {
        const [d, p, aw] = BRAM_W[ws[n]], P = dual ? x : '';
        const outv = (pfx, w) => Array.from({ length: w }, (_, k) => { const s = M.signal(`${name}_${pfx}${x}${k}`); out(`${pfx}${x}${k}`, s); return s; });
        pins.push([`DO${P}`, outv('DO', d)], ...(p ? [[`DOP${P}`, outv('DOP', p)]] : []),
          [`ADDR${P}`, Array.from({ length: aw }, (_, j) => pin(i, `ADDR${x}${14 - aw + j}`))], [`CLK${P}`, inv(`CLK${x}`)],
          [`DI${P}`, Array.from({ length: d }, (_, k) => pin(i, `DI${x}${k}`))], ...(p ? [[`DIP${P}`, Array.from({ length: p }, (_, k) => pin(i, `DIP${x}${k}`))]] : []),
          [`EN${P}`, inv(`EN${x}`)], [`SSR${P}`, inv(`SSR${x}`)], [`WE${P}`, inv(`WE${x}`)]);
      });
      const get = g => {
        let m = /^(INITP?)_([0-9A-F]{2})$/.exec(g);
        if (m) { const v = val(m[1] === 'INITP' ? `INITP_0${parseInt(m[2], 16)}` : `INIT_${m[2].toLowerCase()}`); return v === undefined ? undefined : bitsOfHex(v, 256); }
        m = /^(INIT|SRVAL|WRITE_MODE)(?:_([AB]))?$/.exec(g);
        if (!m) return undefined;
        const x = m[2] || 'A';
        if (m[1] === 'WRITE_MODE') return val(`WRITEMODE${x}`);
        const [d, p] = BRAM_W[ws[ports.indexOf(x)]] || [0, 0];
        return val(`${m[1]}_${x}`) === undefined ? undefined : bitsOfHex(val(`${m[1]}_${x}`), d + p);
      };
      M.inst(X, name, genericValues(X, get), pins);
      return;
    }
    if (inst.kind === 'mult') {
      const X = 'X_MULT18X18SIO';
      const P = Array.from({ length: 36 }, (_, k) => { const s = M.signal(`${name}_P${k}`); out(`P${k}`, s); return s; });
      M.inst(X, name, [['AREG', { int: +(val('AREG') ?? 0) }], ['BREG', { int: +(val('BREG') ?? 0) }], ['PREG', { int: +(val('PREG') ?? 0) }], ['B_INPUT', { str: val('B_INPUT') || 'DIRECT' }]],
        [['A', Array.from({ length: 18 }, (_, k) => pin(i, `A${k}`))], ['B', Array.from({ length: 18 }, (_, k) => pin(i, `B${k}`))],
          ...['CEA', 'CEB', 'CEP', 'CLK', 'RSTA', 'RSTB', 'RSTP'].map(x => [x, inv(x)]), ['P', P]]);
      return;
    }
    if (inst.kind === 'dcm') {
      const X = 'X_DCM_SP';
      const pins = primitiveInterface(X).ports.map(x => {
        if (vecWidth(x.type)) return [x.name, Array.from({ length: vecWidth(x.type) }, (_, k) => { const s = M.signal(`${name}_${x.name}${k}`); out(`${x.name}${k}`, s); return s; })];
        if (x.dir === 'out') { const s = M.signal(`${name}_${x.name}`); out(x.name, s); return [x.name, s]; }
        return [x.name, c.has(`${x.name}INV`) ? inv(x.name) : pin(i, x.name)];
      });
      const get = g => ({ CLKIN_PERIOD: val('X_CLKIN_PERIOD'), STARTUP_WAIT: c.has('STARTUP_WAIT') ? 'TRUE' : 'FALSE', CLKIN_DIVIDE_BY_2: c.has('CLKIN_DIVIDE_BY_2') ? 'TRUE' : 'FALSE' }[g] ?? val(g));
      M.inst(X, name, genericValues(X, get), pins);
      return;
    }
    if (inst.kind !== 'slice') { unknown.add(inst.type); return; }
    sliceModel(M, i, name, c, val, pin, inv, out);
  });
  // every net: the output that drives it
  packed.nets.forEach((n, k) => {
    if (n.type === 'vcc' || n.type === 'gnd') return;
    const d = n.outpins[0];
    let r = d ? outs.get(`${d.inst}:${d.pin}`) : null;
    if (typeof r === 'function') r = r();
    M.alias.set(k, r || (d ? (unknown.add(`${insts[d.inst].type}.${d.pin}`), { c: 0 }) : { c: 0 }));
  });
  const h = c => modelHead(c, 'Post-Map', 'the packed design', o);
  return { vhdl: M.write('vhdl', h('--'), o.generics), verilog: M.write('verilog', h('//'), o.generics), instances: M.insts.length, unknown: [...unknown].sort() };
}

// A Spartan-3E slice from its configuration (the elements it uses), as packedSim reads it (test/fpga-sim.js)
function sliceModel(M, i, name, c, val, pin, inv, out) {
  const BX = inv('BX'), BY = inv('BY');
  const clk = val('CLKINV') === 'CLK_B' ? M.inv(pin(i, 'CLK'), `${name}_CLKINV`) : pin(i, 'CLK');
  const memory = side => /^#RAM/.test(val(side) || '');
  const mems = {};
  const lut = {};
  for (const side of ['F', 'G']) {
    const e = c.get(side);
    if (!e) { lut[side] = { c: 0 }; continue; }
    const adr = [1, 2, 3, 4].map(j => pin(i, `${side}${j}`));
    if (memory(side)) { lut[side] = M.signal(`${name}_${side}`); mems[side] = adr; continue; }
    const t = lutTable(e.value.replace(/^#LUT:/, ''), 4);
    lut[side] = M.signal(`${name}_${side}`);
    // (only the inputs its equation reads: the packer wires the carry's data input CY0F / CY0G to a pin the LUT
    // may not read, and an unknown value there would make the LUT's output unknown, on a loop through other slices)
    M.inst('X_LUT4', e.name ? `${e.name}_${side}` : `${name}_${side}`, [['INIT', { bits: t.bits }]],
      [...adr.map((r, j) => [`ADR${j}`, t.inputs.includes(`A${j + 1}`) ? r : { c: 0 }]), ['O', lut[side]]]);
  }
  // the SLICEM's shift registers and RAMs: written on CLK while SR (the write / shift enable), data BX / BY
  if (mems.F || mems.G) {
    const init = side => ({ bits: bitsOfHex(/^#RAM:D=0x([0-9a-fA-F]+)$/.exec(val(side))?.[1], 16) });
    const sr = pin(i, 'SR'), rawBX = pin(i, 'BX'), rawBY = pin(i, 'BY');
    let q15G = null;
    for (const side of ['G', 'F']) {
      if (!mems[side]) continue;
      const iname = c.get(side).name || `${name}_${side}`;
      if (val(`${side}_ATTR`) === 'SHIFT_REG') {
        const q15 = M.signal(`${name}_${side}MC15`);
        if (side === 'G') q15G = q15;
        const d = side === 'G' ? rawBY : ({ BX: rawBX, ALTDIF: rawBY, SHIFTIN: q15G || { c: 0 } }[val('DIF_MUX')] ?? { c: 0 });
        M.inst('X_SRLC16E', iname, [['INIT', init(side)]], [...mems[side].map((r, j) => [`A${j}`, r]), ['D', d], ['CE', sr], ['CLK', clk], ['Q', lut[side]], ['Q15', q15]]);
        continue;
      }
      const d = side === 'G' ? rawBY : ({ BX: rawBX, ALTDIF: rawBY }[val('DIF_MUX')] ?? { c: 0 });
      // a RAM32X1S: BX (its A4) chooses the LUT written (F: BX = 1)
      const we = c.has('SLICEWE0USED') ? M.and(sr, side === 'F' ? rawBX : M.inv(rawBX, `${name}_WE0INV`), `${name}_${side}WE`) : sr;
      if (side === 'F' && val('F_ATTR') === 'DUAL_PORT') {
        M.inst('X_RAMD16', iname, [['INIT', init(side)]], [...mems.F.map((r, j) => [`RADR${j}`, r]), ...mems.G.map((r, j) => [`WADR${j}`, r]), ['I', d], ['CLK', clk], ['WE', we], ['O', lut.F]]);
      } else M.inst('X_RAMS16', iname, [['INIT', init(side)]], [...mems[side].map((r, j) => [`ADR${j}`, r]), ['I', d], ['CLK', clk], ['WE', we], ['O', lut[side]]]);
    }
  }
  const F = lut.F, G = lut.G;
  let f5, fx;
  const F5 = () => (f5 ||= M.mux(G, F, BX, c.get('F5MUX')?.name || `${name}_F5MUX`));
  const FX = () => (fx ||= M.mux(pin(i, 'FXINB'), pin(i, 'FXINA'), BY, c.get('F6MUX')?.name || `${name}_FXMUX`));
  const cin = val('CYINIT') === 'BX' ? BX : pin(i, 'CIN');
  const cy0 = (v, side) => ({ 0: { c: 0 }, 1: { c: 1 }, BX, BY, F1: pin(i, 'F1'), F2: pin(i, 'F2'), G1: pin(i, 'G1'), G2: pin(i, 'G2') }[v]
    ?? (v === 'PROD' ? M.and(pin(i, `${side}1`), pin(i, `${side}2`), `${name}_${side}AND`) : { c: 0 }));
  let cyF, cyG;
  const CYF = () => (cyF ||= M.mux(cy0(val('CY0F'), 'F'), cin, val('CYSELF') === '1' ? { c: 1 } : F, c.get('CYMUXF')?.name || `${name}_CYMUXF`));
  const CYG = () => (cyG ||= M.mux(cy0(val('CY0G'), 'G'), CYF(), val('CYSELG') === '1' ? { c: 1 } : G, c.get('CYMUXG')?.name || `${name}_CYMUXG`));
  let x, y;
  const Xo = () => (x ||= { F: () => F, F5, FXOR: () => M.xor(cin, F, c.get('XORF')?.name || `${name}_XORF`) }[val('FXMUX')]?.() ?? { c: 0 });
  const Yo = () => (y ||= { G: () => G, FX, GXOR: () => M.xor(CYF(), G, c.get('XORG')?.name || `${name}_XORG`) }[val('GYMUX')]?.() ?? { c: 0 });
  // (built when a net uses them)
  for (const [p, f] of Object.entries({ X: Xo, Y: Yo, XB: CYF, YB: CYG, COUT: CYG, F5, FX })) out(p, f);
  // the flip-flops (or latches)
  const ce = c.has('CEINV') ? inv('CE') : { c: 1 };
  const sr = c.has('SRINV') && !c.has('WSGEN') ? inv('SR') : { c: 0 };
  const sync = val('SYNC_ATTR') === 'SYNC';
  for (const X of ['X', 'Y']) {
    const kind = val(`FF${X}`);
    if (!kind) continue;
    const d = val(`D${X}MUX`) === '1' ? (X === 'X' ? Xo() : Yo()) : X === 'X' ? BX : BY;
    const high = val(`FF${X}_SR_ATTR`) === 'SRHIGH';
    const init = { bit: val(`FF${X}_INIT_ATTR`) === 'INIT1' ? 1 : 0 };
    const q = M.signal(`${name}_${X}Q`);
    const iname = c.get(`FF${X}`).name || `${name}_FF${X}`;
    const none = { c: 0 };
    if (kind === '#LATCH') {
      // (open while the clock, after CLKINV, is low)
      M.inst('X_LATCHE', iname, [['INIT', init]], [['I', d], ['GE', ce], ['CLK', M.inv(clk, `${name}_${X}GATE`)], ['SET', high ? sr : none], ['RST', high ? none : sr], ['O', q]]);
    } else if (sync && sr.c === undefined) {
      M.inst('X_SFF', iname, [['INIT', init]], [['I', d], ['CE', ce], ['CLK', clk], ['SET', none], ['RST', none], ['SSET', high ? sr : none], ['SRST', high ? none : sr], ['O', q]]);
    } else M.inst('X_FF', iname, [['INIT', init]], [['I', d], ['CE', ce], ['CLK', clk], ['SET', high ? sr : none], ['RST', high ? none : sr], ['O', q]]);
    out(`${X}Q`, q);
  }
}
