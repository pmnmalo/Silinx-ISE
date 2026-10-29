// Silinx schematic document (.sch.json) -> Xilinx ISE schematic (.sch, ISE 14.7, version 7) (#405: out of isesch.js):
// the sheet, its symbols as ISE library symbols (or Silinx-only xl_… symbols whose parameters are encoded in the
// name, with their .sym files), wires, bus taps, net names and I/O markers. isesch.js re-exports exportIseSch,
// decodeXlSymbol and iseTimestamp. Isomorphic (no DOM, no Node APIs).
import {
  JOIN_BAR, SYMBOLS, compareOps, normalizeDoc, symbolDef, symbolPins, symbolBox, portBox, portSide, netlist, normModules, generateHdl, constBits, newDoc, xform,
} from './schdoc.js';
import { LIB_GFX, LIB_TS, findModule, gfxShapes, iomarkerOrien, iseXform, lc, libPins, xaiToIseOrien } from './isesch.js';
import { blockHdlDecls } from './isesch-blockhdl.js';
import { primIseSymbol, primTimestamp } from './isesch-prims.js';
import { pickOrigin, placeBlock, routeStubs, sheetRouter } from './isesch-route.js';

const S_OUT = 16 / 5;                     // Silinx px -> ISE units (grid 10 -> 32, pin pitch 20 -> 64)
const SHEET_SIZES = [[1760, 1360], [2720, 1760], [3520, 2720], [5440, 3520], [7040, 5440]];
const xesc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hexOf = bits => (bits ? BigInt('0b' + bits.replace(/[^01]/g, '0')).toString(16) : '0');
// a name as ISE holds it (#1763): an identifier, which an escaped name (\opcode[0]) cannot be; its other characters
// become '_', none first nor last (a VHDL identifier too, as the import reads it back): opcode_0
export function iseIdent(s) {
  const t = String(s ?? '');
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return t;
  const u = t.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return !u ? 'n' : /^\d/.test(u) ? `n${u}` : u;
}

