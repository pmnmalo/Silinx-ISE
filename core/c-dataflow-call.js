// Silinx HLS (#1931): a DATAFLOW region in a function the top calls, as Vitis HLS makes it: the top's only statement a
// call of that function (a function template's instance too), the region made as the top's (core/c-processes.js), its
// parameters the top's arguments (or the constants given), so the same behaviour at the top's ports. Through as many
// such calls as there are (the top calling a function calling the region's). The top's own pragmas kept (its
// INTERFACE), the callee's after them, its port= the top's argument. Another shape is said (a region of streams; one
// of none inlined as before, sequential). On the checked syntax
// tree, before core/c-processes.js. Isomorphic ES module.
//
//   dataflowCall(checked, report) -> whether the top's region is now the callee's (checked.funcs' top replaced)
import { hasDataflow, constValue } from './c-check.js';

const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  f(x);
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') walk(v, f);
};
/** A copy of x with each node f maps replaced (f(n) undefined: n kept, its children mapped). */
const map = (x, f) => {
  if (!x || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map((y) => map(y, f));
  const r = f(x);
  if (r !== undefined) return r;
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = k === 'loc' || k === 'type' ? v : map(v, f);
  return out;
};

/** The call the top makes alone (its statements other than pragmas and a last `return;`), or null. */
function onlyCall(fn) {
  const items = fn.body.items.filter((s) => s.kind !== 'pragma');
  if (items.at(-1)?.kind === 'return' && !items.at(-1).e) items.pop();
  const e = items.length === 1 && items[0].kind === 'expr' ? items[0].e : null;
  return e?.kind === 'call' && e.callee.kind === 'id' ? e : null;
}

/** The function holding a DATAFLOW region fn calls (directly or through others), with fn's call on the way, or null. */
function callsRegion(fn, funcs, seen = new Set()) {
  let hit = null;
  walk(fn.body, (n) => {
    if (hit || n.kind !== 'call' || n.callee.kind !== 'id' || seen.has(n.callee.name)) return;
    const g = funcs.get(n.callee.name);
    if (!g?.body) return;
    seen.add(g.name);
    const f = hasDataflow(g) ? g : callsRegion(g, funcs, seen)?.f;
    if (f) hit = { call: n, f };
  });
  return hit;
}

/** Whether fn declares streams of its own (a region's FIFOs). */
export function hasStreams(fn) {
  let hit = false;
  walk(fn.body, (n) => { if (n.kind === 'decl' && n.vars.some((v) => v.type?.kind === 'stream' || v.type?.of?.kind === 'stream')) hit = true; });
  return hit;
}

export function dataflowCall(checked, report) {
  const top = checked.funcs.get(checked.top);
  if (!top?.body || hasDataflow(top)) return false;
  const hit = callsRegion(top, checked.funcs);
  // (a region of no streams of its own: inlined, sequential, as before)
  if (!hit || !hasStreams(hit.f)) return false;
  let fn = top;
  for (let depth = 0; !hasDataflow(fn) && depth < 16; depth++) {
    const call = onlyCall(fn);
    const f = call && checked.funcs.get(call.callee.name);
    // (among other statements: a sub-module of its own, core/c-submodule.js, #1706)
    if (!f?.body) return false;
    // (its parameters: the caller's arguments, or the constants given)
    const subst = new Map(), mine = new Set(fn.params.map((p) => p.name));
    for (const [i, p] of f.params.entries()) {
      const a = call.args[i];
      if (a?.kind === 'id' && mine.has(a.name)) subst.set(p.name, a);
      else if (a && constValue(a) !== null) subst.set(p.name, a);
      else { report(call.loc, `#pragma HLS DATAFLOW in '${f.name}': its argument '${p.name}' an argument of '${fn.name}' or a constant (not an expression, yet)`); return false; }
    }
    // (a name of its own that is one of the caller's arguments: not the same)
    const own = [];
    walk(f.body, (n) => { if (n.kind === 'decl') own.push(...n.vars.filter((v) => mine.has(v.name)).map((v) => v)); });
    if (own.length) { report(own[0].loc, `#pragma HLS DATAFLOW in '${f.name}': its variable '${own[0].name}' is named as an argument of '${fn.name}' (rename it)`); return false; }
    const body = map(f.body, (n) => {
      if (n.kind === 'id' && subst.has(n.name)) return { ...subst.get(n.name), loc: n.loc };
      if (n.kind === 'pragma') {
        const key = ['port', 'variable'].find((k) => subst.get(n.pragma.args?.[k])?.kind === 'id');
        if (key) return { ...n, pragma: { ...n.pragma, args: { ...n.pragma.args, [key]: subst.get(n.pragma.args[key]).name } } };
      }
      return undefined;
    });
    fn = { ...fn, body: { ...body, items: [...fn.body.items.filter((s) => s.kind === 'pragma'), ...body.items] } };
  }
  if (!hasDataflow(fn)) return false;
  checked.funcs.set(checked.top, fn);
  checked.dataflow = true;
  return true;
}
