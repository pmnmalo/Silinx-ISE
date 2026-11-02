// Silinx schematic documents (<name>.sch.json): model, symbol library, connectivity,
// HDL generation and HDL -> schematic import. Isomorphic (no DOM).
//
//   import { SYMBOLS, newDoc, normalizeDoc, symbolDef, symbolPins, netlist, generateHdl,
//            schematicFromHdl, modulesFromLibrary } from '/core/schdoc.js';
//
// Document format (version 1, all coordinates in sheet pixels on a GRID = 10 px grid):
//   { version: 3, name, lang: 'vhdl'|'verilog', sheet: { w, h },
//     symbols: [{ id, type, x, y, rot: 0|90|180|270, mirror: bool, name, params: {...}, hdl?: string }],
//     wires:   [{ id, points: [{x,y},...], bus?: bool, curve?: [{u,v}] }],   // curve: its own drawn curve (#1144, core/schcurve.js)
//     labels:  [{ id, x, y, net }],          // net name attached to the wire point (x,y)
//     ports:   [{ id, name, dir: 'in'|'out'|'inout', width, x, y, type?, side? }],   // I/O markers
//              (side: where the marker's body is from its connection point, W N E S; by default W for
//              an input, E for an output or a bidirectional port, #296)
//     hdl?:    { lang, context, generics: [{ name, type, default }], decls, arch },  // verbatim HDL
//     generatedFile?: 'src/name.vhd',
//     description?: 'text',                 // shown on the sheet, a comment in the generated HDL
//     wireStyle?: 'curved' }                // the wires drawn as curves (#1144); else the technical drawing
//
// (x, y) of a symbol is the top-left corner of its (rotated) bounding box; rotation is clockwise.
// Connectivity is geometric, at the ends only (#678): wire end points, pins and I/O markers at the
// same point connect; a wire passing over a pin or another wire (a segment or a bend of it) does not.
// A connection made in the middle of a wire (a wire ended on its segment, a symbol dropped onto it)
// splits that wire there (splitWiresAt). Labels attach to the wire under them; labels (and I/O
// markers) with the same name join their nets.
import { VHDL93_WORDS, VERILOG_WORDS, reservedError } from './reserved.js';
import { BLOCK_MARK, blockMarkOf, declaredIn, generateHdl, isBlockSymbol } from './schdoc-hdl.js';
import { mergeNetWires } from './schdoc-place.js';
import { normalizeCurve, splitCurve } from './schcurve.js';
import { moveTaps, widenBuffers, widenJoins, widenMuxes } from './schdoc-upgrade.js';
import { symbolDiff } from './schdoc-modsym.js';
import {
  modulesFromLibrary, schematicFromHdl
} from './schdoc-from-hdl.js';
import {
  FF_INPUTS, MUX_INPUTS, PORT_SIDES, ROT_OK, SIDE_V, SYMBOLS, SYMBOL_CATEGORIES, arithIo, attrParam, defaultParams,
  ffVariant, findMod, freePortName, gateVariant, int, normModules, oppositeSide, portBox, portSide, rotSize, symbolBox,
  symbolDef, symbolParams, symbolPins, symbolTypeName, turnSide, xform, xformSide
} from './schdoc-symbols.js';
import { clone, lineStarts } from './util.js';
export { lineStarts };   // (core/util.js's)
export {
  FF_INPUTS, MUX_INPUTS, PORT_SIDES, SIDE_V, SYMBOLS, SYMBOL_CATEGORIES, arithIo, attrParam, defaultParams, ffVariant,
  findMod, freePortName, gateVariant, int, normModules, oppositeSide, portBox, portSide, rotSize, symbolBox, symbolDef,
  symbolParams, symbolPins, symbolTypeName, turnSide, xform, xformSide
};
export { BUF_OLD_W, COMPARE_OPS, COMPARE_SYM, compareOps, comparePin, constWidth, JOIN_BAR, JOIN_OLD_W, JOIN_W, MUX_BODY_W, MUX_OLD_BODY_W, MUX_SEL_X } from './schdoc-symbols.js';
export { followPins, otherPins, repinSymbol } from './schdoc-repin.js';
export { symbolDiff, updateModuleSymbols, updatedPorts } from './schdoc-modsym.js';
export {
  modulesFromLibrary, schematicFromHdl
};
export {
  mergeNetWires
};
export {
  BLOCK_MARK, blockMarkOf, generateHdl, isBlockSymbol
};

