// Silinx HLS (#1786): arrays of two or more dimensions in synthesis, as Vitis HLS makes them by default: an array of
// N x M x … elements one array (a memory, an argument one ap_memory) of N*M*… words, a[i][j] at i*M + j (row-major),
// its initializer's nested lists its words in order. On the checked syntax tree, before core/c-dataflow.js and
// core/c-fsmd.js (the C simulation keeps its dimensions), in the functions made into hardware. A row of it alone (a[i]
// passed to a function) is said there.
// Isomorphic ES module.
//
//   flattenArrays(checked, report) -> the names flattened ('function:name')

/** A type's dimensions (an array of arrays: [N, M, …]) and its element type, or null. */
function dims(t) {
  const ds = [];
  let at = t;
  if (at?.kind === 'ptr' && at.to?.kind === 'array') { ds.push(null); at = at.to; }
  for (; at?.kind === 'array'; at = at.of) ds.push(at.length ?? null);
  return ds.length > 1 ? { ds, of: at } : null;
}
const num = (v, loc) => ({ kind: 'num', value: BigInt(v), text: String(v), loc });
/** The functions made into hardware: the top and the functions it names (calls, hls::task's), the test bench's main()
 *  not one (#1820). */
function hardware(checked) {
  const seen = new Set();
  const visit = (name) => {
    const f = checked.funcs.get(name);
    if (!f?.body || seen.has(name)) return;
    seen.add(name);
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.kind === 'id') visit(n.name);
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') walk(v);
    };
    walk(f.body);
  };
  visit(checked.top);
  return seen;
}

export function flattenArrays(checked, report) {
  const done = [];
  const globals = new Map();
  /** A declaration's (a variable's or a parameter's) array of dimensions made one: its dimensions kept for its uses. */
  const flat = (v, where) => {
    const d = dims(v.type);
    if (!d) return null;
    if (d.ds.slice(1).some((x) => !x)) { report(v.loc, `'${v.name}': an array's dimensions but the first must be constants`); return null; }
    const inner = d.ds.slice(1).reduce((a, b) => a * b, 1);
    const n = d.ds[0] ? d.ds[0] * inner : null;
    v.type = { kind: 'array', of: d.of, size: n ? num(n, v.loc) : null, length: n, flat: d.ds };
    if (v.init?.kind === 'init') {
      const items = [];
      const walk = (x) => { if (x?.kind === 'init') x.items.forEach(walk); else items.push(x); };
      walk(v.init);
      v.init = { ...v.init, items };
    }
    done.push(`${where}:${v.name}`);
    return d.ds;
  };
  for (const it of checked.ast.items) if (it.kind === 'var') { const ds = flat(it, 'global'); if (ds) globals.set(it.name, ds); }
  const hw = hardware(checked);
  for (const f of checked.funcs.values()) {
    if (!f.body || !hw.has(f.name)) continue;
    const scope = [new Map(globals)];
    const look = (n) => { for (let k = scope.length - 1; k >= 0; k--) if (scope[k].has(n)) return scope[k].get(n); return null; };
    const top = new Map();
    for (const pa of f.params) { if (pa.name) { const ds = flat(pa, f.name); if (ds) top.set(pa.name, ds); } }
    scope.push(top);
    /** The index chain e (…[i][j]) of an array flattened: one index, row-major. */
    const index = (e) => {
      const idx = [];
      let b = e;
      while (b.kind === 'index') { idx.unshift(b.i); b = b.e; }
      if (b.kind !== 'id') return null;
      const ds = look(b.name);
      if (!ds) return null;
      if (idx.length !== ds.length) { report(e.loc, `'${b.name}': an array of ${ds.length} dimensions indexed by ${idx.length} (a row of it alone is not supported yet)`); return null; }
      let lin = idx[0];
      for (let k = 1; k < ds.length; k++) lin = { kind: 'binary', op: '+', l: { kind: 'binary', op: '*', l: lin, r: num(ds[k], e.loc), loc: e.loc }, r: idx[k], loc: e.loc };
      return { kind: 'index', e: b, i: lin, idx, loc: e.loc };   // (idx: each dimension's, for ARRAY_PARTITION, core/c-partition.js)
    };
    const visit = (n) => {
      if (!n || typeof n !== 'object') return n;
      if (Array.isArray(n)) return n.map(visit);
      if (n.kind === 'block') { scope.push(new Map()); try { n.items = n.items.map(visit); } finally { scope.pop(); } return n; }
      if (n.kind === 'for') {
        scope.push(new Map());
        try { for (const k of ['init', 'cond', 'step', 'body']) n[k] = visit(n[k]); } finally { scope.pop(); }
        return n;
      }
      if (n.kind === 'decl') {
        for (const v of n.vars) {
          if (v.init) v.init = visit(v.init);
          const ds = flat(v, f.name);
          scope.at(-1).set(v.name, ds);
        }
        return n;
      }
      if (n.kind === 'index') {
        const r = index(n);
        if (r) { r.i = visit(r.i); r.idx = r.idx.map(visit); return r; }
      }
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') n[k] = visit(v);
      return n;
    };
    f.body = visit(f.body);
  }
  return done;
}
