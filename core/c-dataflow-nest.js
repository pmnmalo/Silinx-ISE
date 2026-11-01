// Silinx HLS (#1706): a DATAFLOW region calling a function that is a region of its own (a function template's instances
// too, Vitis HLS's unique task regions): the callee's processes and channels spliced into the caller's region, its
// parameters the caller's arguments, its variables named <callee>_<k>_<name>: the same processes, at once, as Vitis HLS's
// hierarchy of regions runs them. On the checked syntax tree, before core/c-dataflow-call.js. Isomorphic ES module.
//
//   nestRegions(checked) -> nothing (checked.funcs' regions hold their callees' regions' statements)
import { hasDataflow } from './c-check.js';

const map = (x, f) => {
  if (!x || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map((y) => map(y, f));
  const r = f(x);
  if (r !== undefined) return r;
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = k === 'loc' || k === 'type' ? v : map(v, f);
  return out;
};

/** The statements of region g, called with args, for its caller. Null when an argument is not a name. */
function spliced(g, args, prefix) {
  const subst = new Map();
  for (const [i, p] of g.params.entries()) {
    const a = args[i]?.kind === 'unary' && args[i].op === '*' ? args[i].e : args[i];
    if (a?.kind !== 'id') return null;
    subst.set(p.name, a.name);
  }
  const own = new Set();
  for (const st of g.body.items) if (st.kind === 'decl') for (const v of st.vars) own.add(v.name);
  const to = (n) => (own.has(n) ? prefix + n : subst.get(n) ?? n);
  const out = map(g.body.items, (n) => {
    if (n.kind === 'id') return { ...n, name: to(n.name) };
    if (n.kind === 'decl') return { ...n, vars: n.vars.map((v) => (own.has(v.name) ? { ...v, name: prefix + v.name } : v)) };
    if (n.kind === 'pragma' && n.pragma.args?.variable) return { ...n, pragma: { ...n.pragma, args: { ...n.pragma.args, variable: to(n.pragma.args.variable) } } };
    return undefined;
  });
  return out.filter((st) => !(st.kind === 'pragma' && st.pragma.name === 'DATAFLOW'));
}

export function nestRegions(checked) {
  const { funcs } = checked;
  const flat = (f, seen) => {
    let k = 0;
    const items = f.body.items.flatMap((st) => {
      const e = st.kind === 'expr' ? st.e : null;
      const g = e?.kind === 'call' && e.callee.kind === 'id' ? funcs.get(e.callee.name) : null;
      if (!g?.body || !hasDataflow(g) || seen.has(g.name)) return [st];
      const inner = flat(g, new Set([...seen, g.name]));
      return spliced(inner, e.args, `${g.name}_${k++}_`) ?? [st];
    });
    return k ? { ...f, body: { ...f.body, items } } : f;
  };
  for (const [name, f] of [...funcs]) if (f.body && hasDataflow(f)) funcs.set(name, flat(f, new Set([name])));
}