// Name of the ISE symbol a Silinx symbol is exported as. Library symbols: { lib: true, name, pins: {xaiPin: isePin} };
// Silinx-only symbols: { lib: false, name: 'xl_…' (parameters encoded in the name, decoded again on import) }.
function iseSymbolFor(s, def, netW, modules) {
  const t = s.type, p = s.params || {};
  const S = SYMBOLS[t];
  const W = Math.max(1, parseInt(p.width, 10) || 1);
  const pinW = n => def.pins.find(q => q.name === n)?.width ?? netW(n) ?? 1;
  if (t === 'module') {
    const m = findModule(modules, p.module);
    return { lib: false, module: true, name: p.module || m?.name || 'module' };
  }
  if (S?.gate) {
    if (S.invIn && W === 1 && !S.noLib) {
      // ANDnBk...: same pin names and positions as the Xilinx library symbol
      const pins = { O: 'O' };
      for (let k = 0; k < S.inputs; k++) pins[`I${k}`] = `I${k}`;
      return { lib: true, name: t, pins };
    }
    if (W === 1 && !S.noLib) {
      if (t === 'inv' || t === 'buf') return { lib: true, name: t, pins: { I: 'I', O: 'O' } };
      const n = S.inputs;
      const pins = { O: 'O' };
      for (let k = 0; k < n; k++) pins[`I${k}`] = `I${n - 1 - k}`;
      return { lib: true, name: t, pins };
    }
    if ((t === 'inv' || t === 'buf') && (W === 8 || W === 16) && t === 'inv') return { lib: true, name: `inv${W}`, pins: { I: `I(${W - 1}:0)`, O: `O(${W - 1}:0)` } };
    return { lib: false, name: `xl_${t}_w${W}${W > 1 && p.bits ? '_bits' : ''}` };   // (a pin per bit: INV / BUF #2067, the gates #2079)
  }
  if (S?.ff) {
    // FD*/FT*/FJK*: the library flip-flop when the INIT value is the library default and all its pin positions are
    // known, else a Silinx symbol carrying the INIT value in its name
    const d0 = S.params[0].default, iv = String(p.init ?? d0) === '1' ? '1' : '0';
    const lp = libPins(t);
    if (W === 1 && iv === d0 && lp && def.pins.every(q => lp[q.name] && lp[q.name][1] != null)) return { lib: true, name: t, pins: Object.fromEntries(def.pins.map(q => [q.name, q.name])) };
    return { lib: false, name: `xl_${t}_i${iv}${W > 1 ? `_w${W}` : ''}` };
  }
  switch (t) {
    // (with an enable E: the Xilinx M2_1E / M4_1E; the select bits on pins of their own, #301: 's' in the
    // name of a Silinx symbol, without it the bus pin S of before)
    case 'mux2': return W === 1 ? (p.en ? { lib: true, name: 'm2_1e', pins: { D0: 'D0', D1: 'D1', S0: 'S0', E: 'E', O: 'O' } } : { lib: true, name: 'm2_1', pins: { D0: 'D0', D1: 'D1', S0: 'S0', O: 'O' } })
      : { lib: false, name: `xl_mux2${p.en ? 'e' : ''}_w${W}` };
    case 'mux4': return W === 1 && p.en && !p.selBus ? { lib: true, name: 'm4_1e', pins: { D0: 'D0', D1: 'D1', D2: 'D2', D3: 'D3', S0: 'S0', S1: 'S1', E: 'E', O: 'O' } }
      : { lib: false, name: `xl_mux4${p.en ? 'e' : ''}${p.selBus ? '' : 's'}_w${W}` };
    // (the select bits on pins of their own: 's', as for M4_1; without it the bus S, #313)
    case 'mux16': return { lib: false, name: `xl_mux16${p.en ? 'e' : ''}${p.selBus ? '' : 's'}_w${W}` };
    case 'mux8': {
      if (W > 1 || !p.en || p.selBus) return { lib: false, name: `xl_mux8${p.en ? 'e' : ''}${p.selBus ? '' : 's'}_w${W}` };
      const pins = { S0: 'S0', S1: 'S1', S2: 'S2', E: 'E', O: 'O' };
      for (let k = 0; k < 8; k++) pins[`D${k}`] = `D${k}`;
      return { lib: true, name: 'm8_1e', pins };
    }
    case 'tbuf': {
      // always a Silinx symbol (with its .sym and HDL file): ISE 14.7's FPGA symbol libraries
      // (Spartan-3/3E/6 ...) have no BUFE / BUFT (only CPLD ones do), so a library block would not
      // open there; imported BUFE / BUFT blocks (CPLD schematics) still map to this symbol
      const en = p.enable === 'T' ? 'T' : 'E', bits = W > 1 && !!p.bits;
      return { lib: false, name: `xl_tbuf${lc(en)}_w${W}${bits ? '_bits' : ''}` };
    }
    case 'demux': { const k = Math.max(1, Math.min(4, parseInt(p.sel, 10) || 1)); return { lib: false, name: `xl_demux${k}${p.en ? 'e' : ''}${k > 1 && !p.selBus ? 's' : ''}_w${W}` }; }
    case 'decoder': {
      const n = Math.max(1, Math.min(5, parseInt(p.n, 10) || 2));
      // D2_4E / D3_8E (pin positions known); D4_16E is written as a Silinx symbol with the same pins
      if (p.en && !p.bus && (n === 2 || n === 3)) {
        const pins = { E: 'E' };
        for (let k = 0; k < n; k++) pins[`A${k}`] = `A${k}`;
        for (let k = 0; k < 1 << n; k++) pins[`D${k}`] = `D${k}`;
        return { lib: true, name: `d${n}_${1 << n}e`, pins };
      }
      return { lib: false, name: `xl_dec${n}${p.en ? '_e' : ''}${p.bus ? '_bus' : ''}` };
    }
    case 'encoder': {
      const n = Math.max(2, Math.min(5, parseInt(p.n, 10) || 2));
      return { lib: false, name: `xl_${p.mode === 'one-hot' ? 'enc' : 'penc'}${n}${p.bus ? '_bus' : ''}` };
    }
    case 'register': {
      const bits = constBits(p.init ?? '0', W) || '0'.repeat(W);
      const zero = /^0+$/.test(bits);
      const rs = p.reset === 'async' ? '_ar' : p.reset === 'sync' ? '_sr' : '';
      if (zero && W === 1) {
        const nm = p.en ? (p.reset === 'async' ? 'fdce' : p.reset === 'sync' ? 'fdre' : null) : (p.reset === 'async' ? 'fdc' : p.reset === 'sync' ? 'fdr' : 'fd');
        if (nm) return { lib: true, name: nm, pins: { D: 'D', C: 'C', CE: 'CE', CLR: 'CLR', R: 'R', Q: 'Q' } };
      }
      if (zero && p.en && (W === 8 || W === 16) && p.reset !== 'none') return { lib: true, name: `fd${W}${p.reset === 'async' ? 'ce' : 're'}`, pins: { D: `D(${W - 1}:0)`, Q: `Q(${W - 1}:0)`, C: 'C', CE: 'CE', CLR: 'CLR', R: 'R' } };
      return { lib: false, name: `xl_reg${W}${p.en ? '_ce' : ''}${rs}_h${hexOf(bits)}` };
    }
    case 'counter': {
      const rs = p.reset === 'async' ? '_ar' : p.reset === 'sync' ? '_sr' : '';
      if (p.en && p.dir !== 'down' && p.reset === 'async' && (W === 8 || W === 16)) return { lib: true, name: `cb${W}ce`, pins: { C: 'C', CE: 'CE', CLR: 'CLR', Q: `Q(${W - 1}:0)` } };
      return { lib: false, name: `xl_cnt${W}${p.en ? '_ce' : ''}${rs}${p.dir === 'down' ? '_dn' : ''}${p.bits && W > 1 ? '_bits' : ''}` };
    }
    case 'add': return { lib: false, name: `xl_add${W}${p.cin ? '_ci' : ''}${p.cout ? '_co' : ''}${p.bits && W > 1 ? '_bits' : ''}` };
    case 'sub': return { lib: false, name: `xl_sub${W}${p.bin ? '_bi' : ''}${p.bout ? '_bo' : ''}${p.bits && W > 1 ? '_bits' : ''}` };
    case 'compare':
      if (W === 8 && compareOps(p).join() === 'eq' && !p.signed) return { lib: true, name: 'comp8', pins: { A: 'A(7:0)', B: 'B(7:0)', O: 'EQ' } };
      // (several comparisons, #1555: xl_cmp8_eq_gt)
      return { lib: false, name: `xl_cmp${W}_${compareOps(p).join('_')}${p.signed ? '_s' : ''}${p.bits && W > 1 ? '_bits' : ''}` };
    case 'vcc': case 'gnd': {
      const w = pinW(t === 'vcc' ? 'P' : 'G');
      if (w === 1) return { lib: true, name: t, pins: { P: 'P', G: 'G' } };
      // (a CONSTANT's symbol, its output O, read back as one, #953)
      return { lib: false, name: `xl_const${w}_h${hexOf((t === 'vcc' ? '1' : '0').repeat(w))}`, constant: true, pins: { [t === 'vcc' ? 'P' : 'G']: `O(${w - 1}:0)` } };
    }
    case 'constant': {
      const w = pinW('O');
      const bits = constBits(p.value, w) || '0'.repeat(w);
      if (w === 1 && /^[01]$/.test(bits)) return { lib: true, name: bits === '1' ? 'vcc' : 'gnd', pins: { O: bits === '1' ? 'P' : 'G' } };
      return { lib: false, name: `xl_const${w}_h${hexOf(bits)}` };
    }
    case 'slice': {
      const iw = pinW('I');
      return { lib: false, name: `xl_slice${iw}_${parseInt(p.msb, 10) || 0}_${parseInt(p.lsb, 10) || 0}` };
    }
    case 'busjoin': return { lib: false, name: `xl_join_${String(p.widths || '').split(/[,\s]+/).filter(Boolean).join('_')}` };
    case 'hdlblock': {
      // imported from ISE: write the original symbol back when the pins still match
      const iseSym = p.iseSymbol, map = p.isePins || {};
      if (iseSym && def.pins.every(q => map[q.name])) {
        const lp = libPins(iseSym);
        if (lp && def.pins.every(q => lp[map[q.name]] && lp[map[q.name]][1] != null)) return { lib: true, name: lc(iseSym), pins: { ...map } };
        if (!lp && !decodeXlSymbol(iseSym)) return { lib: false, name: iseSym, project: true, pins: { ...map } };
      }
      return { lib: false, name: null, hdl: true };
    }
    // a device primitive: ISE's library symbol with its attributes (#1694)
    default: return (S?.prim && primIseSymbol(s)) || { lib: false, name: `xl_${t}` };
  }
}

