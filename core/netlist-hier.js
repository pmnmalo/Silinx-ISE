// Silinx - regroup a flat netgen netlist (VHDL) by the design's original hierarchy.
//
// XST flattens the design and names every primitive after the instance it came from
// (control_state_reg_FSM_FFd5, data_s_acc0_3, disp_basys2SL_counter_1 …). For the technology
// schematic the flat netlist is rewritten as one entity per original instance (its primitives,
// with a port for every net that crosses its boundary) instantiated by the top entity, so the
// schematic opens on the top level and each module can be pushed into, as in ISE.

import { UNISIM_VHDL, SIMPRIM_VHDL } from './unisim.js';

// outputs of primitives Silinx has no model for (the others come from their entities)
const OUT_PIN = /^(O|LO|Q|Q15|P|BCOUT|PCOUT|DO[AB]?|DOP[AB]?|SPO|DPO|CLK(0|90|180|270|2X|2X180|DV|FX|FX180)|LOCKED|PSDONE|STATUS)$/;

/** Index of the parenthesis that closes the one at `open`. */
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { i = text.indexOf('"', i + 1); if (i < 0) break; }
    else if (c === '-' && text[i + 1] === '-') { i = text.indexOf('\n', i); if (i < 0) break; }
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Interface lists ("a, b : in T := x; …") as [{ name, dir, type }]. */
function interfaceList(body) {
  const out = [];
  let depth = 0, start = 0;
  const items = [];
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if ((c === ';' && depth === 0) || i === body.length) { items.push(body.slice(start, i)); start = i + 1; }
  }
  for (const it of items) {
    const m = /^\s*(?:signal\s+|constant\s+)?([\w\s,]+?)\s*:\s*(?:(in|out|inout|buffer)\s+)?([\s\S]+?)\s*$/i.exec(it.replace(/--[^\n]*/g, ''));
    if (!m) continue;
    const type = m[3].replace(/:=[\s\S]*$/, '').trim();
    for (const name of m[1].split(',').map((x) => x.trim()).filter(Boolean)) out.push({ name, dir: (m[2] || 'in').toLowerCase(), type });
  }
  return out;
}

