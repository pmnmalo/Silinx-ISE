// Silinx - the HDL generated from a schematic document (#405: out of schdoc.js): generateHdl writes the VHDL or
// Verilog of a sheet (its ports, the nets as signals, each symbol as logic, an instance or an HDL block, buses and
// their taps, the sheet's own declarations and statements), with the comments that keep the HDL in step with its
// drawing. schdoc.js re-exports it. Isomorphic ES module: no DOM and no Node APIs.
import { parse as parseVerilog } from './verilog/parser.js';
import { parse as parseVhdl } from './vhdl/parser.js';
import {
  SYMBOLS, constBits, dedentBlock, findMod, indent, netlist, normModules, normalizeDoc, rsvd, squash, stripComments,
  symbolDef, validIdent, vhdlBits, vlogBits,
} from './schdoc.js';
import { mountSymbolHdl } from './schdoc-hdl-symbol.js';

// ===================================================================== HDL generation
// VHDL type class of a type text: 'sl' | 'slv' | 'u' | 's' | 'other'
export function vhdlClass(type) {
  const t = String(type || '').trim().toLowerCase();
  if (/^(ieee\.)?std_u?logic$/.test(t) || t === 'bit') return 'sl';
  if (/^(ieee\.)?std_u?logic_vector\b/.test(t) || /^bit_vector\b/.test(t)) return 'slv';
  if (/^unsigned\b/.test(t)) return 'u';
  if (/^signed\b/.test(t)) return 's';
  return 'other';
}

// An escaped identifier (#1697): a name written with a backslash first (\opcode[0]), as the schematic of a module whose
// ports are Verilog escaped identifiers keeps them; in the HDL \opcode[0]  in Verilog (the space ends it), the extended
// identifier \opcode[0]\ in VHDL. Other names as they are.
export const escapedName = n => /^\\[!-~]+$/.test(String(n ?? ''));
export const hdlName = (n, lang) => (!escapedName(n) ? n : lang === 'vhdl' ? `\\${n.slice(1).replace(/\\/g, '\\\\')}\\` : `${n} `);
// a name declared in HDL as the schematic names it: an escaped one with its backslash (a VHDL extended identifier,
// \t[0]\, without its closing one, #1809)
export const schName = (n, lang) => (validIdent(n, lang) || !/^[!-~]+$/.test(n) ? n
  : lang === 'vhdl' && /^\\.+\\$/.test(n) ? `\\${n.slice(1, -1).replace(/\\\\/g, '\\')}` : `\\${n}`);

