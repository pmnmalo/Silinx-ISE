// Silinx - View Technology Schematic in the Silinx toolchain: the netlist of the open synthesis
// (Yosys's JSON, build/open/<top>.json) as ISE's technology view draws it.
//
// The netlist is written as a netgen-style structural VHDL netlist (one entity, the UNISIM
// primitives Yosys mapped the design onto: LUT1-4 with their INIT, FD* flip-flops, MUXF5-8,
// MUXCY / XORCY carry chains, RAMB16, MULT18X18, DCM, SRL16, RAM16X1*, IBUF / OBUF / BUFG…), then
// regrouped by the design's own instances (core/netlist-hier.js regroupNetlist), so that the
// schematic engine of View RTL Schematic (core/schdoc.js schematicFromHdl, laid out with elkjs)
// draws it as it draws ISE's post-synthesis netlist: the top level with one block per instance of
// the design, each pushed into to see its primitives.
//
// Names. Yosys keeps the HDL's names on the nets (the flat module Silinx writes for it names the
// signals of an instance u_pre.cnt) but calls most cells after the pass that made them
// ($abc$2701$auto$…). A cell is named as XST names its primitives: after the net it drives
// (u_pre.cnt<3> -> u_pre_cnt_3_FDRE; an I/O buffer after its port: led_3_OBUF), a cell Yosys named
// (a block RAM: laps_ram.0.0) keeps its name, the others are TYPE_<n>. A cell belongs to the instance
// whose name starts the name of the net it drives (a cell driving a signal of the top module stays
// on the top level, unless that signal is also one inside an instance, #1003: u_count.ones driving the
// top's digits); a cell that drives no named net joins the instance most of its neighbours
// belong to; the I/O buffers stay at the top. A top level with more than TOP_MAX cells of its own
// is drawn by blocks, one per signal of the top module (ball_x_logic: the cells driving ball_x and
// their neighbours). An output bus is driven by its bits (d <= d_1 & d_0), as the schematic draws it.
//
//   const r = technologyNetlist(json, { top, groups: ['u_pre', 'u_speed', 'u_knight'] })
//   r = { name, model: { ports, cells, nets }, flat: VHDL text, text: VHDL text by instance,
//         groups: { label: cells }, cells: n }
//   lutFunction('X"AC"', 3) = { inputs: ['I2', 'I1', 'I0'], equation: 'O = I0*I2 + I1*!I2', rows }

import { readYosysJson, paramBits, paramInt } from '../packages/silinx-fpga/src/index.js';
import { primitiveInterface, regroupNetlist } from './netlist-hier.js';
import { validIdent } from './schdoc.js';

// cells that stay at the top level: the I/O and global clock buffers
const IO_CELL = /^(IBUF|IBUFG|OBUF|OBUFT|IOBUF|BUFG|BUFGP|BUFGMUX|BUFGCE|IBUFDS|OBUFDS|IBUFGDS)(_\w+)?$/;
// a net with more loads than this (a clock, a reset) says nothing about where a cell belongs
const VOTE_FANOUT = 32;
// a top level with more cells of its own than this is drawn by blocks (one per signal), of MIN_BLOCK cells at least
const TOP_MAX = 100, MIN_BLOCK = 3;

/** A VHDL identifier made of a name: 'u_pre.cnt<3>' -> 'u_pre_cnt_3'. */
export function vhdlName(name) {
  let s = String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[A-Za-z]/.test(s)) s = `N${s ? `_${s}` : ''}`;
  if (!validIdent(s, 'vhdl')) s = `${s}_s`;
  return s;
}

// a net name Yosys made up ($abc$…, $auto$…) or the reader's n<bit>: not shown
const hiddenName = n => !n || n.includes('$') || /^n\d+$/.test(n);

/** The bit names of a module's nets (its netnames; as the reader names them: d<3>) that are also a visible name
 *  inside one of the instances (groupOf: the instance of a name, or null): Map(name -> instance). */
