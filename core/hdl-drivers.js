// Where a signal of a design is assigned (#3178): a hierarchical name (u_pre.cnt: the instance u_pre of the top, its
// signal cnt) to the processes and concurrent assignments that drive it, in the compiled design (core/compile.js). For
// the timing paths of a tool whose netlist keeps no source positions (ISE's trce: XST's names), as the Silinx
// toolchain's paths have theirs from Yosys's src attributes.
//
//   const where = signalDrivers(lib, top)   // lib: compile(sources)
//   where('u_pre.cnt')                      // [{ file, line, block }], [] when the name is no signal of the design

// the names an item assigns: every target of its statements (an index, a slice, a record field: their signal)
function targets(node, out = new Set()) {
  if (Array.isArray(node)) { for (const x of node) targets(x, out); return out; }
  if (!node || typeof node !== 'object') return out;
  if (node.target) {
    let t = node.target;
    while (t && !t.name && (t.base || t.a)) t = t.base || t.a;
    if (t?.name) out.add(t.name);
    for (const p of t?.parts || node.target.parts || []) targets({ target: p }, out);
  }
  for (const [k, v] of Object.entries(node)) if (k !== 'target' && k !== 'loc' && v && typeof v === 'object') targets(v, out);
  return out;
}

/** A function from a hierarchical signal name of the design whose top is `top` to the lines that assign it. */
export function signalDrivers(lib, top) {
  const mods = new Map();
  for (const m of lib?.modules?.values?.() || []) if (m.kind !== 'package') mods.set(m.name.toLowerCase(), m);
  const assigns = new Map();   // module -> Map(signal lower case -> [{ file, line, block }])
  const of = (m) => {
    if (!assigns.has(m)) {
      const map = new Map();
      for (const it of m.items || []) {
        if (it.kind === 'instance' || !it.loc) continue;
        const where = { file: m.file, line: it.loc.line, block: it.label || `${it.kind === 'assign' ? 'assign' : 'process'}_${it.loc.line}` };
        for (const n of targets(it.kind === 'assign' ? { target: it.target } : it)) {
          const k = n.toLowerCase();
          if (!map.has(k)) map.set(k, []);
          if (!map.get(k).some(x => x.line === where.line)) map.get(k).push(where);
        }
      }
      assigns.set(m, map);
    }
    return assigns.get(m);
  };
  return (name) => {
    const parts = String(name || '').split('.');
    let m = mods.get(String(top || '').toLowerCase());
    for (const inst of parts.slice(0, -1)) {
      const it = (m?.items || []).find(x => x.kind === 'instance' && x.name?.toLowerCase() === inst.toLowerCase());
      m = it && mods.get(String(it.module).toLowerCase());
      if (!m) return [];
    }
    return m ? of(m).get(parts.at(-1).toLowerCase()) || [] : [];
  };
}
