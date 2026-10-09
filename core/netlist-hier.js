// Silinx - regroup a flat netgen netlist (VHDL) by the design's original hierarchy.
//
// XST flattens the design and names every primitive after the instance it came from
// (control_state_reg_FSM_FFd5, data_s_acc0_3, disp_basys2SL_counter_1 …). For the technology
// schematic the flat netlist is rewritten as one entity per original instance (its primitives,
// with a port for every net that crosses its boundary) instantiated by the top entity, so the
// schematic opens on the top level and each module can be pushed into, as in ISE.

const OUT_PINS = new Set(['O', 'LO', 'Q', 'G', 'P']);   // primitive outputs (UNISIM / SIMPRIM)

/** Parse the parts of a netgen VHDL netlist this module needs. */
export function parseNetgenVhdl(text) {
  const ent = /\bentity\s+(\w+)\s+is\s+port\s*\(([\s\S]*?)\);\s*end\s+\1\s*;/i.exec(text);
  if (!ent) throw new Error('not a netgen VHDL netlist (no entity with a port list)');
  const ports = [...ent[2].matchAll(/(\w+)\s*:\s*(in|out|inout)\s+([^;]+?)\s*(?:;|$)/gi)].map((m) => ({ name: m[1], dir: m[2].toLowerCase(), type: m[3].replace(/:=.*$/, '').trim() }));
  const arch = /\barchitecture\s+(\w+)\s+of\s+\w+\s+is([\s\S]*?)\bbegin\b([\s\S]*)\bend\s+\1\s*;/i.exec(text);
  if (!arch) throw new Error('netgen netlist without an architecture');
  const signals = [...arch[2].matchAll(/\bsignal\s+(\w+)\s*:\s*([^;]+);/gi)].map((m) => ({ name: m[1], type: m[2].trim() }));
  const instances = [];
  const re = /(?:^|\n)\s*(\w+)\s*:\s*(\w+)\s*\n\s*(?:generic\s+map\s*\(([\s\S]*?)\)\s*\n\s*)?port\s+map\s*\(([\s\S]*?)\)\s*;/gi;
  let m;
  while ((m = re.exec(arch[3]))) {
    const pins = [...m[4].matchAll(/(\w+)\s*=>\s*([^,\n]+?)\s*(?:,|$)/gm)].map((x) => ({ pin: x[1], net: x[2].trim() }));
    instances.push({ name: m[1], type: m[2], generics: m[3] ? m[3].trim() : '', pins });
  }
  return { entity: ent[1], ports, archName: arch[1], signals, instances, header: text.slice(0, ent.index) };
}

const key = (net) => net.toLowerCase().replace(/\s+/g, '');
const flatName = (net) => net.replace(/\s+/g, '').replace(/\((\d+)\)/g, '_$1').replace(/[^A-Za-z0-9_]/g, '_');

/**
 * Hierarchical VHDL for the flat netlist `text`: `groups` are the instance labels of the top of
 * the original design (e.g. ['control', 'data', 'access_module', 'disp_basys2SL']); a primitive
 * goes to the group whose label prefixes its name. Returns { text, groups: { label: count } }.
 */
