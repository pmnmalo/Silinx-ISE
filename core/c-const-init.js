// Silinx HLS (#1779): a table computed at synthesis, as Vitis HLS computes one into a ROM. A call (a statement of its
// own, in a synthesized function's body) of a function that only writes its array arguments from constants (it reads
// neither them nor any other argument, no global but a constant, calls no function but math.h's) is run by the C
// simulation (core/c-interp.js) at synthesis: its values become the arrays' initial ones, each array constant (a ROM)
// when nothing else writes it; the call is dropped. So math.h's functions and float arithmetic of any kind may fill a
// table, its values exactly the C simulation's. Before core/c-dataflow.js and core/c-fsmd.js. Isomorphic ES module.
// A static object's constructor (#1964, core/c-struct.js's calls) likewise: run when the source is checked, its
// arguments constants, its body reading only constants; the object's variables get its results as initial values, in
// the C simulation as in synthesis, so its state is a register set at the reset.
//
//   foldTables(checked) -> the names of the tables folded ('function:array')
//   foldResetCtors({ ast, funcs, globals, consts }, typeOk, report)
import { runAtSynthesis, runAtReset } from './c-interp.js';
import { MATH } from './c-float.js';
import { fixedToDouble } from './c-fixed.js';

const walk = (n, f) => {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach((x) => walk(x, f)); return; }
  f(n);
  for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') walk(v, f);
};

/** Whether fn only writes its parameters (arrays), from constants: no read of a parameter, no global but constants, no
 *  call but math.h's. */
function pureInit(fn, globals) {
  if (!fn?.body || !fn.params.length || fn.params.some((p) => p.type.kind !== 'array' && p.type.kind !== 'ptr')) return false;
  const params = new Set(fn.params.map((p) => p.name));
  const locals = new Set();
  walk(fn.body, (n) => { if (n.kind === 'var') locals.add(n.name); if (n.kind === 'decl') n.vars.forEach((v) => locals.add(v.name)); });
  let ok = true;
  const written = new Set();
  walk(fn.body, (n) => {
    if (n.kind === 'assign' && n.l.kind === 'index' && n.l.e.kind === 'id' && params.has(n.l.e.name)) written.add(n.l);
    if (n.kind === 'call' && !(n.callee.kind === 'id' && MATH[n.callee.name])) ok = false;
    if (n.kind === 'pragma') return;
  });
  walk(fn.body, (n) => {
    if (n.kind === 'index' && n.e.kind === 'id' && params.has(n.e.name) && !written.has(n)) ok = false;   // (a parameter read)
    if (n.kind === 'id' && !params.has(n.name) && !locals.has(n.name) && !MATH[n.name]) {
      const g = globals.get(n.name);
      if (!g || !g.const) ok = false;
    }
  });
  return ok;
}

/** The text of a value as a literal of its type (a float's: the double nearest it, exactly). */
const literal = (v, t, loc) => (typeof v === 'number'
  ? { kind: 'float', text: Number.isFinite(v) ? (Object.is(v, -0) ? '-0.0' : v.toPrecision(17)) : v > 0 ? '1e999' : '-1e999', loc }
  : { kind: 'num', value: BigInt(v), text: String(v), loc });

export function foldTables(checked) {
  const { funcs } = checked;
  const globals = new Map(checked.ast.items.filter((it) => it.kind === 'var').map((it) => [it.name, it]));
  const done = [];
  for (const g of funcs.values()) {
    if (!g.body || g.name === 'main') continue;
    const items = g.body.items;
    const decls = new Map();
    walk(g.body, (n) => { if (n.kind === 'decl') for (const v of n.vars) if (v.type.kind === 'array') decls.set(v.name, v); });
    items.forEach((st, k) => {
      const e = st.kind === 'expr' ? st.e : null;
      if (!(e?.kind === 'call' && e.callee.kind === 'id')) return;
      const fn = funcs.get(e.callee.name);
      if (!fn || !e.args.length || !e.args.every((a) => a.kind === 'id' && decls.has(a.name) && !decls.get(a.name).init)) return;
      if (!pureInit(fn, globals)) return;
      // (the arrays written nowhere else in g)
      const names = new Set(e.args.map((a) => a.name));
      let other = false;
      walk(items.filter((x) => x !== st), (n) => {
        if (n.kind === 'assign' && n.l.kind === 'index' && n.l.e.kind === 'id' && names.has(n.l.e.name)) other = true;
        if ((n.kind === 'postfix' || (n.kind === 'unary' && (n.op === '++' || n.op === '--'))) && n.e.kind === 'index' && n.e.e.kind === 'id' && names.has(n.e.e.name)) other = true;
        if (n.kind === 'call') for (const a of n.args) if (a.kind === 'id' && names.has(a.name)) other = true;
      });
      if (other) return;
      const vs = runAtSynthesis(checked, fn, e.args.map((a) => decls.get(a.name)));
      if (!vs) return;
      e.args.forEach((a, i) => {
        const v = decls.get(a.name);
        v.init = { kind: 'init', items: vs[i].map((x) => literal(x, v.type, v.loc)), loc: v.loc };
        v.const = true;
        done.push(`${g.name}:${a.name}`);
      });
      items[k] = { kind: 'empty', loc: st.loc };
    });
  }
  return done;
}