export const GRID = 10;
// 2 (#301): the M4_1's and DEMUX's select bits on pins of their own (a document of version 1 keeps its bus S)
// 3 (#678): connections at the wires' ends only (a document of version 2 has its wires split where
// they connected in their middle: a pin, a marker, a wire end or a bend on them)
// 4 (#1136): the multiplexers as wide as the DEMUX (a document of version 3 has them widened, their outputs'
// connections moved with them: core/schdoc-upgrade.js)
// 5 (#1726): the bus tap drawn as ISE's, its input on its bus a grid step from its output's line (a document of
// version 4 has what met its input taken there: core/schdoc-upgrade.js)
// 6 (#1910): the bus join 60 px wide, its inputs' leads long enough for their bits' labels (a document of version 5 has
// its joins' outputs moved, what met them following: core/schdoc-upgrade.js)
export const DOC_VERSION = 7;

export const snap = v => Math.round(v / GRID) * GRID;
export const r10 = v => Math.ceil(v / GRID) * GRID;
const isNum = v => typeof v === 'number' && Number.isFinite(v);

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
  const before1136 = !(+doc.version >= 4);
  const before1726 = !(+doc.version >= 5);
  const before1910 = !(+doc.version >= 6);
  const before1988 = !(+doc.version >= 7);
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
    // a VCC / GND saved before it had a Width (#953): none, it keeps taking the width of its net
    if ((o.type === 'vcc' || o.type === 'gnd') && !('width' in (s.params || {}))) delete o.params.width;
    // an ENCODER saved without its Type, from before priority was the default (#1553): one-hot, as it was
    if (o.type === 'encoder' && !('mode' in (s.params || {}))) o.params.mode = 'one-hot';
    if (s.hdl != null) o.hdl = String(s.hdl);
    uid(o, 'S'); return o;
  });
  doc.wires = (Array.isArray(doc.wires) ? doc.wires : []).filter(w => w && Array.isArray(w.points) && w.points.length >= 2).map(w => {
    const pts = [];
    for (const p of w.points) { const q = { x: snap(+p.x || 0), y: snap(+p.y || 0) }; const l = pts[pts.length - 1]; if (!l || l.x !== q.x || l.y !== q.y) pts.push(q); }
    const o = { id: w.id, points: pts };
    if (w.bus) o.bus = true;
    // (its own curve, #1144: drawn when the schematic is drawn with curves)
    const c = normalizeCurve(w.curve);
    if (c) o.curve = c;
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
  // (drawn with curves, #1144; else the technical drawing)
  if (doc.wireStyle !== 'curved') delete doc.wireStyle;
  delete doc.importDiagnostics;
  // (a document of version 2 whose module symbols are not known yet stays at version 2, converted when they are:
  // its multiplexers then too)
  const mods = normModules(modules);
  const stays2 = before678 && doc.symbols.some(s => symbolDef(s, mods).missing);
  if (before1136 && !stays2) widenMuxes(doc, mods);
  if (before1726 && !stays2) moveTaps(doc, mods);
  if (before1910 && !stays2) widenJoins(doc, mods);
  if (before1988 && !stays2) widenBuffers(doc, mods, before678 ? pts => splitWiresAt(doc, pts) : null);
  if (before678) {
    joinOnWires(doc, mods);
    if (stays2) doc.version = 2;
  }
  // a module's instance saved without its ports (before #1183, or made elsewhere): the module's, as it is drawn now
  for (const s of doc.symbols) {
    if (s.type !== 'module' || Array.isArray(s.params.ports)) continue;
    const m = findMod(mods, s.params.module);
    if (m) s.params.ports = (m.ports || []).map(q => ({ name: q.name, dir: q.dir || 'in', width: q.width ?? 1 }));
  }
  return doc;
}

// ISE style bus names: "data(7:0)" / "data[7:0]" / "data<7:0>" -> { base: 'data', width: 8, msb: 7, lsb: 0 }; a bit of a
// bus, "data(3)" (#1688): { base: 'data', width: 1, msb: 3, lsb: 3, bit: true }
export function parseNetName(s) {
  // (an escaped identifier, \opcode[0], #1697: a name, its brackets not a range)
  if (/^\s*\\[!-~]+\s*$/.test(String(s ?? ''))) return { base: String(s).trim(), width: null };
  const m = /^\s*([A-Za-z_][\w$]*)\s*(?:[([<]\s*(\d+)\s*(?:(?::|downto|to)\s*(\d+)\s*)?[)\]>])?\s*$/i.exec(String(s ?? ''));
  if (!m) return { base: String(s ?? '').trim(), width: null, bad: true };
  if (m[2] != null && m[3] == null) return { base: m[1], width: 1, msb: +m[2], lsb: +m[2], bit: true };
  return { base: m[1], width: m[2] != null ? Math.abs(+m[2] - +m[3]) + 1 : null, ...(m[2] != null ? { msb: +m[2], lsb: +m[3] } : {}) };
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
export const key = (x, y) => `${x},${y}`;
export function onSeg(p, a, b) {
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
  const doc = docIn && +docIn.version >= DOC_VERSION ? docIn : normalizeDoc(docIn, { modules });
  const ci = doc.lang === 'vhdl';
  const nk = s => (ci ? String(s).toLowerCase() : String(s));
  // a signal declared in the HDL kept in the schematic (its declarations, a schematic made from HDL)
  let declSet = null;
  const declaredHere = name => { if (!String(doc.hdl?.decls || '').trim()) return false; declSet ||= declaredIn(doc.hdl.decls, doc.hdl.lang || doc.lang); return declSet.has(nk(name)); };
  const diags = [], outOfDate = [];
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
    // its symbol out of date: its module's ports changed (#1183)
    const od = symbolDiff(s, modules);
    if (od) outOfDate.push([s, od]);
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
  // a name of some bits of a bus, a(0) or a(3:2) of the bus a (#1688, as ISE names a bus tap's wire): a net of its own,
  // those bits of the bus, joined by name with the same bits; the bus's range: its I/O marker's, else its widest name of
  // several bits, else (named by its bits only) all of them
  const whole = new Map();   // base -> { msb, lsb } of the bus
  for (const p of doc.ports) if (!whole.has(nk(p.name))) whole.set(nk(p.name), { msb: Math.max(1, int(p.width, 1)) - 1, lsb: 0, port: true });
  for (const L of labelOf.values()) {
    const k = nk(L.base), w = whole.get(k);
    if (L.msb == null || L.msb < L.lsb || w?.port) continue;
    if (!w || (L.width > 1 && L.width > w.msb - w.lsb + 1)) whole.set(k, { msb: L.msb, lsb: L.lsb, wide: L.width > 1 });
    else if (L.width === 1 && !w.wide) whole.set(k, { msb: Math.max(w.msb, L.msb), lsb: Math.min(w.lsb, L.lsb) });
  }
  for (const L of labelOf.values()) {
    const w = whole.get(nk(L.base));
    if (L.msb != null && w && !(L.msb === w.msb && L.lsb === w.lsb)) L.part = { base: L.base, msb: L.msb, lsb: L.lsb };
  }
  const partKey = L => `${nk(L.base)}(${L.part.msb}:${L.part.lsb})`;
  // same names join (labels and I/O markers)
  const byName = new Map();
  for (const [id, L] of labelOf) { const k = L.part ? partKey(L) : nk(L.base); if (byName.has(k)) dsu.union(byName.get(k), id); else byName.set(k, id); }
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
  const wrongWay = [];   // [bus tap's O, the bus's net] (#1702)
  for (const { g } of sorted) {
    let eps = g.filter(id => pinInfo.has(id)).map(id => pinInfo.get(id));
    const wires = g.filter(id => id.startsWith('w:')).map(id => id.slice(2));
    const labels = g.filter(id => id.startsWith('l:')).map(id => labelOf.get(id));
    if (!eps.length && !wires.length && !labels.length) continue;
    // a bus tap the wrong way round (#1702): its output O on a wider bus (driven by an input marker or an output, or
    // named) is not connected to it, the bus keeping its width (a wider input it drives: a width mismatch, below)
    const taps = eps.filter(e => e.kind === 'pin' && e.pin === 'O' && isNum(e.width) && symById.get(e.sym)?.type === 'slice').filter(t => {
      const w = [...eps.filter(e => e !== t && (e.kind === 'pin' ? e.dir === 'out' : e.dir === 'in')).map(e => e.width), ...labels.map(L => L.width)].filter(isNum);
      return w.length && Math.max(...w) > Math.max(t.width, 1);
    });
    if (taps.length) eps = eps.filter(e => !taps.includes(e));
    const ports = eps.filter(e => e.kind === 'port');
    const net = { id: `N${nets.length + 1}`, name: null, auto: false, width: null, endpoints: eps, wires, labels: labels.map(L => L.label.id), ports: ports.map(e => e.port), drivers: [] };
    // name: I/O marker > label > auto
    const lnames = [...new Set(labels.map(L => L.base))];
    if (ports.length) {
      net.name = ports.find(p => p.dir === 'in')?.name || ports[0].name;
      const bad = lnames.filter(n => nk(n) !== nk(net.name) && !ports.some(p => nk(p.name) === nk(n)));
      if (bad.length) diags.push({ severity: 'warning', message: `net of I/O marker '${net.name}' also named ${bad.map(b => `'${b}'`).join(', ')} (marker name used)`, ref: { kind: 'label', id: labels[0].label.id }, x: labels[0].label.x, y: labels[0].label.y });
    } else if (labels.some(L => L.part)) {
      // (bits of a bus, #1688: their name as written, a(0); a bus's own name on it too, or other bits: several names)
      const keys = new Set(labels.map(L => (L.part ? partKey(L) : nk(L.base))));
      const P = labels.find(L => L.part).part;
      net.part = { ...P };
      net.name = `${P.base}(${P.msb === P.lsb ? P.msb : `${P.msb}:${P.lsb}`})`;
      if (keys.size > 1) diags.push({ severity: 'error', message: `net has several names: ${[...new Set(labels.map(L => L.label.net))].join(', ')}`, ref: { kind: 'label', id: labels[0].label.id }, x: labels[0].label.x, y: labels[0].label.y });
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
    let drv = eps.filter(e => (e.kind === 'pin' && e.dir === 'out') || (e.kind === 'port' && e.dir === 'in'));
    // a bus tap is a connector, as in ISE (#1796): its bit wire driven by something else (an input marker, a symbol's
    // output) drives those bits of its bus, the tap's output O no driver of it then
    const tapOuts = drv.filter(e => e.kind === 'pin' && e.pin === 'O' && symById.get(e.sym)?.type === 'slice');
    if (tapOuts.length && drv.length > tapOuts.length) { net.tapsIn = tapOuts.map(e => e.sym); drv = drv.filter(e => !tapOuts.includes(e)); }
    net.drivers = drv;
    net.width = portW[0] ?? lw[0] ?? drv.find(e => isNum(e.width))?.width ?? (cands.length ? Math.max(...cands) : (wires.some(id => doc.wires.find(w => w.id === id)?.bus) ? null : 1));
    if (net.width == null) net.width = 1;
    // a bus named with its indices, not from 0 (d(7:4), #1689): declared with them; an I/O marker's net keeps 0
    const rng = !ports.length && labels.find(L => L.lsb != null && L.msb > L.lsb && L.width === net.width);
    if (rng && rng.lsb > 0) net.range = { msb: rng.msb, lsb: rng.lsb };
    const mism = new Set(cands);
    if (mism.size > 1) {
      const where = pinW.find(e => e.width !== net.width) || eps[0];
      diags.push({ severity: 'error', message: `width mismatch on net '${net.name}': ${[...mism].join(' vs ')} bits`, ref: refOf(where, symById), x: where?.x, y: where?.y, net: net.name });
    }
    const pt = eps[0] || (labels[0] && labels[0].label) || doc.wires.find(w => w.id === wires[0])?.points[0];
    // drivers: tri-state outputs (and bidirectional pins / markers) may share a net, a bus; an ordinary
    // output or an input marker must be its only driver
    const outs = eps.filter(e => e.dir === 'out' && e.kind === 'pin' && !e.tri && !(net.tapsIn && tapOuts.includes(e)));
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
    else if (eps.length === 1 && (wires.length || labels.length) && !net.part && !(labels.length && byNameCount(labels, labelOf, nk) > 0)) {
      const e = eps[0];
      // (not a signal of the HDL kept in the schematic, declared there: that HDL uses it, e.g. a
      // testbench's task reading an instance's output, #225)
      if ((e.kind === 'pin' || !wires.length) && !(labels.length && declaredHere(net.name)))
        diags.push({ severity: 'warning', message: `net '${net.name}' connects only ${epName(e, symById, doc)}`, ref: refOf(e, symById), x: e.x, y: e.y, net: net.name });
    }
    nets.push(net);
    for (const t of taps) wrongWay.push([t, net]);
    for (const e of eps) { if (e.kind === 'pin') pinNet.set(`${e.sym}/${e.pin}`, net); else portNet.set(e.port, net); }
    for (const w of wires) wireNet.set(w, net);
    for (const L of labels) labelNet.set(L.label.id, net);
  }
  // the bus taps the wrong way round: their O on a net of its own, an error on the tap
  for (const [t, bus] of wrongWay) {
    do auto++; while (used.has(nk(`net_${auto}`)));
    const net = { id: `N${nets.length + 1}`, name: `net_${auto}`, auto: true, width: t.width, endpoints: [t], wires: [], labels: [], ports: [], drivers: [t] };
    nets.push(net);
    pinNet.set(`${t.sym}/${t.pin}`, net);
    const s = symById.get(t.sym);
    diags.push({ severity: 'error', message: `bus tap ${s.name} is the wrong way round: its output O (${t.width} bit${t.width > 1 ? 's' : ''}) touches the ${bus.width}-bit bus '${bus.name}' and is not connected to it; the bus goes to its input I`, ref: { kind: 'symbol', id: s.id, pin: 'O' }, x: t.x, y: t.y, net: bus.name });
  }
  // a bus tap of bits its bus does not have (#1690; one the wrong way round has its own error)
  const reversed = new Set(wrongWay.map(([t]) => t.sym));
  for (const s of doc.symbols) {
    if (s.type !== 'slice' || reversed.has(s.id)) continue;
    const bus = pinNet.get(`${s.id}/I`), ms = int(s.params.msb, 0), ls = int(s.params.lsb, 0);
    if (!bus || bus.endpoints.length + bus.wires.length + bus.labels.length <= 1) continue;
    // (its bits by the bus's indices: d(7:4)'s, #1689; else from 0)
    const top = bus.range?.msb ?? bus.width - 1, bottom = bus.range?.lsb ?? 0;
    if (Math.max(ms, ls) <= top && Math.min(ms, ls) >= bottom) continue;
    diags.push({ severity: 'error', message: `bus tap ${s.name} takes bit${ms === ls ? ` ${ms}` : `s ${ms}..${ls}`}, outside its bus '${bus.name}' (${top > bottom ? `${top} downto ${bottom}` : `one bit, ${bottom}`})`, ref: { kind: 'symbol', id: s.id, pin: 'I' }, x: s.x, y: s.y, net: bus.name });
  }
  // the bits of a bus named by their bus (#1688): their bus's net (null: a bus of no net of its own, made of them), its
  // bits in its range; a part driven drives its bus and the reverse ("no driver" said of neither)
  const busOf = new Map();   // base -> the bus's net
  for (const n of nets) if (!n.part && !n.auto) { const k = nk(n.name); if (whole.has(k) && !busOf.has(k)) busOf.set(k, n); }
  const parts = nets.filter(n => n.part);
  for (const n of parts) {
    const k = nk(n.part.base), b = busOf.get(k) || null, w = whole.get(k);
    n.part.bus = b;
    const top = b ? (b.range?.msb ?? b.width - 1) : w.msb, bottom = b ? (b.range?.lsb ?? 0) : w.lsb;
    if (n.part.msb > top || n.part.lsb < bottom) {
      const L = doc.labels.find(l => n.labels.includes(l.id));
      diags.push({ severity: 'error', message: `net name '${n.name}' is outside its bus '${b ? b.name : n.part.base}' (${top} downto ${bottom})`, ref: { kind: 'label', id: L?.id }, x: L?.x, y: L?.y, net: n.name });
    }
  }
  const driven = n => n.drivers.length > 0;
  const quiet = new Set([...parts.filter(n => !driven(n) && n.part.bus && driven(n.part.bus)).map(n => n.name),
    ...[...busOf.values()].filter(b => !driven(b) && parts.some(n => n.part.bus === b && driven(n))).map(b => b.name)]);
  // (a bus with bits named: connected to them by name)
  const withBits = new Set(parts.map(n => n.part.bus?.name).filter(Boolean));
  for (let i = diags.length - 1; i >= 0; i--) {
    const d = diags[i];
    if ((/^net '.*' has no driver/.test(d.message) && quiet.has(d.net)) || (/^net '.*' connects only/.test(d.message) && withBits.has(d.net))) diags.splice(i, 1);
  }
  // the buses driven through their taps from their bits (#1796): driven (no "no driver"), not by their own driver too
  const intoBus = new Map();   // the bus's net -> the taps driving it
  for (const n of nets) for (const id of n.tapsIn || []) {
    const bus = pinNet.get(`${id}/I`);
    if (bus && bus !== n) { let l = intoBus.get(bus); if (!l) intoBus.set(bus, l = []); l.push(id); }
  }
  for (const [bus, ids] of intoBus) {
    if (bus.drivers.length) {
      const s = symById.get(ids[0]);
      diags.push({ severity: 'error', message: `bus '${bus.name}' is driven by ${bus.drivers.map(e => epName(e, symById, doc)).join(', ')} and, through bus tap${ids.length > 1 ? 's' : ''} ${ids.map(i => symById.get(i).name).join(', ')}, by ${ids.length > 1 ? 'their' : 'its'} bit wire${ids.length > 1 ? 's' : ''}`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y, net: bus.name });
    }
    bus.tapsDrive = ids;
    for (let i = diags.length - 1; i >= 0; i--) if (diags[i].net === bus.name && /^net '.*' has no driver/.test(diags[i].message)) diags.splice(i, 1);
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
  // an instance whose module's ports changed (#1183): a warning (Update Symbol), an error for a pin connected to a port
  // the module no longer has, or has on the other side
  for (const [s, od] of outOfDate) {
    const what = [od.added.length && `added ${od.added.join(', ')}`, od.removed.length && `removed ${od.removed.join(', ')}`,
      od.turned.length && `direction changed ${od.turned.join(', ')}`].filter(Boolean).join('; ');
    diags.push({ severity: 'warning', message: `${s.name}: the symbol of module '${s.params.module}' is out of date (its ports: ${what}): Update Symbol`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y });
    for (const n of [...od.removed, ...od.turned]) {
      const net = pinNet.get(`${s.id}/${n}`);
      if (net && net.endpoints.length + net.wires.length + net.labels.length > 1) diags.push({ severity: 'error', message: `${s.name}: pin ${n} is connected, but module '${s.params.module}' ${od.removed.includes(n) ? 'no longer has that port' : 'has that port in the other direction now'}: Update Symbol, then connect it again`, ref: { kind: 'symbol', id: s.id, pin: n }, x: s.x, y: s.y });
    }
  }
  // a bus tap takes bits MSB downto LSB (#1691): its MSB below its LSB, its HDL would be a slice against its bus's
  // direction (a(1 to 2) of a(3 downto 0), a[1:2] of a[3:0]), which neither language allows
  for (const s of doc.symbols) {
    if (s.type !== 'slice' || int(s.params.msb, 0) >= int(s.params.lsb, 0)) continue;
    diags.push({ severity: 'error', message: `bus tap ${s.name}: its MSB (${int(s.params.msb, 0)}) is below its LSB (${int(s.params.lsb, 0)}): a bus tap takes the bits MSB downto LSB`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y });
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
      const t = { id: nid(), points: tail };
      if (w.bus) t.bus = true;
      // (its own curve shared between the two, #1144)
      const hc = { points: head };
      splitCurve(w, hc, t, p);
      w.points = head;
      if (hc.curve) w.curve = hc.curve;
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
export const rsvd = n => reservedError(n, { sv: false });
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
export const vhdlBits = (bits, scalar) => (scalar ? `'${bits.toUpperCase()}'` : `"${bits.toUpperCase()}"`);
export const vlogBits = bits => `${bits.length}'b${bits}`;

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
    // (a VHDL extended identifier, \t[0]\, a doubled backslash in it, #1809)
    if (vh && c === '\\' && /^\\(?:[^\\\n]|\\\\)+\\/.test(text.slice(i, text.indexOf('\n', i) < 0 ? n : text.indexOf('\n', i)))) {
      i++;
      while (i < n && !(text[i] === '\\' && text[i + 1] !== '\\')) i += text[i] === '\\' ? 2 : 1;
      i++;
      const raw = text.slice(s, i);
      toks.push({ v: raw.toLowerCase(), raw, s, e: i, k: 'id' }); continue;
    }
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

export function offsetOf(ls, loc) { if (!loc) return -1; return (ls[loc.line - 1] ?? 0) + (loc.col || 1) - 1; }
export function tokAt(toks, off) { let lo = 0, hi = toks.length; while (lo < hi) { const m = (lo + hi) >> 1; if (toks[m].e <= off) lo = m + 1; else hi = m; } return lo; }
export function skipParen(toks, i) {
  // toks[i] should be '(' ; returns index after the matching ')'
  if (toks[i]?.v !== '(') return i;
  let d = 0;
  for (; i < toks.length; i++) { if (toks[i].v === '(') d++; else if (toks[i].v === ')') { d--; if (d === 0) return i + 1; } }
  return i;
}
export function toSemi(toks, i) {
  let d = 0;
  for (; i < toks.length; i++) {
    const v = toks[i].v;
    if (v === '(' || v === '[' || v === '{') d++;
    else if (v === ')' || v === ']' || v === '}') d--;
    else if (v === ';' && d <= 0) return i + 1;
  }
  return i;
}
export function stripComments(s, lang) {
  return lang === 'vhdl' ? s.replace(/--[^\n]*/g, '') : s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
export const squash = s => s.replace(/\s+/g, ' ').trim();

// re-indent a verbatim slice whose first line started at column `col` (1-based)
export function dedent(text, col = 1) {
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
export const indent = (text, pad) => String(text).split('\n').map(l => (l.trim() ? pad + l : '')).join('\n');

// The text of a statement [s0, e0) with its comments (#225: an HDL block keeps them): the comment
// lines just above it and the comment ending its last line; not the comments the generated HDL
// writes itself (a block's title line, the file's header, a block entity's mark), so that a module
// made again from its generated HDL does not take them. Verilog: also an attribute (* … *) before it.
// Returns [s, e].
export function withComments(text, s0, e0, lang) {
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
// Verilog statement extent (token index -> index after the statement)
export function vStmt(toks, i) {
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
export function vStmtStart(toks, i) {
  let j = i;
  while (j > 0 && !V_BOUNDARY.has(toks[j - 1].v)) j--;
  // skip a label after begin / end ( "begin : name" ) - not expected at module level
  return j;
}

// ===================================================================== IR expression printers
export function prVlog(e) {
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
export function prVhdl(e) {
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
export const unparen = s => (/^\(.*\)$/.test(s) && balanced(s.slice(1, -1)) ? s.slice(1, -1) : s);
function balanced(s) { let d = 0; for (const c of s) { if (c === '(') d++; else if (c === ')') { d--; if (d < 0) return false; } } return d === 0; }

export function typeTextVhdl(t) {
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
export function rangeTextVlog(t) {
  if (!t || !t.range) return '';
  return `[${unparen(prVlog(t.range.left))}:${unparen(prVlog(t.range.right))}]`;
}