/** The entities of a VHDL text: [{ name, start, end, generics (clause text), ports }]. */
function entitiesOf(text) {
  const out = [];
  const re = /\bentity\s+(\w+)\s+is\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const endRe = new RegExp(`\\bend\\s+(?:entity\\s+)?${m[1]}\\s*;`, 'ig');
    endRe.lastIndex = re.lastIndex;
    const e = endRe.exec(text);
    if (!e) continue;
    const head = text.slice(re.lastIndex, e.index);
    let generics = '', portsText = null, from = 0;
    const g = /^\s*generic\s*\(/i.exec(head);
    if (g) { const c = closing(head, g[0].length - 1); if (c < 0) continue; generics = head.slice(g[0].length, c); from = c + 1; }
    const p = /^\s*;?\s*port\s*\(/i.exec(head.slice(from));
    if (p) { const o = from + p[0].length - 1, c = closing(head, o); if (c >= 0) portsText = head.slice(o + 1, c); }
    out.push({ name: m[1], start: m.index, end: e.index + e[0].length, generics, ports: portsText === null ? null : interfaceList(portsText) });
    re.lastIndex = e.index + e[0].length;
  }
  return out;
}

// port directions / types of the primitives Silinx models: Map(TYPE -> Map(PIN -> dir | type))
let PRIMS = null, PRIM_DIRS = null, PRIM_TYPES = null;
const portTable = (ents, k) => new Map(ents.filter((e) => e.ports).map((e) => [e.name.toUpperCase(), new Map(e.ports.map((p) => [p.name.toUpperCase(), p[k]]))]));
const dirTable = (ents) => portTable(ents, 'dir');
const prims = () => (PRIMS ??= entitiesOf(`${UNISIM_VHDL}\n${SIMPRIM_VHDL}`));
const primDirs = () => (PRIM_DIRS ??= dirTable(prims()));
const primTypes = () => (PRIM_TYPES ??= portTable(prims(), 'type'));

/**
 * Parse the parts of a netgen VHDL netlist this module needs: the entity `top` (by default the
 * last one of the file, as netgen writes the sub-entities of a KEEP_HIERARCHY netlist first) and
 * its architecture. `others` is the rest of the text (the other entities), `dirs` the port
 * directions of those entities (Map(TYPE -> Map(PIN -> dir))).
 */
export function parseNetgenVhdl(text, top = null) {
  const ents = entitiesOf(text).filter((e) => e.ports);
  if (!ents.length) throw new Error('not a netgen VHDL netlist (no entity with a port list)');
  const ent = (top && ents.find((e) => e.name.toLowerCase() === String(top).toLowerCase())) || ents[ents.length - 1];
  const arch = new RegExp(`\\barchitecture\\s+(\\w+)\\s+of\\s+${ent.name}\\s+is([\\s\\S]*?)\\bbegin\\b([\\s\\S]*?)\\bend\\s+(?:architecture\\s+)?\\1\\s*;`, 'i').exec(text);
  if (!arch) throw new Error('netgen netlist without an architecture');
  const signals = [...arch[2].matchAll(/\bsignal\s+(\w+)\s*:\s*([^;]+);/gi)].map((m) => ({ name: m[1], type: m[2].trim() }));
  const instances = [];
  const re = /(?:^|\n)\s*(\w+)\s*:\s*(\w+)\s*\n\s*(?:generic\s+map\s*\(([\s\S]*?)\)\s*\n\s*)?port\s+map\s*\(([\s\S]*?)\)\s*;/gi;
  let m;
  while ((m = re.exec(arch[3]))) {
    // formals are pins (O => …) or bits of vector pins (P(35) => …)
    const pins = [...m[4].matchAll(/(\w+(?:\s*\(\s*\d+\s*\))?)\s*=>\s*([^,\n]+?)\s*(?:,|$)/gm)].map((x) => ({ pin: x[1].replace(/\s+/g, ''), net: x[2].trim() }));
    instances.push({ name: m[1], type: m[2], generics: m[3] ? m[3].trim() : '', pins });
  }
  const multi = ents.length > 1;
  const cut = [[ent.start, ent.end], [arch.index, arch.index + arch[0].length]].sort((a, b) => a[0] - b[0]);
  const others = multi ? (text.slice(0, cut[0][0]) + text.slice(cut[0][1], cut[1][0]) + text.slice(cut[1][1])).trim() : '';
  return { entity: ent.name, generics: ent.generics.trim(), ports: ent.ports, archName: arch[1], signals, instances,
    header: text.slice(0, ent.start), others, dirs: dirTable(ents.filter((e) => e !== ent)) };
}

const key = (net) => net.toLowerCase().replace(/\s+/g, '');
const flatName = (net) => net.replace(/\s+/g, '').replace(/\((\d+)\)/g, '_$1').replace(/[^A-Za-z0-9_]/g, '_');

/**
 * Hierarchical VHDL for the flat netlist `text`: `groups` are the instance labels of the top of
 * the original design (e.g. ['control', 'data', 'access_module', 'disp_basys2SL']); a primitive
 * goes to the group whose label prefixes its name. `top`: the top entity (default: the last one;
 * the other entities of the file are kept). Returns { text, groups: { label: count } }.
 */
export function regroupNetlist(text, groups, top = null) {
  const n = parseNetgenVhdl(text, top);
  const labels = [...groups].filter(Boolean).sort((a, b) => b.length - a.length);
  const groupOf = (inst) => labels.find((l) => inst.name.toLowerCase().startsWith(`${l.toLowerCase()}_`)) || null;
  const members = new Map(labels.map((l) => [l, []]));
  const topInsts = [];
  for (const i of n.instances) { const g = groupOf(i); if (g) members.get(g).push(i); else topInsts.push(i); }
  // direction of a pin: from the entity of the instance (a primitive model or another entity of
  // the file), else from its name
  const pdirs = primDirs();
  const dirOf = (type, pin) => {
    const T = type.toUpperCase(), P = pin.replace(/\(.*$/, '').toUpperCase();
    return (n.dirs.get(T) || pdirs.get(T))?.get(P) || (OUT_PIN.test(P) ? 'out' : 'in');
  };
  // who drives / uses each net (group label, or '' for the top level: its primitives and ports);
  // `bidir`: who connects to it through an inout pin
  const drivers = new Map(), users = new Map(), bidir = new Map();
  const note = (map, net, who) => { const k = key(net); if (!map.has(k)) map.set(k, new Set()); map.get(k).add(who); };
  const connect = (net, who, dir) => {
    if (dir !== 'in') note(drivers, net, who);
    if (dir !== 'out') note(users, net, who);
    if (dir === 'inout') note(bidir, net, who);
  };
  for (const p of n.ports) connect(p.name, '', p.dir === 'in' ? 'out' : p.dir === 'inout' ? 'inout' : 'in');
  for (const i of n.instances) {
    const who = groupOf(i) || '';
    for (const pn of i.pins) connect(pn.net, who, dirOf(i.type, pn.pin));
  }
  const counts = {};
  const out = ['-- Hierarchical technology netlist (regrouped by Silinx from the flat netgen netlist)', ...(n.others ? [n.others, ''] : [])];
  const lib = 'library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nlibrary UNISIM;\nuse UNISIM.VCOMPONENTS.ALL;\n';
  // entity names of the groups: their labels, unless another entity of the file has that name
  const taken = new Set([...n.dirs.keys(), n.entity.toUpperCase()]);
  const entName = new Map(labels.map((l) => {
    let e = l;
    for (let k = 1; taken.has(e.toUpperCase()); k++) e = `${l}_grp${k > 1 ? k : ''}`;
    taken.add(e.toUpperCase());
    return [l, e];
  }));
  const entities = [];
  const groupPorts = new Map();
  for (const [label, insts] of members) {
    if (!insts.length) continue;
    counts[label] = insts.length;
    const nets = new Map();   // key -> original net text
    for (const i of insts) for (const pn of i.pins) nets.set(key(pn.net), pn.net);
    const ports = [], internals = [];
    const names = new Set();
    const uniq = (nm) => { let s = nm, k = 1; while (names.has(s.toLowerCase())) s = `${nm}_${k++}`; names.add(s.toLowerCase()); return s; };
    const local = new Map();
    for (const [k, net] of nets) {
      const outside = [...(drivers.get(k) || []), ...(users.get(k) || [])].some((w) => w !== label);
      const nm = uniq(flatName(net));
      local.set(k, nm);
      if (outside) ports.push({ name: nm, net, dir: bidir.get(k)?.has(label) ? 'inout' : drivers.get(k)?.has(label) ? 'out' : 'in' });
      else internals.push(nm);
    }
    groupPorts.set(label, ports);
    const body = insts.map((i) => `  ${i.name} : ${i.type}\n${i.generics ? `    generic map (\n      ${i.generics.replace(/\n\s*/g, '\n      ')}\n    )\n` : ''}    port map (\n${i.pins.map((pn) => `      ${pn.pin} => ${local.get(key(pn.net))}`).join(',\n')}\n    );`).join('\n');
    const e = entName.get(label);
    entities.push(`${lib}
entity ${e} is
  port (
${ports.map((p) => `    ${p.name} : ${p.dir} STD_LOGIC`).join(';\n')}
  );
end ${e};

architecture STRUCTURE of ${e} is
${internals.map((s) => `  signal ${s} : STD_LOGIC;`).join('\n')}
begin
${body}
end STRUCTURE;
`);
  }
  // top: original generics, ports and signals, its own primitives, one instance per group
  const topText = `${lib}
entity ${n.entity} is
${n.generics ? `  generic (\n    ${n.generics}\n  );\n` : ''}  port (
${n.ports.map((p) => `    ${p.name} : ${p.dir} ${p.type}`).join(';\n')}
  );
end ${n.entity};

architecture STRUCTURE of ${n.entity} is
${n.signals.map((s) => `  signal ${s.name} : ${s.type};`).join('\n')}
begin
${topInsts.map((i) => `  ${i.name} : ${i.type}\n${i.generics ? `    generic map (\n      ${i.generics.replace(/\n\s*/g, '\n      ')}\n    )\n` : ''}    port map (\n${i.pins.map((pn) => `      ${pn.pin} => ${pn.net}`).join(',\n')}\n    );`).join('\n')}
${[...groupPorts].filter(([l]) => counts[l]).map(([label, ports]) => `  ${label} : entity work.${entName.get(label)}\n    port map (\n${ports.map((p) => `      ${p.name} => ${p.net}`).join(',\n')}\n    );`).join('\n')}
end STRUCTURE;
`;
  return { text: [out.join('\n'), ...entities, topText].join('\n'), groups: counts, topPrimitives: topInsts.length };
}

/**
 * netgen connects the pad pin of a bidirectional buffer to one bit of an inout port vector
 * (`IO => io(7)`, post-synthesis IOBUF). An inout formal associated with part of a signal is
 * elaborated as an output only (the buffer's O would never see what drives the pad from outside),
 * so each such IOBUF becomes the equivalent OBUFT (driving the pad) + IBUF (reading the resolved pad).
 * Applies to every architecture of the text.
 */
export function splitInoutBuffers(text) {
  const taken = new Set([...text.matchAll(/\b(\w+)\b/g)].map((m) => m[1].toLowerCase()));
  const re = /((?:^|\n)(\s*))(\w+)\s*:\s*(IOBUF(?:_\w+)?)\s*\n\s*(generic\s+map\s*\([\s\S]*?\)\s*\n\s*)?port\s+map\s*\(([\s\S]*?)\)\s*;/gi;
  return text.replace(re, (all, head, ind, inst, type, gen, assoc) => {
    const pins = Object.fromEntries([...assoc.matchAll(/(\w+)\s*=>\s*([^,\n]+?)\s*(?:,|$)/gm)].map((x) => [x[1].toUpperCase(), x[2].trim()]));
    if (!pins.IO || !/\(\s*\d+\s*\)\s*$/.test(pins.IO) || !pins.I || !pins.T) return all;
    let ib = `${inst}_IN`, k = 1;
    while (taken.has(ib.toLowerCase())) ib = `${inst}_IN${k++}`;
    taken.add(ib.toLowerCase());
    const i2 = `${ind}  `;
    return `${head}${inst} : OBUFT\n${i2}${gen || ''}port map (\n${i2}  I => ${pins.I},\n${i2}  T => ${pins.T},\n${i2}  O => ${pins.IO}\n${i2});`
      + (pins.O ? `\n${ind}${ib} : IBUF\n${i2}port map (\n${i2}  I => ${pins.IO},\n${i2}  O => ${pins.O}\n${i2});` : '');
  });
}

/**
 * Speed up the simulation of a netgen netlist: its internal vector signals (carry chains, LUT
 * outputs of adders …) are split into single-bit signals, so that each primitive pin connects
 * to a whole signal (no glue process per bit, no wake-up of every reader of the vector).
 * Ports keep their types. The behaviour is unchanged. Bidirectional buffers on bits of inout ports
 * are split (splitInoutBuffers).
 */
export function scalarizeNetlist(text) {
  text = splitInoutBuffers(text);
  const arch = /(\barchitecture\s+(\w+)\s+of\s+\w+\s+is)([\s\S]*?)(\bbegin\b)([\s\S]*?)(\bend\s+\2\s*;)/i.exec(text);
  if (!arch) return text;
  const taken = new Set([...text.matchAll(/\b(\w+)\b/g)].map((m) => m[1].toLowerCase()));
  const vec = new Map();   // name (lower) -> { name, lo, hi, scalar(i) }
  const decls = arch[3].replace(/^(\s*)signal\s+(\w+)\s*:\s*STD_LOGIC_VECTOR\s*\(\s*(\d+)\s+(downto|to)\s+(\d+)\s*\)\s*;/gim, (all, ind, name, a, dir, b) => {
    if (new RegExp(`\\b${name}\\b(?!\\s*\\()`, 'i').test(arch[5])) return all;   // also used as a whole vector
    const hi = Math.max(+a, +b), lo = Math.min(+a, +b);
    const names = [];
    for (let i = lo; i <= hi; i++) {
      let s = `${name}_${i}`, k = 1;
      while (taken.has(s.toLowerCase())) s = `${name}_${i}_s${k++}`;
      taken.add(s.toLowerCase());
      names[i] = s;
    }
    vec.set(name.toLowerCase(), names);
    return names.filter(Boolean).map((s) => `${ind}signal ${s} : STD_LOGIC;`).join('');
  });
  let body = vec.size ? arch[5].replace(/\b(\w+)\s*\(\s*(\d+)\s*\)/g, (all, name, i) => vec.get(name.toLowerCase())?.[+i] ?? all) : arch[5];
  const whole = wholeFormals(body, taken);
  if (!vec.size && !whole) return text;
  body = whole ? whole.body : body;
  return text.slice(0, arch.index) + arch[1] + decls + (whole ? whole.decls : '') + arch[4] + body + arch[6] + text.slice(arch.index + arch[0].length);
}

/**
 * netgen connects the vector pins of some primitives (MULT18X18SIO, RAMB16 …) bit by bit
 * (`A(17) => a_17, …`): each such pin is connected instead to a whole vector signal, assigned
 * from / to the nets bit by bit. Returns { decls, body } or null when there is none.
 */
function wholeFormals(body, taken) {
  const pdirs = primDirs();
  const decls = [], glue = [];
  let changed = false;
  const re = /((?:^|\n)\s*(\w+)\s*:\s*(\w+)\s*\n\s*(?:generic\s+map\s*\([\s\S]*?\)\s*\n\s*)?port\s+map\s*\()([\s\S]*?)(\)\s*;)/gi;
  const out = body.replace(re, (all, head, inst, type, assoc, tail) => {
    const items = [...assoc.matchAll(/(\w+)\s*\(\s*(\d+)\s*\)\s*=>\s*([^,\n]+?)\s*(?=,|$)/gm)];
    if (!items.length) return all;
    const formals = new Map();   // FORMAL -> { name, bits: [[i, net]] }
    for (const [, f, i, net] of items) {
      const F = f.toUpperCase();
      if (!formals.has(F)) formals.set(F, { name: f, bits: [] });
      formals.get(F).bits.push([+i, net.trim()]);
    }
    const t = pdirs.get(type.toUpperCase());
    let rest = assoc;
    const added = [];
    for (const [F, { name, bits }] of formals) {
      const dir = t?.get(F) || (OUT_PIN.test(F) ? 'out' : 'in');
      if (dir === 'inout') continue;
      const decl = primTypes().get(type.toUpperCase())?.get(F);
      const range = /\(\s*(\d+)\s+(downto|to)\s+(\d+)\s*\)/i.exec(decl || '');
      const hi = range ? Math.max(+range[1], +range[3]) : Math.max(...bits.map((b) => b[0]));
      const lo = range ? Math.min(+range[1], +range[3]) : Math.min(...bits.map((b) => b[0]));
      let sig = `${inst}_${name}`, k = 1;
      while (taken.has(sig.toLowerCase())) sig = `${inst}_${name}_w${k++}`;
      taken.add(sig.toLowerCase());
      decls.push(`  signal ${sig} : STD_LOGIC_VECTOR ( ${hi} downto ${lo} );\n`);
      for (const [i, net] of bits) glue.push(dir === 'in' ? `  ${sig}(${i}) <= ${net};` : `  ${net} <= ${sig}(${i});`);
      rest = rest.replace(new RegExp(`\\s*\\b${name}\\s*\\(\\s*\\d+\\s*\\)\\s*=>\\s*[^,\\n]+?\\s*(,|(?=\\n|$))`, 'gi'), '');
      added.push(`${name} => ${sig}`);
      changed = true;
    }
    if (!added.length) return all;
    rest = rest.replace(/,\s*$/, '').trimEnd();
    return `${head}${rest ? `${rest},` : ''}\n      ${added.join(',\n      ')}\n    ${tail}`;
  });
  return changed ? { decls: decls.join(''), body: `\n${glue.join('\n')}${out}` } : null;
}
