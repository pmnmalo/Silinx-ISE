// Silinx - a schematic made from HDL (#405: out of schdoc.js): an elaborated module drawn as a schematic document
// (schematicFromHdl: its ports as I/O markers, its instances as module symbols, its logic as gates, multiplexers,
// flip-flops and HDL blocks where no gate fits, placed and routed by schdoc-place.js), and the modules of a compiled
// library as module symbols' pins (modulesFromLibrary). schdoc.js re-exports them. Isomorphic ES module: no DOM and
// no Node APIs.
import { blockMarkOf, schName } from './schdoc-hdl.js';
import { clocksOf } from './schematic.js';
import { elaborate } from './elaborate.js';
import { placeAndRoute } from './schdoc-place.js';
import {
  constBits, defaultParams, findMod, lineStarts, newDoc, normModules, offsetOf, prVhdl, prVlog,
  rangeTextVlog, skipParen, squash, stripComments, tokAt, tokenize, typeTextVhdl, unparen, validIdent,
} from './schdoc.js';
import { mountGateConversion } from './schdoc-gates.js';
import { activeVerilog, includeOf, mountSourcePieces } from './schdoc-source.js';

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
export function bitsValue(bits) {
  if (/[xz]/.test(bits)) return `0b${bits}`;
  if (bits.length === 1) return bits;
  if (bits.length % 4 === 0) return `0x${BigInt('0b' + bits).toString(16).toUpperCase().padStart(bits.length / 4, '0')}`;
  return `0b${bits}`;
}

// HDL blocks that write one signal (#1715: a vector driven part by part, assign y[3:0] = …; assign y[7:4] = …;, or
// y(3 downto 0) <= …; y(7 downto 4) <= …;) would be its net's drivers, one each: they become one block, the first one,
// holding their statements in order, its pins theirs (a signal it writes is not an input of it). symbols, nets: as
// schematicFromHdl builds them (changed in place).
function mergePartDrivers(symbols, nets, nk) {
  const blocks = symbols.filter(s => s.type === 'hdlblock');
  const order = new Map(blocks.map((s, k) => [s, k]));
  const root = new Map(blocks.map(s => [s, s]));
  const top = s => { while (root.get(s) !== s) s = root.get(s); return s; };
  const writer = new Map();
  for (const s of blocks) for (const q of s.params.outputs) {
    const t = writer.get(nk(q.name));
    if (!t) { writer.set(nk(q.name), s); continue; }
    const [a, b] = [top(t), top(s)].sort((x, y) => order.get(x) - order.get(y));
    if (a !== b) root.set(b, a);
  }
  const into = new Map();         // a block merged: its id -> the block of its group
  for (const s of blocks) {
    const g = top(s);
    if (g === s) continue;
    into.set(s.id, g);
    g.hdl = `${g.hdl}\n${s.hdl}`;
    for (const q of s.params.outputs) {
      const o = g.params.outputs.find(x => nk(x.name) === nk(q.name));
      if (!o) g.params.outputs.push(q); else if (q.reg) o.reg = true;
    }
    for (const q of s.params.inputs) if (!g.params.inputs.some(x => nk(x.name) === nk(q.name))) g.params.inputs.push(q);
  }
  if (!into.size) return;
  for (const g of new Set(into.values())) {
    const outs = new Set(g.params.outputs.map(q => nk(q.name)));
    g.params.inputs = g.params.inputs.filter(q => !outs.has(nk(q.name)));
    // (a clock first, as each block has them)
    g.params.inputs.sort((x, y) => !!y.clock - !!x.clock);
  }
  const key = e => (e.sym ? `${e.sym}/${e.pin}` : `port/${e.port}`);
  for (const n of nets.values()) {
    const at = e => (e.sym && into.has(e.sym) ? { ...e, sym: into.get(e.sym).id } : e);
    const drv = new Set(n.drivers.map(e => key(at(e))));
    const seen = new Set();
    n.eps = n.eps.map(at).filter(e => !seen.has(key(e)) && seen.add(key(e)));
    n.drivers = n.eps.filter(e => drv.has(key(e)));
  }
  for (let k = symbols.length - 1; k >= 0; k--) if (into.has(symbols[k].id)) symbols.splice(k, 1);
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
  // (a signal of a generate's block, g[0].w, is not; an escaped identifier the module declares, \t[0] , is, #1809)
  const declared = new Set((mod?.decls || []).map(d => nk(d.name)));
  for (const s of inst.signals) if (!/[.[]/.test(s.name) || declared.has(nk(s.name))) sigByName.set(nk(s.name), s);
  const moduleLevel = s => s && sigByName.get(nk(s.name)) === s;
  // (a null range, a port of width 0 with its generics' defaults, #1717: drawn of width 1, as normalizeDoc keeps a
  // marker, its type written as the module has it)
  const W = s => Math.max(1, s?.t?.w ?? 1);

  let archTok = -1;               // VHDL: the token 'architecture' of the module's architecture
  // ---- source text pieces
  const itf = ci && entText ? vhdlInterface(entText, mod) : { generics: [], ports: new Map() };
  const typeText = new Map();     // name -> type text (VHDL)
  let toks = [], ls = [];
  // (Verilog: the text as the compiler reads it, the `ifdef branches not taken and the directives blanked, #1716)
  const read = archText && !ci ? activeVerilog(archText, includeOf(opts.sources)) : archText;
  if (archText) { toks = tokenize(read, lang); ls = lineStarts(archText); }
  const { itemSpan } = mountSourcePieces({
    inst, archText, read, ci, diags, doc, entText, itf, lang, ls, mod, toks,
    typeText, setArchTok: (v) => { archTok = v; }
  });

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
  // (Verilog: an escaped identifier, \opcode[0] , named with its backslash, #1697: generateHdl writes it escaped)
  // (VHDL: an extended identifier, \t[0]\, named so too, its closing backslash dropped, #1809)
  const vhdlName = n => (/^\\.+\\$/.test(n) ? schName(n, 'vhdl') : n);
  const sp = name => (ci ? vhdlName(spell.get(String(name).toLowerCase()) ?? name) : validIdent(name, 'verilog') || /^\\/.test(name) ? name : `\\${name}`);
  if (!opts.name) doc.name = sp(doc.name);
  const modsN = normModules(opts.modules);

  // ---- connectivity being built: net name -> { width, drivers: [ep], sinks: [ep] } ; ep = { sym, pin } | { port }
  const nets = new Map();
  const netOf = (name, width) => { let n = nets.get(nk(sp(name))); if (!n) nets.set(nk(sp(name)), n = { name, width, eps: [], drivers: [] }); return n; };
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

  // ---- type classes for gate conversion (schdoc-gates.js)
  const { clsOfSig, exprToGates, materialise, sigOfRef, triParts } = mountGateConversion({
    W, addSym, anonNet, ci, connect, moduleLevel, nk, sigByName, typeText
  });

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
      s.params.outputs = outs.map(x => ({ name: sp(x.name), width: W(x), ...(!drivenByInst.has(x) && rw.procs.some(p => p.kind === 'process' && p.writes.has(x)) ? { reg: true } : {}) }));
    }
    for (const x of [...clocks, ...others]) connect(x.name, W(x), { sym: s.id, pin: sp(x.name) });
    for (const x of outs) connect(x.name, W(x), { sym: s.id, pin: sp(x.name) }, true);
  }
  mergePartDrivers(symbols, nets, nk);
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
