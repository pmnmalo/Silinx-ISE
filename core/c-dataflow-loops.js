// Silinx HLS (#1706): a loop among a DATAFLOW region's calls, a process of its own as Vitis HLS makes it (its
// Loop_…_proc): the loop the body of a function Loop_<k>_proc, its parameters the arguments of the top and the region's
// streams and arrays it uses, and a call of it where the loop was. Only in a region of streams (one of none is made
// sequential, said, core/c-processes.js). On the checked syntax tree, before core/c-processes.js; a process's module,
// made from a check of its own, gets the same functions by the same pass. Isomorphic ES module.
//
//   regionLoops(checked) -> how many loops were made processes (checked.funcs has them, the top's body calls them)
const LOOPS = new Set(['for', 'while', 'do']);

/** The names a statement uses and does not declare, in order; written: those assigned. */
function freeNames(st) {
  const inner = new Set(), used = [], written = new Set();
  const lhs = (e) => (e?.kind === 'id' ? e.name : null);
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.kind === 'decl') x.vars.forEach((v) => inner.add(v.name));
    if (x.kind === 'id' && !used.includes(x.name)) used.push(x.name);
    if (x.kind === 'assign' && lhs(x.l)) written.add(lhs(x.l));
    if ((x.kind === 'unary' || x.kind === 'postfix') && ['++', '--', '&'].includes(x.op) && lhs(x.e)) written.add(lhs(x.e));
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'callee') walk(v);
    if (x.kind === 'call' && x.callee?.kind !== 'id') walk(x.callee);
  };
  walk(st);
  return { names: used.filter((n) => !inner.has(n)), written: [...written].filter((n) => !inner.has(n)) };
}

export function regionLoops(checked) {
  const fn = checked.funcs.get(checked.top);
  const region = new Map();
  for (const st of fn.body.items) if (st.kind === 'decl') for (const v of st.vars) region.set(v.name, v);
  const params = new Map(fn.params.map((p) => [p.name, p]));
  let made = 0;
  const items = fn.body.items.map((st) => {
    if (!LOOPS.has(st.kind)) return st;
    const { names, written } = freeNames(st);
    const args = [];
    for (const n of names) {
      const v = region.get(n), p = params.get(n);
      // (a variable of the region or a scalar it writes: not a channel, said by core/c-processes.js)
      if (v && !['stream', 'array'].includes(v.type.kind)) return st;
      if (p && !['stream', 'array', 'ptr'].includes(p.type.kind) && written.includes(n)) return st;
      if (v || p) args.push({ name: n, type: (v ?? p).type });
    }
    const name = `Loop_${made++}_proc`;
    checked.funcs.set(name, { name, kind: fn.kind, ret: { kind: 'void' }, params: args.map((a) => ({ name: a.name, type: a.type, loc: st.loc })), body: { kind: 'block', items: [st], loc: st.loc }, loc: st.loc });
    return { kind: 'expr', loc: st.loc, e: { kind: 'call', loc: st.loc, callee: { kind: 'id', name, loc: st.loc }, args: args.map((a) => ({ kind: 'id', name: a.name, loc: st.loc })) } };
  });
  if (made) checked.funcs.set(checked.top, { ...fn, body: { ...fn.body, items } });
  return made;
}