function instanceAliases(netnames, groupOf) {
  const names = new Map();   // bit -> its visible names
  for (const [nname, n] of Object.entries(netnames)) {
    if (n.hide_name) continue;
    n.bits.forEach((b, i) => {
      if (typeof b === 'string') return;
      const full = n.bits.length > 1 ? `${nname}<${(n.offset ?? 0) + (n.upto ? n.bits.length - 1 - i : i)}>` : nname;
      if (!names.has(b)) names.set(b, []);
      names.get(b).push(full);
    });
  }
  const out = new Map();
  for (const list of names.values()) {
    const inside = list.filter(n => groupOf(n)).sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0];
    if (inside) for (const n of list) if (!groupOf(n)) out.set(n, groupOf(inside));
  }
  return out;
}

/**
 * The netlist of the open synthesis as a schematic model and as structural VHDL.
 * json: Yosys's JSON (text or object); top: its top module (default: the one Yosys marked);
 * groups: the instance names of the design's top (default: the first part of the dotted net
 * names). Returns { name, model, flat, text, groups, cells } (above).
 */
export function technologyNetlist(json, { top, groups } = {}) {
  const nl = readYosysJson(json, top ? { top } : {});
  const { cells, nets } = nl;
  // ---- the model: ports, cells (type, generics, pins in order, group), nets (driver, loads)
  const visible = nets.map(n => !hiddenName(n.name) || n.port);
  const dotted = new Set();
  nets.forEach((n, i) => { if (visible[i] && !n.port && /^[A-Za-z_]\w*\./.test(n.name)) dotted.add(n.name.split('.')[0]); });
  const netnames = (typeof json === 'string' ? JSON.parse(json) : json).modules?.[nl.name]?.netnames || {};
  for (const [nname, n] of Object.entries(netnames)) if (!n.hide_name && /^[A-Za-z_]\w*\./.test(nname)) dotted.add(nname.split('.')[0]);
  const labels = (groups || [...dotted]).filter(Boolean);
  const labelOf = new Map(labels.map(l => [l.toLowerCase(), l]));
  const groupOfName = name => { const m = /^([A-Za-z_]\w*)\./.exec(name || ''); return m ? labelOf.get(m[1].toLowerCase()) ?? null : null; };
  // a signal of the top that is also a signal inside an instance (u_count.ones<3>, which drives the top's digits<3>):
  // the instance of the shortest such name (the reader names a net by its shortest name)
  const insideOf = instanceAliases(netnames, groupOfName);
  const isOut = (c, pin) => c.dirs[pin.replace(/<\d+>$/, '')] === 'output';
  const group = cells.map(() => undefined);   // label, null (the top), or undefined (not known yet)
  const fixed = cells.map(c => IO_CELL.test(c.type));
  cells.forEach((c, i) => {
    if (fixed[i]) { group[i] = null; return; }
    // the net it drives: in an instance (u_pre.cnt<3>), or a signal of the top (ball_x<2>)
    for (const [pin, k] of Object.entries(c.pins)) {
      if (!isOut(c, pin) || !visible[k] || nets[k].port) continue;
      group[i] = groupOfName(nets[k].name) ?? insideOf.get(nets[k].name) ?? (/^[A-Za-z_]\w*\./.test(nets[k].name) ? undefined : null);
      if (group[i] !== undefined) return;
    }
    if (!c.name.startsWith('$')) { const g = groupOfName(c.name); if (g) group[i] = g; }
  });
  // the others: the group most of their neighbours (through nets of a small fanout) belong to
  const neighbours = cells.map((c, i) => {
    const out = [];
    for (const k of Object.values(c.pins)) {
      const n = nets[k];
      if (k < 2 || n.loads.length > VOTE_FANOUT) continue;
      if (n.driver && n.driver.cell !== i) out.push(n.driver.cell);
      for (const l of n.loads) if (l.cell !== i) out.push(l.cell);
    }
    return out;
  });
  for (let pass = 0, changed = true; changed && pass < 64; pass++) {
    changed = false;
    const next = [...group];
    cells.forEach((c, i) => {
      if (group[i] !== undefined) return;
      const votes = new Map();
      for (const j of neighbours[i]) if (!fixed[j] && group[j] !== undefined) votes.set(group[j], (votes.get(group[j]) || 0) + 1);
      let best, n = 0;
      for (const [g, v] of votes) if (v > n) { best = g; n = v; }
      if (n) { next[i] = best; changed = true; }
    });
    group.splice(0, group.length, ...next);
  }
  for (let i = 0; i < group.length; i++) if (group[i] === undefined) group[i] = null;
  // a top level with many cells of its own (the logic of the top module): its cells grouped by the
  // signal they drive (ball_x<0..9> -> a block ball_x_logic), the others by their neighbours
  const sub = cells.map(() => undefined);
  const own = cells.map((c, i) => group[i] === null && !fixed[i]);
  if (own.filter(Boolean).length > TOP_MAX) {
    cells.forEach((c, i) => {
      if (!own[i]) return;
      for (const [pin, k] of Object.entries(c.pins)) if (isOut(c, pin) && visible[k] && !nets[k].port) { sub[i] = nets[k].name.replace(/<\d+>$/, ''); return; }
    });
    for (let pass = 0, changed = true; changed && pass < 64; pass++) {
      changed = false;
      const next = [...sub];
      cells.forEach((c, i) => {
        if (!own[i] || sub[i] !== undefined) return;
        const votes = new Map();
        for (const j of neighbours[i]) if (own[j] && sub[j] !== undefined) votes.set(sub[j], (votes.get(sub[j]) || 0) + 1);
        let best, n = 0;
        for (const [g, v] of votes) if (v > n) { best = g; n = v; }
        if (n) { next[i] = best; changed = true; }
      });
      sub.splice(0, sub.length, ...next);
    }
    // blocks of a few cells stay on the top level
    const size = new Map();
    for (const g of sub) if (g !== undefined) size.set(g, (size.get(g) || 0) + 1);
    sub.forEach((g, i) => { if (g !== undefined && size.get(g) < MIN_BLOCK) sub[i] = undefined; });
  }

  // ---- names: ports, signals, then instances (one name space, case-insensitive)
  const taken = new Set(labels.map(l => l.toLowerCase()));
  const uniq = base => { let s = base, k = 1; while (taken.has(s.toLowerCase())) s = `${base}_${k++}`; taken.add(s.toLowerCase()); return s; };
  const ports = nl.ports.map(p => {
    const bits = p.bits.map(b => ({ ...b, index: /<(-?\d+)>$/.test(b.name) ? +/<(-?\d+)>$/.exec(b.name)[1] : null }));
    const bus = bits.some(b => b.index !== null);
    const idx = bits.map(b => b.index);
    return { name: p.name, ident: uniq(vhdlName(p.name)), dir: p.dir, bus, msb: bus ? Math.max(...idx) : null, lsb: bus ? Math.min(...idx) : null, bits };
  });
  // what each net is in the VHDL: a constant, a port bit (an input's, else the first one's), or a signal
  const expr = new Array(nets.length).fill(null);
  expr[0] = "'0'"; expr[1] = "'1'";
  const assigns = [];
  const bitExpr = (p, b) => (p.bus ? `${p.ident}(${b.index})` : p.ident);
  const signals = [];
  for (const p of [...ports.filter(p => p.dir !== 'out'), ...ports.filter(p => p.dir === 'out')]) {
    if (p.dir === 'out' && p.bus) {
      // an output bus: its bits as signals of their own (the schematic draws the buffers driving
      // them, then the bus), assigned to the port at once
      for (const b of p.bits) if (expr[b.net] === null) { expr[b.net] = uniq(vhdlName(b.name)); signals.push({ net: b.net, name: expr[b.net] }); }
      const order = [...p.bits].sort((x, y) => y.index - x.index);
      assigns.push(`${p.ident} <= ${order.map(b => expr[b.net]).join(' & ')};`);
      continue;
    }
    for (const b of p.bits) {
      if (expr[b.net] === null) expr[b.net] = bitExpr(p, b);
      else if (p.dir === 'out') assigns.push(`${bitExpr(p, b)} <= ${expr[b.net]};`);
    }
  }
  const used = new Set();
  for (const c of cells) for (const k of Object.values(c.pins)) used.add(k);
  for (const k of used) {
    if (expr[k] !== null) continue;
    const n = nets[k];
    expr[k] = uniq(visible[k] ? vhdlName(n.name) : `N${k}`);
    signals.push({ net: k, name: expr[k] });
  }
  // instances
  const count = {};
  const modelCells = cells.map((c, i) => {
    let base = null;
    if (!c.name.startsWith('$')) base = vhdlName(c.name);
    else {
      const pins = Object.entries(c.pins).filter(([pin, k]) => k > 1 && (fixed[i] || isOut(c, pin)) && visible[k]);
      // an I/O buffer after its port bit, any other cell after the net it drives
      const pick = fixed[i] ? (pins.find(([, k]) => nets[k].port) || pins[0]) : pins[0];
      if (pick) base = `${vhdlName(nets[pick[1]].name)}_${c.type}`;
    }
    if (!base) { count[c.type] = (count[c.type] || 0) + 1; base = `${c.type}_${count[c.type]}`; }
    return { name: uniq(base), yosysName: c.name, type: c.type, group: group[i], params: c.params, cell: c };
  });
  // the blocks of the top level's own logic, named after their signal
  const subLabel = new Map();
  modelCells.forEach((mc, i) => {
    if (sub[i] === undefined) return;
    if (!subLabel.has(sub[i])) subLabel.set(sub[i], uniq(`${vhdlName(sub[i])}_logic`));
    mc.group = subLabel.get(sub[i]);
  });
  // ---- the VHDL text: entity, signals, one instance per cell (netgen's layout, which regroupNetlist reads)
  const stubs = new Map();
  const body = modelCells.map(mc => {
    const c = mc.cell;
    const itf = primitiveInterface(c.type);
    const ptype = new Map((itf?.ports || []).map(p => [p.name.toUpperCase(), p.type]));
    const pins = Object.entries(c.pins).map(([pin, k]) => {
      const m = /^(\w+)<(\d+)>$/.exec(pin);
      const formal = m ? `${m[1]}(${m[2]})` : /vector/i.test(ptype.get(pin.toUpperCase()) || '') ? `${pin}(0)` : pin;
      return `      ${formal} => ${expr[k]}`;
    });
    if (!itf && !stubs.has(c.type.toUpperCase())) stubs.set(c.type.toUpperCase(), stubEntity(c));
    const gens = itf ? genericMap(c.params, itf.generics) : [];
    mc.generics = Object.fromEntries(gens);
    return `  ${mc.name} : ${c.type}\n${gens.length ? `    generic map (\n${gens.map(([g, v]) => `      ${g} => ${v}`).join(',\n')}\n    )\n` : ''}    port map (\n${pins.join(',\n')}\n    );`;
  });
  const lib = 'library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nlibrary UNISIM;\nuse UNISIM.VCOMPONENTS.ALL;\n';
  const entity = vhdlName(nl.name);
  const portDecl = p => `    ${p.ident} : ${p.dir === 'in' ? 'in' : p.dir === 'out' ? 'out' : 'inout'} ${p.bus ? `STD_LOGIC_VECTOR ( ${p.msb} downto ${p.lsb} )` : 'STD_LOGIC'}`;
  const flat = `-- Technology netlist of '${nl.name}' (Silinx toolchain: the open synthesis, Yosys), written by Silinx
${[...stubs.values()].join('\n')}${lib}
entity ${entity} is
  port (
${ports.map(portDecl).join(';\n')}
  );
end ${entity};

architecture STRUCTURE of ${entity} is
${signals.map(s => `  signal ${s.name} : STD_LOGIC;`).join('\n')}
begin
${body.join('\n')}
${assigns.map(a => `  ${a}`).join('\n')}
end STRUCTURE;
`;
  const present = [...new Set(modelCells.map(c => c.group).filter(Boolean))];
  const member = new Map(modelCells.map(c => [c.name, c.group]));
  const r = present.length ? regroupNetlist(flat, present, entity, { groupOf: name => member.get(name) || null }) : { text: flat, groups: {} };
  const model = {
    ports: ports.map(p => ({ name: p.name, ident: p.ident, dir: p.dir, msb: p.msb, lsb: p.lsb })),
    cells: modelCells.map(mc => ({ name: mc.name, yosysName: mc.yosysName, type: mc.type, group: mc.group, generics: mc.generics,
      pins: Object.fromEntries(Object.entries(mc.cell.pins).map(([pin, k]) => [pin, expr[k]])) })),
    nets: [...used].filter(k => k > 1).map(k => ({ name: expr[k], driver: nets[k].driver ? { cell: modelCells[nets[k].driver.cell].name, pin: nets[k].driver.pin } : null,
      loads: nets[k].loads.map(l => ({ cell: modelCells[l.cell].name, pin: l.pin })) })),
  };
  return { name: entity, model, flat, text: r.text, groups: r.groups, cells: cells.length };
}