// xl_* symbol name -> Silinx { type, params } (import of schematics exported by Silinx)
export function decodeXlSymbol(name) {
  const s = lc(name);
  let m;
  if ((m = /^xl_(and|or|nand|nor|xor|xnor)(\d(?:b\d)?)_w(\d+)(_bits)?$/.exec(s)) && SYMBOLS[m[1] + m[2]]) return { type: m[1] + m[2], params: { width: +m[3], ...(m[4] ? { bits: true } : {}) } };
  if ((m = /^xl_(f(?:d|t|jk)[a-z]*)_i([01])(?:_w(\d+))?$/.exec(s)) && SYMBOLS[m[1]]?.ff) return { type: m[1], params: { init: m[2], ...(m[3] ? { width: +m[3] } : {}) } };
  if ((m = /^xl_tbuf([et])_w(\d+)(_bits)?$/.exec(s))) return { type: 'tbuf', params: { width: +m[2], enable: m[1].toUpperCase(), bits: !!m[3] } };
  if ((m = /^xl_demux([1-4])(e?)(s?)_w(\d+)$/.exec(s))) return { type: 'demux', params: { sel: +m[1], width: +m[4], en: !!m[2], selBus: +m[1] > 1 && !m[3] } };
  if ((m = /^xl_dec([1-5])(_e)?(_bus)?$/.exec(s))) return { type: 'decoder', params: { n: +m[1], en: !!m[2], bus: !!m[3] } };
  if ((m = /^xl_(p?enc)([2-5])(_bus)?$/.exec(s))) return { type: 'encoder', params: { n: +m[2], mode: m[1] === 'enc' ? 'one-hot' : 'priority', bus: !!m[3] } };
  if ((m = /^xl_mux2(e?)_w(\d+)$/.exec(s))) return { type: 'mux2', params: { width: +m[2], en: !!m[1] } };
  if ((m = /^xl_mux(8|16)(e?)(s?)_w(\d+)$/.exec(s))) return { type: `mux${m[1]}`, params: { width: +m[4], en: !!m[2], selBus: !m[3] } };
  if ((m = /^xl_mux4(e?)(s?)_w(\d+)$/.exec(s))) return { type: 'mux4', params: { width: +m[3], en: !!m[1], selBus: !m[2] } };
  if ((m = /^xl_(inv|buf)_w(\d+)(_bits)?$/.exec(s))) return { type: m[1], params: { width: +m[2], ...(m[3] ? { bits: true } : {}) } };
  if ((m = /^xl_reg(\d+)(_ce)?(_ar|_sr)?_h([0-9a-f]+)$/.exec(s))) return { type: 'register', params: { width: +m[1], en: !!m[2], reset: m[3] === '_ar' ? 'async' : m[3] === '_sr' ? 'sync' : 'none', init: m[4] === '0' ? '0' : `0x${m[4]}` } };
  if ((m = /^xl_cnt(\d+)(_ce)?(_ar|_sr)?(_dn)?(_bits)?$/.exec(s))) return { type: 'counter', params: { width: +m[1], en: !!m[2], reset: m[3] === '_ar' ? 'async' : m[3] === '_sr' ? 'sync' : 'none', dir: m[4] ? 'down' : 'up', ...(m[5] ? { bits: true } : {}) } };
  if ((m = /^xl_add(\d+)(_ci)?(_co)?(_bits)?$/.exec(s))) return { type: 'add', params: { width: +m[1], cin: !!m[2], cout: !!m[3], ...(m[4] ? { bits: true } : {}) } };
  if ((m = /^xl_sub(\d+)(_bi)?(_bo)?(_bits)?$/.exec(s))) return { type: 'sub', params: { width: +m[1], ...(m[2] ? { bin: true } : {}), ...(m[3] ? { bout: true } : {}), ...(m[4] ? { bits: true } : {}) } };
  if ((m = /^xl_cmp(\d+)((?:_(?:eq|ne|lt|le|gt|ge))+)(_s)?(_bits)?$/.exec(s))) return { type: 'compare', params: { width: +m[1], op: m[2].slice(1).split('_').join(','), signed: !!m[3], ...(m[4] ? { bits: true } : {}) } };
  if ((m = /^xl_const(\d+)_h([0-9a-f]+)$/.exec(s))) return { type: 'constant', params: { width: +m[1], value: `0x${m[2]}` } };
  if ((m = /^xl_slice(\d+)_(\d+)_(\d+)$/.exec(s))) return { type: 'slice', params: { inWidth: +m[1], msb: +m[2], lsb: +m[3] } };
  if ((m = /^xl_join_([\d_]+)$/.exec(s))) return { type: 'busjoin', params: { widths: m[1].split('_').join(',') } };
  return null;
}