const argName = (a) => (a.kind === 'id' ? a.name : a.kind === 'index' || (a.kind === 'unary' && a.op === '&') ? argName(a.e) : null);

/** What a constructor's run cannot depend on, in it and in the functions it calls: the first thing found, or null. */
function impureCtor(fn, funcs, globals, seen = new Set()) {
  if (seen.has(fn.name)) return null;
  seen.add(fn.name);
  const locals = new Set(fn.params.map((p) => p.name));
  walk(fn.body, (n) => { if (n.kind === 'decl') n.vars.forEach((v) => locals.add(v.name)); });
  let found = null;
  walk(fn.body, (n) => {
    if (found) return;
    if (n.kind === 'call' && n.callee.kind === 'id') {
      const g = funcs.get(n.callee.name);
      if (g?.body) found = impureCtor(g, funcs, globals, seen);
      else if (!MATH[n.callee.name]) found = `call '${n.callee.name}'`;
    } else if (n.kind === 'id' && !locals.has(n.name) && !funcs.has(n.name) && !MATH[n.name] && globals.has(n.name) && !globals.get(n.name).const) found = `read the variable '${n.name}'`;
  });
  return found;
}

export function foldResetCtors(checked, typeOk, report) {
  const { ast, funcs, globals } = checked;
  if (!ast.resetCtors?.size) return;
  const jobs = [];
  const sized = new Set();
  // (the types they use, ahead of the functions' checks)
  const sizes = (n) => {
    if (!n || typeof n !== 'object' || sized.has(n)) return;
    sized.add(n);
    if (['int', 'array', 'ptr', 'stream'].includes(n.kind) && (n.of !== undefined || n.to !== undefined || n.ap)) typeOk(n, n.loc);
    for (const [k, v] of Object.entries(n)) if (k !== 'loc') sizes(v);
  };
  for (const f of funcs.values()) {
    if (!f.body) continue;
    const seen = new Map(f.params.map((p) => [p.name, p]));
    const visit = (n) => {
      if (Array.isArray(n)) {
        n.forEach((x, k) => {
          const c = x?.kind === 'expr' && x.e.kind === 'call' && x.e.callee.kind === 'id' && ast.resetCtors.has(x.e.callee.name) ? x.e : null;
          const fn = c && funcs.get(c.callee.name);
          const own = fn ? c.args.filter((_, i) => /^ap_this_/.test(fn.params[i]?.name)) : [];
          const obj = own.length ? argName(own[0]) : null;
          const d = obj !== null ? seen.get(obj) ?? globals.get(obj) : null;
          if (!d?.static && !(d && globals.get(obj) === d)) { visit(x); return; }
          n[k] = { kind: 'empty', loc: x.loc };
          const name = obj.slice(0, obj.length - fn.params[c.args.indexOf(own[0])].name.length + 'ap_this'.length);
          const given = c.args.filter((a) => !own.includes(a));
          const vars = new Map();
          let wrong = null;
          walk(given, (a) => {
            if (a.kind !== 'id' || funcs.has(a.name) || MATH[a.name]) return;
            const v = seen.get(a.name);
            if (v?.kind === 'var' && v.const && v.init) vars.set(a.name, v);
            else if (v || !globals.get(a.name)?.const) wrong ??= a.name;
          });
          if (wrong) { report(x.loc, `'${name}': a static object's constructor runs at synthesis, its state set at the reset: its argument '${wrong}' must be a constant`); return; }
          const impure = impureCtor(fn, funcs, globals);
          if (impure) { report(x.loc, `'${name}': a static object's constructor runs at synthesis, its state set at the reset: it cannot ${impure}`); return; }
          for (const a of own) { const v = seen.get(argName(a)) ?? globals.get(argName(a)); if (v) vars.set(argName(a), v); }
          sizes([fn, [...vars.values()]]);
          jobs.push({ call: c, vars: [...vars.values()], loc: x.loc, name });
        });
        return;
      }
      if (!n || typeof n !== 'object') return;
      if (n.kind === 'decl') for (const v of n.vars) seen.set(v.name, v);
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') visit(v);
    };
    visit(f.body);
  }
  sizes(jobs.flatMap((j) => j.vars));
  for (const f of funcs.values()) if (f.body && jobs.length) sizes(f.body);
  const cells = runAtReset(checked, jobs);
  for (const j of jobs) if (j.error) report(j.loc, `'${j.name}': a static object's constructor runs at synthesis, its state set at the reset: ${j.error}`);
  for (const [d, c] of cells) {
    // (an ap_fixed's: its value, not its bits)
    const value = (x) => literal(c.t?.fx ? fixedToDouble({ v: x.v, t: c.t }) : x.v, d.type, d.loc);
    d.init = c.arr ? { kind: 'init', items: c.arr.map(value), loc: d.loc } : value(c);
  }
  // (a global's: its function gone)
  for (const [name] of funcs) if (/^ap_global_ctor\d+$/.test(name)) funcs.delete(name);
  ast.items = ast.items.filter((it) => !(it.kind === 'func' && /^ap_global_ctor\d+$/.test(it.name)));
}