// the generic map of a cell: its parameters the primitive's model declares, as VHDL values
function genericMap(params, generics) {
  const out = [];
  for (const g of generics) {
    const v = Object.entries(params).find(([k]) => k.toUpperCase() === g.name.toUpperCase())?.[1];
    if (v === undefined || v === null) continue;
    const t = g.type.toLowerCase();
    let val = null;
    const range = /\(\s*(\d+)\s+(?:downto|to)\s+(\d+)\s*\)/.exec(t);
    if (/^bit_vector/.test(t) && range) {
      const w = Math.abs(+range[1] - +range[2]) + 1;
      const bits = paramBits(v) ?? (typeof v === 'number' ? [...v.toString(2)].reverse().map(Number) : null);
      if (!bits) continue;
      while (bits.length < w) bits.push(0);
      bits.length = w;
      // block RAM contents left empty: the default
      if (/^INITP?_[0-9A-F]{2}$/i.test(g.name) && !bits.includes(1)) continue;
      val = w % 4 === 0 ? `X"${hexOf(bits)}"` : `"${[...bits].reverse().join('')}"`;
    } else if (t === 'bit' || t === 'std_ulogic' || t === 'std_logic') val = `'${paramInt(v) & 1}'`;
    else if (t === 'integer' || t === 'natural' || t === 'positive') val = String(paramInt(v));
    else if (t === 'real') { const x = typeof v === 'number' ? v : parseFloat(String(v)); if (Number.isFinite(x)) val = Number.isInteger(x) ? `${x}.0` : String(x); }
    else if (t === 'boolean') val = /^(1|true)$/i.test(String(v).trim()) ? 'TRUE' : 'FALSE';
    else if (t === 'string') val = `"${String(v).replace(/"/g, '')}"`;
    if (val !== null) out.push([g.name, val]);
  }
  return out;
}
const hexOf = bits => { let s = ''; for (let i = bits.length - 4; i >= 0; i -= 4) s += (bits[i] | (bits[i + 1] << 1) | (bits[i + 2] << 2) | (bits[i + 3] << 3)).toString(16).toUpperCase(); return s; };