export function iseTimestamp(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}T${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
}
function shapeXml(sh, ind) {
  const r = v => Math.round(v);
  if (sh.kind === 'line') return `${ind}<line x2="${r(sh.x2)}" y1="${r(sh.y1)}" y2="${r(sh.y2)}"${sh.bus ? ' style="linewidth:W"' : ''} x1="${r(sh.x1)}" />`;
  if (sh.kind === 'rect') return `${ind}<rect width="${r(sh.w)}" x="${r(sh.x)}" y="${r(sh.y)}" height="${r(sh.h)}" />`;
  if (sh.kind === 'circle') return `${ind}<circle r="${r(sh.r)}" cx="${r(sh.cx)}" cy="${r(sh.cy)}" />`;
  if (sh.kind === 'arc') return `${ind}<arc ex="${r(sh.ex)}" ey="${r(sh.ey)}" sx="${r(sh.sx)}" sy="${r(sh.sy)}" r="${r(sh.r)}" cx="${r(sh.cx)}" cy="${r(sh.cy)}" />`;
  return '';
}

/**
 * Write a Silinx schematic as an ISE 14.7 schematic (.sch, <drawing version="7">).
 * @param {object} docIn  Silinx document (.sch.json)
 * @param {{ modules?: object|object[], family?: string, timestamp?: string, lang?: 'vhdl'|'verilog' }} opts
 * @returns {{ xml: string, warnings: string[], files: { path: string, text: string, kind: 'hdl'|'sym' }[] }}
 *   files: HDL modules + ISE symbols (.sym) for the Silinx-only symbols (xl_*) and .sym files for project modules;
 *   add them to the ISE project next to the .sch.
 */