export function regroupNetlist(text, groups) {
  const n = parseNetgenVhdl(text);
  const labels = [...groups].filter(Boolean).sort((a, b) => b.length - a.length);
  const groupOf = (inst) => labels.find((l) => inst.name.toLowerCase().startsWith(`${l.toLowerCase()}_`)) || null;
  const members = new Map(labels.map((l) => [l, []]));
  const topInsts = [];
  for (const i of n.instances) { const g = groupOf(i); if (g) members.get(g).push(i); else topInsts.push(i); }
  // who drives / uses each net: group label, or '' for the top level (its primitives and ports)
  const drivers = new Map(), users = new Map();
  const note = (map, net, who) => { const k = key(net); if (!map.has(k)) map.set(k, new Set()); map.get(k).add(who); };
  for (const p of n.ports) (p.dir === 'in' ? note(drivers, p.name, '') : note(users, p.name, ''));
  for (const i of n.instances) {
    const who = groupOf(i) || '';
    for (const pn of i.pins) (OUT_PINS.has(pn.pin.toUpperCase()) ? note(drivers, pn.net, who) : note(users, pn.net, who));
  }
  const used = new Map();   // label -> Set of net keys it touches
  const counts = {};
  const out = [n.header.replace(/^\s*library\s+\w+\s*;[\s\S]*$/im, '').trimEnd() ? '' : '', '-- Hierarchical technology netlist (regrouped by Silinx from the flat netgen netlist)'];
  const lib = 'library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nlibrary UNISIM;\nuse UNISIM.VCOMPONENTS.ALL;\n';
  const entities = [];
  const groupPorts = new Map();
  for (const [label, insts] of members) {
    if (!insts.length) continue;
    counts[label] = insts.length;
    const nets = new Map();   // key -> original net text
    for (const i of insts) for (const pn of i.pins) nets.set(key(pn.net), pn.net);
    used.set(label, new Set(nets.keys()));
    const ports = [], internals = [];
    const names = new Set();
    const uniq = (nm) => { let s = nm, k = 1; while (names.has(s.toLowerCase())) s = `${nm}_${k++}`; names.add(s.toLowerCase()); return s; };
    const local = new Map();
    for (const [k, net] of nets) {
      const outside = [...(drivers.get(k) || []), ...(users.get(k) || [])].some((w) => w !== label);
      const nm = uniq(flatName(net));
      local.set(k, nm);
      if (outside) ports.push({ name: nm, net, dir: (drivers.get(k) || new Set()).has(label) ? 'out' : 'in' });
      else internals.push(nm);
    }
    groupPorts.set(label, ports);
    const body = insts.map((i) => `  ${i.name} : ${i.type}\n${i.generics ? `    generic map (\n      ${i.generics.replace(/\n\s*/g, '\n      ')}\n    )\n` : ''}    port map (\n${i.pins.map((pn) => `      ${pn.pin} => ${local.get(key(pn.net))}`).join(',\n')}\n    );`).join('\n');
    entities.push(`${lib}
entity ${label} is
  port (
${ports.map((p) => `    ${p.name} : ${p.dir} STD_LOGIC`).join(';\n')}
  );
end ${label};

architecture STRUCTURE of ${label} is
${internals.map((s) => `  signal ${s} : STD_LOGIC;`).join('\n')}
begin
${body}
end STRUCTURE;
`);
  }
  // top: original ports and signals, its own primitives, one instance per group
  const top = `${lib}
entity ${n.entity} is
  port (
${n.ports.map((p) => `    ${p.name} : ${p.dir} ${p.type}`).join(';\n')}
  );
end ${n.entity};

architecture STRUCTURE of ${n.entity} is
${n.signals.map((s) => `  signal ${s.name} : ${s.type};`).join('\n')}
begin
${topInsts.map((i) => `  ${i.name} : ${i.type}\n${i.generics ? `    generic map (\n      ${i.generics.replace(/\n\s*/g, '\n      ')}\n    )\n` : ''}    port map (\n${i.pins.map((pn) => `      ${pn.pin} => ${pn.net}`).join(',\n')}\n    );`).join('\n')}
${[...groupPorts].filter(([l]) => counts[l]).map(([label, ports]) => `  ${label} : entity work.${label}\n    port map (\n${ports.map((p) => `      ${p.name} => ${p.net}`).join(',\n')}\n    );`).join('\n')}
end STRUCTURE;
`;
  return { text: [out.filter(Boolean).join('\n'), ...entities, top].join('\n'), groups: counts, topPrimitives: topInsts.length };
}

/**
 * Speed up the simulation of a netgen netlist: its internal vector signals (carry chains, LUT
 * outputs of adders …) are split into single-bit signals, so that each primitive pin connects
 * to a whole signal (no glue process per bit, no wake-up of every reader of the vector).
 * Ports keep their types. The behaviour is unchanged.
 */
export function scalarizeNetlist(text) {
  const arch = /(\barchitecture\s+(\w+)\s+of\s+\w+\s+is)([\s\S]*?)(\bbegin\b)([\s\S]*?)(\bend\s+\2\s*;)/i.exec(text);
  if (!arch) return text;
  const taken = new Set([...text.matchAll(/\b(\w+)\b/g)].map((m) => m[1].toLowerCase()));
  const vec = new Map();   // name (lower) -> { name, lo, hi, scalar(i) }
  const decls = arch[3].replace(/^(\s*)signal\s+(\w+)\s*:\s*STD_LOGIC_VECTOR\s*\(\s*(\d+)\s+(downto|to)\s+(\d+)\s*\)\s*;/gim, (all, ind, name, a, dir, b) => {
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
  if (!vec.size) return text;
  const body = arch[5].replace(/\b(\w+)\s*\(\s*(\d+)\s*\)/g, (all, name, i) => vec.get(name.toLowerCase())?.[+i] ?? all);
  return text.slice(0, arch.index) + arch[1] + decls + arch[4] + body + arch[6] + text.slice(arch.index + arch[0].length);
}