// an entity for a cell type Silinx has no model of (drawn as a block with its pins)
function stubEntity(c) {
  const width = new Map();
  for (const pin of Object.keys(c.pins)) { const m = /^(\w+)<(\d+)>$/.exec(pin); const n = m ? m[1] : pin; width.set(n, Math.max(width.get(n) || 0, m ? +m[2] + 1 : 0)); }
  const ports = [...width].map(([n, w]) => `    ${n} : ${c.dirs[n] === 'output' ? 'out' : c.dirs[n] === 'inout' ? 'inout' : 'in'} ${w ? `STD_LOGIC_VECTOR ( ${w - 1} downto 0 )` : 'STD_LOGIC'}`);
  return `library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n\nentity ${c.type} is\n  port (\n${ports.join(';\n')}\n  );\nend ${c.type};\n\narchitecture BLACKBOX of ${c.type} is\nbegin\nend BLACKBOX;\n\n`;
}

// ------------------------------------------------------------------ the function of a LUT
/** The bits of a LUT's INIT (VHDL X"AC" / "10101100", Verilog 8'hAC, hex AC, or Yosys's binary
 *  string), address 0 first, `size` of them (2^k); null when it cannot be read. */
export function initBits(value, size) {
  let s = String(value ?? '').trim().replace(/_/g, '');
  let bits = null;
  let m;
  if ((m = /^[xX]"([0-9A-Fa-f]+)"$/.exec(s)) || (m = /^\d*'[hH]([0-9A-Fa-f]+)$/.exec(s)) || (m = /^(?:0x|16#)([0-9A-Fa-f]+)#?$/i.exec(s))) {
    bits = [];
    for (const ch of [...m[1]].reverse()) { const v = parseInt(ch, 16); for (let b = 0; b < 4; b++) bits.push((v >> b) & 1); }
  } else if ((m = /^"([01]+)"$/.exec(s)) || (m = /^\d*'[bB]([01]+)$/.exec(s)) || (m = /^([01]+)$/.exec(s))) bits = [...m[1]].reverse().map(Number);
  else if ((m = /^[0-9A-Fa-f]+$/.exec(s))) return initBits(`X"${s}"`, size);
  if (!bits) return null;
  while (bits.length < size) bits.push(0);
  return bits.slice(0, size);
}

/**
 * The function of a k-input LUT (LUT1-4) of INIT `init`: { inputs: ['I3' … 'I0'], equation
 * ('O = I0*!I1 + I2', ISE's notation: * and, + or, ! not, @ xor), rows: [{ in: [I3 … I0], out }] }
 * (the truth table, address 0 first); null when the INIT cannot be read.
 */
export function lutFunction(init, k) {
  const n = 1 << k;
  const f = initBits(init, n);
  if (!f) return null;
  const inputs = [];
  for (let i = k - 1; i >= 0; i--) inputs.push(`I${i}`);
  const rows = f.map((out, a) => ({ in: inputs.map((x, j) => (a >> (k - 1 - j)) & 1), out }));
  return { inputs, equation: `O = ${lutEquation(f, k)}`, rows };
}

// the shortest sum of products of a function of k <= 6 inputs (bits f[a]); an XOR of inputs as such
function lutEquation(f, k) {
  const n = 1 << k;
  const ones = f.reduce((s, b) => s + b, 0);
  if (!ones) return '0';
  if (ones === n) return '1';
  // the inputs it depends on
  const dep = [];
  for (let i = 0; i < k; i++) if (f.some((b, a) => b !== f[a ^ (1 << i)])) dep.push(i);
  // an XOR (or XNOR) of its inputs: each input changes the output
  if (dep.length > 1 && f.every((b, a) => dep.every(i => b !== f[a ^ (1 << i)]))) {
    const x = dep.map(i => `I${i}`).join(' @ ');
    return f[0] ? `!(${x})` : x;
  }
  // prime implicants: cubes (mask of the inputs it fixes, their values) over the inputs it depends on
  const cubes = [];
  const m = dep.length;
  for (let fixMask = 0; fixMask < 1 << m; fixMask++) {
    for (let val = 0; val < 1 << m; val++) {
      if (val & ~fixMask) continue;
      let all = true;
      const cover = [];
      for (let a = 0; a < n && all; a++) {
        let ok = true;
        for (let j = 0; j < m; j++) if ((fixMask >> j) & 1 && ((a >> dep[j]) & 1) !== ((val >> j) & 1)) { ok = false; break; }
        if (!ok) continue;
        if (!f[a]) all = false; else cover.push(a);
      }
      if (all) cubes.push({ fixMask, val, cover });
    }
  }
  const primes = cubes.filter(c => !cubes.some(d => d !== c && (d.fixMask & c.fixMask) === d.fixMask && d.fixMask !== c.fixMask && (c.val & d.fixMask) === d.val));
  // the smallest set of primes that covers every 1 (fewest terms, then fewest literals)
  const target = f.map((b, a) => (b ? a : -1)).filter(a => a >= 0);
  const lits = c => c.fixMask.toString(2).replace(/0/g, '').length;
  let best = null;
  const choose = (start, chosen, covered) => {
    if (target.every(a => covered.has(a))) {
      const cost = [chosen.length, chosen.reduce((s, c) => s + lits(c), 0)];
      if (!best || cost[0] < best.cost[0] || (cost[0] === best.cost[0] && cost[1] < best.cost[1])) best = { set: [...chosen], cost };
      return;
    }
    if (best && chosen.length >= best.cost[0]) return;
    // the first uncovered 1: one of the primes that cover it
    const a = target.find(x => !covered.has(x));
    for (const p of primes) {
      if (!p.cover.includes(a)) continue;
      const add = p.cover.filter(x => !covered.has(x));
      add.forEach(x => covered.add(x));
      chosen.push(p);
      choose(start, chosen, covered);
      chosen.pop();
      add.forEach(x => covered.delete(x));
    }
  };
  choose(0, [], new Set());
  const term = c => {
    const t = [];
    for (let j = 0; j < m; j++) if ((c.fixMask >> j) & 1) t.push(`${(c.val >> j) & 1 ? '' : '!'}I${dep[j]}`);
    return t.join('*');
  };
  return best.set.map(term).sort((x, y) => x.replace(/!/g, '').localeCompare(y.replace(/!/g, '')) || x.length - y.length).join(' + ');
}