export function exportIseSch(docIn, opts = {}) {
  const warnings = [];
  const warn = m => { if (!warnings.includes(m)) warnings.push(m); };
  const renamed = new Set();      // the names written otherwise, as ISE holds them (#1763)
  const doc = normalizeDoc(docIn);
  const modules = normModules(opts.modules);
  const lang = opts.lang === 'verilog' || opts.lang === 'vhdl' ? opts.lang : doc.lang;
  const family = String(opts.family || 'spartan3e').toLowerCase();
  const stamp = opts.timestamp || iseTimestamp();
  const nl = netlist(doc, { modules });
  for (const d of nl.diagnostics) if (d.severity === 'error') warn(`schematic check: ${d.message}`);
  const X = v => Math.round(v * S_OUT);

  // ------------------------------------------------------------- signal names
  const taken = new Map();
  const claimName = (want, net) => {
    let b = iseIdent(want), nm = b, k = 0;
    while (taken.has(lc(nm)) && taken.get(lc(nm)) !== net) nm = `${b}_${++k}`;
    taken.set(lc(nm), net);
    if (b !== String(want)) renamed.add(`'${want}' as '${nm}'`);
    return nm;
  };
  const sigOf = new Map();        // net -> ISE signal name (with bus range)
  const portOwner = new Map();    // net -> first port on it
  for (const p of doc.ports) { const n = nl.portNet.get(p.id); if (n && !portOwner.has(n)) portOwner.set(n, p); }
  // slices and bus joins become ISE bus taps: their part nets are renamed 'bus(7:4)' / 'bus(3)'
  const pinNetOf = (s, n) => nl.pinNet.get(`${s.id}/${n}`) || null;
  const member = new Map();       // net -> { main, msb, lsb }
  const tapSyms = new Map();      // symbol id -> 'slice' | 'join'
  const mains = new Set();
  const free = n => n && !portOwner.has(n) && !member.has(n) && !mains.has(n);
  for (const s of doc.symbols) {
    if (s.type !== 'slice') continue;
    const I = pinNetOf(s, 'I'), O = pinNetOf(s, 'O');
    const msb = parseInt(s.params.msb, 10) || 0, lsb = parseInt(s.params.lsb, 10) || 0;
    if (!I || !O || I === O || member.has(I) || !free(O) || msb < lsb || lsb < (I.range?.lsb ?? 0) || msb > (I.range?.msb ?? I.width - 1) || O.width !== msb - lsb + 1) continue;
    if (doc.symbols.some(q => q !== s && ((q.type === 'slice' && pinNetOf(q, 'I') === O) || (q.type === 'busjoin' && pinNetOf(q, 'O') === O)))) continue;
    member.set(O, { main: I, msb, lsb }); mains.add(I); tapSyms.set(s.id, 'slice');
  }
  for (const s of doc.symbols) {
    if (s.type !== 'busjoin') continue;
    const def = symbolDef(s, modules);
    const O = pinNetOf(s, 'O');
    const ins = def.pins.filter(q => q.dir === 'in').map(q => ({ q, n: pinNetOf(s, q.name) }));
    if (!O || member.has(O)) continue;
    if (!ins.every(({ q, n }) => free(n) && n !== O && n.width === q.width) || new Set(ins.map(i => i.n)).size !== ins.length) continue;
    if (ins.reduce((a, i) => a + i.q.width, 0) !== O.width) continue;
    let hi = O.range ? O.range.msb : O.width - 1;
    for (const { q, n } of ins) { member.set(n, { main: O, msb: hi, lsb: hi - q.width + 1 }); hi -= q.width; }
    mains.add(O); tapSyms.set(s.id, 'join');
  }
  let auto = 0;
  const used = nl.nets.filter(n => n.endpoints.length || n.wires.length);
  const order = [...used].sort((a, b) => (portOwner.has(b) - portOwner.has(a)) || (a.auto - b.auto));
  for (const n of order) {
    if (member.has(n) || (n.part && !portOwner.has(n))) continue;
    let base;
    if (portOwner.has(n)) base = claimName(portOwner.get(n).name, n);
    else if (!n.auto) base = claimName(n.name, n);
    else { do auto++; while (taken.has(lc(`XLXN_${auto}`))); base = claimName(`XLXN_${auto}`, n); }
    // (a bus named with its indices, d(7:4), keeps them, #1689)
    sigOf.set(n, n.width > 1 ? `${base}(${n.range ? `${n.range.msb}:${n.range.lsb}` : `${n.width - 1}:0`})` : base);
  }
  // (a net of some bits of a bus named so, a(0), #1688: those bits of its bus's ISE name)
  for (const n of order) if (n.part && !member.has(n) && !portOwner.has(n)) {
    const base = n.part.bus ? sigOf.get(n.part.bus).replace(/\(.*$/, '') : claimName(n.part.base, `#bus:${lc(n.part.base)}`);
    sigOf.set(n, n.part.msb === n.part.lsb ? `${base}(${n.part.msb})` : `${base}(${n.part.msb}:${n.part.lsb})`);
  }
  for (const [n, m] of member) {
    const base = sigOf.get(m.main).replace(/\(.*$/, '');
    sigOf.set(n, m.msb === m.lsb ? `${base}(${m.msb})` : `${base}(${m.msb}:${m.lsb})`);
  }
  const bustaps = [];

  // ------------------------------------------------------------- symbols -> blocks
  const blockdefs = new Map();    // lower name -> { name, shapes, timestamp, pins (custom) }
  const files = [];
  const blocks = [], instances = [];
  const extraWires = new Map();   // net -> [[x1,y1,x2,y2]]
  // (the drawing, for the wires added from an ISE pin to its Silinx pin: none along another net's, #1798)
  const router = sheetRouter(doc, used, nl.portNet, X), stubs = [];
  const addExtra = (net, seg) => { let l = extraWires.get(net); if (!l) extraWires.set(net, l = []); l.push(seg); router.addSeg(net, ...seg); };
  const conn = net => (net && (net.endpoints.length > 1 || net.wires.length || net.labels.length || net.ports.length) ? net : null);
  const customs = new Map();      // lower name -> { name, sym, def, hdl }
  const hdlNames = new Set();
  for (const s of doc.symbols) {
    const def = symbolDef(s, modules);
    const netOfPin = n => nl.pinNet.get(`${s.id}/${n}`) || null;
    if (tapSyms.has(s.id)) {
      const pp = new Map(symbolPins(s, modules, def).map(q => [q.name, q]));
      if (tapSyms.get(s.id) === 'slice') {
        const I = pp.get('I'), O = pp.get('O');
        bustaps.push(`        <bustap x2="${X(O.x)}" y1="${X(I.y)}" y2="${X(O.y)}" x1="${X(I.x)}" />`);
      } else {
        // bus spine along its bar, one tap per input (as long as before #1910, when the bar was at the output pin),
        // and the bus from the bar to its output pin
        const ins = def.pins.filter(q => q.dir === 'in');
        const O = def.pins.find(q => q.name === 'O');
        const spine = ins.map(q => xform(s, def, JOIN_BAR, q.y));
        const ys = def.pins.map(q => q.y);
        const a = xform(s, def, JOIN_BAR, Math.min(...ys)), b = xform(s, def, JOIN_BAR, Math.max(...ys));
        if (a.x !== b.x || a.y !== b.y) addExtra(netOfPin('O'), [X(a.x), X(a.y), X(b.x), X(b.y)]);
        const c = xform(s, def, JOIN_BAR, O.y), o = xform(s, def, O.x, O.y);
        addExtra(netOfPin('O'), [X(c.x), X(c.y), X(o.x), X(o.y)]);
        ins.forEach((q, i) => { const P = pp.get(q.name); bustaps.push(`        <bustap x2="${X(P.x)}" y1="${X(spine[i].y)}" y2="${X(P.y)}" x1="${X(spine[i].x)}" />`); });
      }
      continue;
    }
    const netW = n => netOfPin(n)?.width ?? null;
    let info = iseSymbolFor(s, def, netW, modules);
    if (info.lib) {
      const lp = libPins(info.name);
      if (!lp || Object.entries(info.pins).some(([xp, ip]) => def.pins.some(q => q.name === xp) && (!lp[ip] || lp[ip][1] == null || lp[ip][2] == null))) info = { lib: false, name: `xl_${s.type}${s.params?.width > 1 ? `_w${s.params.width}` : ''}` };
    }
    if (info.hdl) {
      let base = String(s.params?.title || s.name || 'block').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'block';
      let nm = `xl_hdl_${base}`;
      if (hdlNames.has(lc(nm))) nm = `xl_hdl_${base}_${String(s.name).replace(/[^A-Za-z0-9_]/g, '_')}`;
      hdlNames.add(lc(nm));
      info.name = nm.replace(/_+/g, '_');
    }
    const orien = xaiToIseOrien(s.rot, s.mirror);
    const pinsSheet = symbolPins(s, modules, def);
    const iseName = info.name;
    let pinMap, localOf;
    if (info.lib) {
      const lp = libPins(iseName);
      pinMap = info.pins;
      localOf = xp => { const ip = pinMap[xp]; return ip && lp[ip] ? [lp[ip][1], lp[ip][2]] : null; };
      if (!blockdefs.has(lc(iseName))) blockdefs.set(lc(iseName), { name: iseName, timestamp: LIB_TS[iseName] || primTimestamp(iseName, family) || '2000-1-1T10:10:10', shapes: LIB_GFX[iseName] ? gfxShapes(LIB_GFX[iseName]) : boxShapes(lp) });
    } else {
      // custom symbol: the Silinx geometry, scaled (origin = bottom left corner of the unrotated symbol)
      // (a pin's name as ISE holds it, its module's port named so too, #1763)
      const pn = q => { const n = iseIdent(q.name); if (n !== q.name) renamed.add(`${iseName}'s pin '${q.name}' as '${n}'`); return n; };
      pinMap = Object.fromEntries(def.pins.map(q => [q.name, info.pins?.[q.name] ?? ((q.width ?? netW(q.name) ?? 1) > 1 ? `${pn(q)}(${(q.width ?? netW(q.name)) - 1}:0)` : pn(q))]));
      localOf = xp => { const q = def.pins.find(r => r.name === xp); return q ? [X(q.x), X(q.y - def.h)] : null; };
      const key = lc(iseName);
      const prev = customs.get(key);
      if (!prev) {
        const cdef = customDef(iseName, def, pinMap, stamp);
        customs.set(key, { name: iseName, sym: s, def, cdef, info, pinMap });
        blockdefs.set(key, cdef);
      } else if (info.hdl && (prev.sym.hdl || '') !== (s.hdl || '')) warn(`${s.name}: HDL block '${iseName}' differs from another block with the same name`);
    }
    // instance origin: lines the ISE pins up with the Silinx pins (library symbols: most pins; stubs for the others)
    const cands = new Map();
    for (const q of pinsSheet) {
      const l = localOf(q.name);
      if (!l) continue;
      const [dx, dy] = iseXform(orien, l[0], l[1]);
      const o = `${X(q.x) - dx},${X(q.y) - dy}`;
      cands.set(o, (cands.get(o) || 0) + (netOfPin(q.name) ? 10 : 1));
    }
    // (the ISE pins on no other net's wire or point, #1798; a library pin the Silinx symbol has not: on none)
    const own = pinsSheet.filter(q => localOf(q.name)).map(q => [...iseXform(orien, ...localOf(q.name)), conn(netOfPin(q.name))]);
    if (info.lib) for (const [ip, [, x, y]] of Object.entries(libPins(iseName))) if (!pinsSheet.some(q => pinMap[q.name] === ip)) own.push([...iseXform(orien, x, y), null]);
    let origin;
    if (cands.size) origin = pickOrigin(router, [...cands].sort((a, b) => b[1] - a[1]).map(c => c[0].split(',').map(Number)), own);
    else { const p0 = xform(s, def, 0, def.h); origin = [X(p0.x), X(p0.y)]; }
    placeBlock(router, origin, own);
    instances.push(`        <instance x="${origin[0]}" y="${origin[1]}" name="${xesc(s.name)}" orien="${orien}" />`);
    const bp = [];
    for (const q of pinsSheet) {
      const ip = pinMap[q.name];
      if (!ip) { if (netOfPin(q.name)) warn(`${s.name}: pin ${q.name} has no pin on ISE symbol '${iseName}'`); continue; }
      const net = netOfPin(q.name);
      const connected = conn(net);
      bp.push(connected ? `            <blockpin signalname="${xesc(sigOf.get(net))}" name="${xesc(ip)}" />` : `            <blockpin name="${xesc(ip)}" />`);
      if (connected) {
        const l = localOf(q.name);
        const [dx, dy] = iseXform(orien, l[0], l[1]);
        const P = [origin[0] + dx, origin[1] + dy], T = [X(q.x), X(q.y)];
        if (P[0] !== T[0] || P[1] !== T[1]) stubs.push({ net, P, T });
      }
    }
    // library pins the Silinx symbol does not have (CEO/TC of counters...) stay unconnected
    if (info.lib) for (const ip of Object.keys(libPins(iseName))) if (!Object.values(pinMap).includes(ip) || !pinsSheet.some(q => pinMap[q.name] === ip)) { if (!bp.some(l => l.includes(`name="${ip}"`))) bp.push(`            <blockpin name="${xesc(ip)}" />`); }
    // (a device primitive's attributes, as ISE writes a block's: the generics of its HDL, #1694)
    const at = (info.attrs || []).flatMap(([k, v, vt]) => [`            <attr value="${xesc(v)}" name="${xesc(k)}">`, '                <trait verilog="all:0 dp:1nosynth wsynop:1 wsynth:1" />',
      '                <trait vhdl="all:0 gm:1nosynth wa:1 wd:1" />', `                <trait valuetype="${xesc(vt)}" />`, '            </attr>']);
    blocks.push([`        <block symbolname="${xesc(iseName)}" name="${xesc(s.name)}">`, ...at, ...bp, '        </block>'].join('\n'));
  }

  // (the wires from the ISE pins not where the Silinx pins are, routed once every block is placed, #1798)
  routeStubs(router, stubs, addExtra);

  // ------------------------------------------------------------- HDL modules and symbols for the custom blockdefs
  for (const c of customs.values()) {
    const { name, sym, def, info, pinMap } = c;
    files.push({ path: `${name}.sym`, text: symFile(name, def, pinMap, stamp), kind: 'sym' });
    if (info.module) { warn(`'${name}': project module — ISE uses its HDL source and the ${name}.sym symbol (or regenerate it with Create Schematic Symbol)`); continue; }
    if (info.project) { warn(`'${name}': symbol of the ISE project (imported as an HDL block) — keep the project's own ${name}.sym and HDL source; ${name}.sym returned here only matches the Silinx drawing`); continue; }
    const mini = newDoc(name, lang);
    const s2 = { ...JSON.parse(JSON.stringify(sym)), id: 'S1', x: 200, y: 200, rot: 0, mirror: false, name: 'U1' };
    mini.symbols.push(s2);
    if (sym.type === 'hdlblock' && doc.hdl) {
      // the module's declarations the block's file needs: its context, generics, constants, types, functions (#1695),
      // and of its signals the block's own temporaries (of imported ISE library functions too)
      const h = blockHdlDecls(doc.hdl, sym.hdl, new Set(symbolPins(s2, modules).map(q => q.name)), lang);
      if (h) mini.hdl = h;
    }
    for (const q of symbolPins(s2, modules)) {
      const net = nl.pinNet.get(`${sym.id}/${q.name}`);
      const w = q.width ?? net?.width ?? 1;
      mini.ports.push({ id: `P${mini.ports.length + 1}`, name: iseIdent(q.name), dir: q.dir === 'out' ? 'out' : q.dir === 'inout' ? 'inout' : 'in', width: w, x: q.x, y: q.y });
    }
    const g = generateHdl(mini, { lang, modules, structural: false });
    const errs = g.diagnostics.filter(d => d.severity === 'error');
    if (errs.length) warn(`${name}: HDL module has errors: ${errs.map(d => d.message).join('; ')}`);
    files.push({ path: `${name}.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.code.replace(/Generated by Silinx from .*$/m, `Generated by Silinx for the ISE schematic symbol ${name}`), kind: 'hdl' });
  }
  if (customs.size) {
    const xs = [...customs.values()].filter(c => !c.info.module).map(c => c.name);
    if (xs.length) warn(`ISE symbols not in the Xilinx library: ${xs.join(', ')} — add the returned HDL (${lang === 'vhdl' ? '.vhd' : '.v'}) and .sym files to the ISE project`);
  }
  if (renamed.size) {
    const l = [...renamed];
    warn(`names written as identifiers, as ISE's names are ([A-Za-z_][A-Za-z0-9_]*; an escaped name cannot be one): ${l.slice(0, 6).join(', ')}${l.length > 6 ? `, … (${l.length} in all)` : ''}`);
  }

  // ------------------------------------------------------------- sheet: wires, net names, I/O markers
  const branches = [];
  for (const n of used) {
    const L = [];
    const segs = [];
    for (const wId of n.wires) {
      const w = doc.wires.find(q => q.id === wId);
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i], b = w.points[i + 1];
        if (a.x !== b.x && a.y !== b.y) { segs.push([X(a.x), X(a.y), X(b.x), X(a.y)], [X(b.x), X(a.y), X(b.x), X(b.y)]); } else segs.push([X(a.x), X(a.y), X(b.x), X(b.y)]);
      }
    }
    segs.push(...(extraWires.get(n) || []));
    if (!segs.length) continue;
    for (const lId of n.labels) {
      const l = doc.labels.find(q => q.id === lId);
      L.push(`            <attrtext style="alignment:SOFT-BCENTER;fontsize:28;fontname:Arial" attrname="Name" x="${X(l.x)}" y="${X(l.y)}" type="branch" />`);
    }
    for (const [x1, y1, x2, y2] of segs) if (x1 !== x2 || y1 !== y2) L.push(`            <wire x2="${x2}" y1="${y1}" y2="${y2}" x1="${x1}" />`);
    branches.push([`        <branch name="${xesc(sigOf.get(n))}">`, ...L, '        </branch>'].join('\n'));
  }
  const iomarkers = [], portDecl = [];
  for (const p of doc.ports) {
    const n = nl.portNet.get(p.id);
    const owner = n && portOwner.get(n);
    if (owner && owner.id !== p.id) { warn(`I/O marker '${p.name}' shares the net of '${owner.name}': not exported (ISE needs a buffer between two ports)`); continue; }
    const sn = n ? sigOf.get(n) : (p.width > 1 ? `${p.name}(${p.width - 1}:0)` : p.name);
    if (!n) { sigOf.set(p, sn); }
    portDecl.push(`        <port polarity="${p.dir === 'in' ? 'Input' : p.dir === 'out' ? 'Output' : 'BiDirectional'}" name="${xesc(sn)}" />`);
    iomarkers.push(`        <iomarker fontsize="28" x="${X(p.x)}" y="${X(p.y)}" name="${xesc(sn)}" orien="${iomarkerOrien(portSide(p))}" />`);
  }

  // ------------------------------------------------------------- sheet size
  let mx = 0, my = 0;
  const acc = (x, y) => { mx = Math.max(mx, x); my = Math.max(my, y); };
  for (const s of doc.symbols) { const b = symbolBox(s, modules); acc(X(b.x + b.w), X(b.y + b.h)); }
  for (const w of doc.wires) for (const p of w.points) acc(X(p.x), X(p.y));
  for (const p of doc.ports) { const b = portBox(p); acc(X(b.x + b.w), X(b.y + b.h)); }
  const size = SHEET_SIZES.find(([w, h]) => mx + 64 <= w && my + 64 <= h) || [Math.ceil((mx + 128) / 32) * 32, Math.ceil((my + 128) / 32) * 32];

  // ------------------------------------------------------------- XML
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>', '<drawing version="7">');
  out.push(`    <attr value="${xesc(family)}" name="DeviceFamilyName">`, '        <trait delete="all:0" />', '        <trait editname="all:0" />', '        <trait edittrait="all:0" />', '    </attr>');
  out.push('    <netlist>');
  for (const n of used) out.push(`        <signal name="${xesc(sigOf.get(n))}" />`);
  for (const p of doc.ports) if (!nl.portNet.get(p.id) && sigOf.has(p)) out.push(`        <signal name="${xesc(sigOf.get(p))}" />`);
  out.push(...portDecl);
  for (const d of blockdefs.values()) {
    out.push(`        <blockdef name="${xesc(d.name)}">`, `            <timestamp>${d.timestamp}</timestamp>`);
    for (const sh of d.shapes) out.push(shapeXml(sh, '            '));
    out.push('        </blockdef>');
  }
  out.push(...blocks);
  out.push('    </netlist>');
  out.push(`    <sheet sheetnum="1" width="${size[0]}" height="${size[1]}">`);
  out.push(...instances, ...branches, ...bustaps, ...iomarkers);
  out.push('    </sheet>', '</drawing>', '');
  return { xml: out.join('\n'), warnings, files };
}

// generic box graphics for a library symbol without recorded graphics
function boxShapes(lp) {
  const pts = Object.values(lp).filter(p => p[1] != null);
  const xs = pts.map(p => p[1]), ys = pts.map(p => p[2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 32, y1 = Math.max(...ys) + 32;
  const shapes = [{ kind: 'rect', x: x0 + 64, y: y0, w: Math.max(64, x1 - x0 - 128), h: y1 - y0 }];
  for (const [, x, y] of pts) shapes.push(x <= x0 ? { kind: 'line', x1: x, y1: y, x2: x + 64, y2: y } : { kind: 'line', x1: x, y1: y, x2: x - 64, y2: y });
  return shapes;
}
// blockdef of a Silinx-only symbol: its body rectangle and pin stubs, scaled
function customDef(name, def, pinMap, stamp) {
  const X = v => Math.round(v * S_OUT);
  const oy = def.h;
  const b = def.body || { x: 20, y: 0, w: def.w - 40, h: def.h };
  const shapes = [{ kind: 'rect', x: X(b.x), y: X(b.y - oy), w: Math.max(32, X(b.w)), h: Math.max(32, X(b.h)) }];
  for (const q of def.pins) {
    const bus = /\(/.test(pinMap[q.name] || '');
    const px = X(q.x), py = X(q.y - oy);
    const end = q.side === 'W' ? [X(b.x), py] : q.side === 'E' ? [X(b.x + b.w), py] : q.side === 'N' ? [px, X(b.y - oy)] : [px, X(b.y + b.h - oy)];
    if (end[0] !== px || end[1] !== py) shapes.push({ kind: 'line', x1: px, y1: py, x2: end[0], y2: end[1], bus });
  }
  return { name, timestamp: stamp, shapes, custom: true };
}
// ISE 14.x symbol file (.sym, XML) for a custom blockdef
function symFile(name, def, pinMap, stamp) {
  const X = v => Math.round(v * S_OUT);
  const oy = def.h;
  const cd = customDef(name, def, pinMap, stamp);
  const L = ['<?xml version="1.0" encoding="UTF-8"?>', `<symbol version="7" name="${xesc(name)}">`, '    <symboltype>BLOCK</symboltype>', `    <timestamp>${stamp}</timestamp>`];
  for (const q of def.pins) L.push(`    <pin polarity="${q.dir === 'out' ? 'Output' : q.dir === 'inout' ? 'BiDirectional' : 'Input'}" x="${X(q.x)}" y="${X(q.y - oy)}" name="${xesc(pinMap[q.name])}" />`);
  L.push('    <graph>');
  const r = cd.shapes[0];
  L.push(shapeXml(r, '        '));
  L.push(`        <attrtext style="alignment:BCENTER;fontsize:56;fontname:Arial" attrname="SymbolName" x="${Math.round(r.x + r.w / 2)}" y="${r.y - 8}" type="symbol" />`);
  for (const q of def.pins) {
    const sh = cd.shapes.find(s => s.kind === 'line' && s.x1 === X(q.x) && s.y1 === X(q.y - oy));
    if (sh) L.push(shapeXml(sh, '        '));
    const tx = q.side === 'E' ? X(q.x) - 72 : X(q.x) + 72;
    L.push(`        <text style="${q.side === 'E' ? 'alignment:RIGHT;' : ''}fontsize:24;fontname:Arial" x="${tx}" y="${X(q.y - oy)}">${xesc(pinMap[q.name])}</text>`);
  }
  L.push('    </graph>', '</symbol>', '');
  return L.join('\n');
}