// declarations found in a verbatim declaration text: Map(name(lower for VHDL) -> { type, kind, reg })
export function declaredIn(decls, lang) {
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
    for (const d of u?.decls || []) out.set(schName(d.name, lang).toLowerCase(), { kind: d.kind, type: types.get(d.name.toLowerCase())?.type || null });
    for (const [k, v] of types) if (!out.has(k)) out.set(k, v);
    for (const m of body.matchAll(/\b(type|subtype|component|function|procedure|alias|attribute)\s+([A-Za-z]\w*)/gi)) if (!out.has(m[2].toLowerCase())) out.set(m[2].toLowerCase(), { kind: m[1].toLowerCase() });
    return out;
  }
  let r;
  try { r = parseVerilog(`module silinx_decl_probe;\n${decls}\nendmodule\n`, 'decls'); } catch { r = null; }
  const u = r?.units?.find(x => x.kind === 'module');
  for (const d of u?.decls || []) out.set(schName(d.name, lang), { kind: d.kind, reg: d.net === 'reg' || d.net === 'variable', type: null });
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
    if (!validIdent(p.name, lang) && !escapedName(p.name)) diags.push({ severity: 'error', message: `I/O marker name '${p.name}' is not a valid ${lang.toUpperCase()} identifier`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y });
    else if (rsvd(p.name)) diags.push({ severity: 'warning', message: `${rsvd(p.name)}: rename it`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y });
    ports.push({ ...p, name: hdlName(p.name, lang), net });
    if (net && !portOf.has(net)) portOf.set(net, p);
  }
  // net names & types
  // (a net of some bits of a bus, a(0), #1688: those bits of the bus's signal, read and driven as such)
  const partExpr = net => {
    const { bus, base, msb, lsb } = net.part, b = bus ? netName(bus) : base;
    return ci ? (msb === lsb ? `${b}(${msb})` : `${b}(${msb} downto ${lsb})`) : (msb === lsb ? `${b}[${msb}]` : `${b}[${msb}:${lsb}]`);
  };
  const netName = net => (net ? (portOf.has(net) ? hdlName(portOf.get(net).name, lang) : net.part ? partExpr(net) : hdlName(net.name, lang)) : null);
  // netlist() gives every pin a net: a net made of that pin alone (maybe with a dangling wire,
  // but no other pin, I/O marker or label) is an unconnected pin
  const isolated = n => n.endpoints.length === 1 && !n.labels.length && !n.ports.length && !portOf.has(n);
  /** Net read by an input pin, or null when the pin is unconnected. */
  const inNet = (sym, pin) => { const n = nl.pinNet.get(`${sym.id}/${pin}`); return n && !isolated(n) ? n : null; };
  const P = (sym, pin) => { const n = inNet(sym, pin); return n ? netName(n) : null; };
  const PW = (sym, pin) => nl.pinNet.get(`${sym.id}/${pin}`)?.width ?? defs.get(sym.id).pins.find(p => p.name === pin)?.width ?? 1;
  for (const net of nl.nets) {
    if (net.part) continue;
    if (!portOf.has(net) && !net.auto && !validIdent(net.name, lang) && !escapedName(net.name)) diags.push({ severity: 'error', message: `net name '${net.name}' is not a valid ${lang.toUpperCase()} identifier`, ref: { kind: 'label', id: net.labels[0] }, net: net.name });
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
    // (a bus named with its indices, d(7:4), #1689)
    if (net.range && !pinType.get(net)) return res(`std_logic_vector(${net.range.msb} downto ${net.range.lsb})`);
    return res(pinType.get(net) || vtype(net.width));
  };
  const clsOf = nm => {
    if (!nm) return 'slv';
    // (an output port's local copy, its <port>_int read inside, #1693: the port's net)
    const net = nl.nets.find(n => nk(netName(n)) === nk(nm)) || [...outRead].find(([, l]) => nk(l) === nk(nm))?.[0];
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
  // (Verilog: a bit of a bus written by a register, #1688: the bus a reg)
  const regBases = new Set();
  for (const n of [...regNets]) if (n.part) { if (n.part.bus) regNets.add(n.part.bus); else regBases.add(nk(n.part.base)); }

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

  // (set when a device primitive is instanced: the UNISIM library in the context clause)
  let unisim = false;
  // (the components declared in the architecture: a device primitive's with an input left open, #963)
  const components = new Map();
  // the blocks' own entities: one per kind and parameters (and the pins it uses) (schdoc-hdl-symbol.js)
  const { subs, symbolHdl, syms } = mountSymbolHdl({
    INN, OUTN, PW, assign, blockLang, body, ci, clsOf, declared, defs, diags, doc, extra, fresh, inNet, init, isBlock,
    isolated, lang, modules, name, netName, netType, nk, nl, outRead, tie, used, vtype, warnOpen, wrapV, zero,
    setUnisim: (v) => { unisim = v; }, addComponent: (n, text) => components.set(n, text)
  });

  for (const s of syms) symbolHdl(s);
  // nets with several I/O markers: the first one names the net, the others are assigned
  for (const p of ports) {
    if (!p.net) continue;
    const owner = portOf.get(p.net);
    if (owner && owner.id !== p.id) {
      if (p.dir === 'out') assign(p.name, outRead.get(p.net) || hdlName(owner.name, lang));
      else diags.push({ severity: 'error', message: `I/O markers '${owner.name}' and '${p.name}' are on the same net`, ref: { kind: 'port', id: p.id } });
    }
  }
  // ---------------- assemble
  const header = `Generated by Silinx from ${doc.name}.sch.json — edit the schematic, not this file`;
  // the sheet description (doc.description, e.g. from the Schematic Wizard) as comment lines
  const descC = c => String(doc.description || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => `${c} ${l}`);
  const sigDecls = [];
  // a bus of no net of its own, made of its bits' nets (a(0), a(1) and no a, #1688): declared from their range
  const madeOf = new Map();
  for (const n of nl.nets) if (n.part && !n.part.bus) {
    const k = nk(n.part.base), r = madeOf.get(k);
    madeOf.set(k, { name: n.part.base, msb: Math.max(r?.msb ?? n.part.msb, n.part.msb), lsb: Math.min(r?.lsb ?? n.part.lsb, n.part.lsb) });
  }
  for (const [k, r] of madeOf) {
    if (ci) sigDecls.push(`  signal ${r.name} : std_logic_vector(${r.msb} downto ${r.lsb});`);
    else sigDecls.push(`  ${regBases.has(k) ? 'reg ' : 'wire'} [${r.msb}:${r.lsb}] ${r.name};`);
  }
  for (const net of nl.nets) {
    if (portOf.has(net) || net.part) continue;
    const nm = hdlName(net.name, lang);
    if (declared.has(nk(net.name))) continue;
    if (!net.endpoints.length) continue;
    if (isolated(net) && net.auto && net.endpoints[0].kind === 'pin' && net.endpoints[0].dir !== 'out'
      && !['module', 'hdlblock'].includes(doc.symbols.find(x => x.id === net.endpoints[0].sym)?.type)) continue;
    // (a device primitive's output left unconnected: open)
    if (isolated(net) && net.auto && net.endpoints[0].kind === 'pin' && SYMBOLS[doc.symbols.find(x => x.id === net.endpoints[0].sym)?.type]?.prim) continue;
    const iv = init.get(net);
    if (ci) sigDecls.push(`  signal ${nm} : ${netType(net)}${iv ? ` := ${vhdlClass(netType(net)) === 'sl' ? vhdlBits(iv, true) : vhdlBits(iv, false)}` : ''};`);
    else {
      const reg = regNets.has(net);
      sigDecls.push(`  ${reg ? 'reg ' : 'wire'}${net.range ? ` [${net.range.msb}:${net.range.lsb}]` : net.width > 1 ? ` [${net.width - 1}:0]` : ''} ${nm}${reg && iv ? ` = ${vlogBits(iv)}` : ''};`);
    }
  }
  for (const x of extra) {
    if (ci) sigDecls.push(`  signal ${hdlName(x.name, lang)} : ${x.type || vtype(x.width || 1)}${x.init ? ` := ${(x.type || '').startsWith('std_logic') && !(x.type || '').includes('vector') ? vhdlBits(x.init, true) : vhdlBits(x.init, false)}` : ''};`);
    else sigDecls.push(`  ${x.reg ? 'reg ' : 'wire'}${(x.width || 1) > 1 ? ` [${x.width - 1}:0]` : ''} ${hdlName(x.name, lang)};`);
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
    if (components.size) L.push('  attribute BOX_TYPE : string;', ...[...components.values()].map(c => indent(c, '  ')));
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
