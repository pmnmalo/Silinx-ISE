// Silinx HLS (#1779): a table computed at synthesis, as Vitis HLS computes one into a ROM. A call (a statement of its
// own, in a synthesized function's body) of a function that only writes its array arguments from constants (it reads
// neither them nor any other argument, no global but a constant, calls no function but math.h's) is run by the C
// simulation (core/c-interp.js) at synthesis: its values become the arrays' initial ones, each array constant (a ROM)
// when nothing else writes it; the call is dropped. So math.h's functions and float arithmetic of any kind may fill a
// table, its values exactly the C simulation's. A loop in the function's own body likewise (#2151, foldLoops): its writes
// to arrays depending only on constants and its own index. Before core/c-dataflow.js and core/c-fsmd.js. Isomorphic ES
// module.
// A static object's constructor (#1964, core/c-struct.js's calls) likewise: run when the source is checked, its
// arguments constants, its body reading only constants; the object's variables get its results as initial values, in
// the C simulation as in synthesis, so its state is a register set at the reset.
//
//   foldTables(checked, diagnostics) -> the names of the tables folded ('function:array'); the warnings of the loops no
//   longer made taken out of diagnostics
//   foldResetCtors({ ast, funcs, globals, consts }, typeOk, report)
import { runAtSynthesis, runAtReset } from './c-interp.js';
import { MATH } from './c-float.js';

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

const elementOf = (t) => { while (t.kind === 'array') t = t.of; return t; };
// (an ap_fixed's literal a double, exactly: its bits no more than a double's)
const tooWide = (t) => { const e = elementOf(t); return !!e.fixed && e.bits > 53; };
const fixedValue = (v, e) => Number(e.signed ? BigInt.asIntN(e.bits, v) : BigInt.asUintN(e.bits, v)) * 2 ** (e.ibits - e.bits);

/** The text of a value as a literal of its type (a float's: the double nearest it, exactly). */
const literal = (x, t, loc) => (elementOf(t).fixed ? numeric(fixedValue(x, elementOf(t)), loc) : numeric(x, loc));
const numeric = (v, loc) => (typeof v === 'number'
  ? { kind: 'float', text: Number.isFinite(v) ? (Object.is(v, -0) ? '-0.0' : v.toPrecision(17)) : v > 0 ? '1e999' : '-1e999', loc }
  : { kind: 'num', value: BigInt(v), text: String(v), loc });

// (an element's lvalue: the id its indexes end in, or null)
const baseOf = (n) => { while (n?.kind === 'index') n = n.e; return n?.kind === 'id' ? n : null; };
const isLvalueOp = (n) => n.kind === 'postfix' || (n.kind === 'unary' && ['++', '--', '&', '*'].includes(n.op));
const namesIn = (n) => { const out = []; walk(n, (x) => { if (x.kind === 'id') out.push(x); }); return out; };

/** The arrays and the variables around a loop (a statement of g's own body, after the declarations seen) it may be run
 *  with: { targets: the arrays it writes, env: the declarations it needs }, or null when it depends on anything but
 *  constants and its own index, or is not the only writer of an array. */
function constantLoop(loop, g, seen, globals, others) {
  const inner = new Set();
  let ok = true;
  walk(loop, (n) => { if (n.kind === 'decl') n.vars.forEach((v) => { inner.add(v.name); if (v.static) ok = false; }); });
  const params = new Set(g.params.map((p) => p.name));
  if ([...inner].some((x) => seen.has(x) || params.has(x))) return null;
  // (the arrays it writes, their elements only and whole by '=')
  const targets = new Map(), bases = new Set(), callees = new Set();
  walk(loop, (n) => {
    if (['return', 'goto', 'member'].includes(n.kind)) ok = false;
    if (n.kind === 'call' && !(n.callee.kind === 'id' && MATH[n.callee.name])) ok = false;
    if (n.kind === 'call') callees.add(n.callee);
    if (n.kind === 'assign' || isLvalueOp(n)) {
      const l = n.kind === 'assign' ? n.l : n.e;
      if (l.kind === 'id') { if (n.op === '&') ok = false; return; }
      const b = baseOf(l), v = b && seen.get(b.name);
      if (!b || n.kind !== 'assign' || n.op !== '=' || !v || v.type.kind !== 'array' || v.init || v.const || v.type.const || elementOf(v.type).kind === 'struct' || elementOf(v.type).volatile || tooWide(v.type)) { ok = false; return; }
      targets.set(b.name, v);
      bases.add(b);
    }
  });
  if (!ok || !targets.size) return null;
  // (everything else it reads: its own variables, a variable used by it alone, a constant)
  const env = new Set(), usedOutside = (name) => others.some((x) => namesIn(x).some((i) => i.name === name));
  const constant = (name) => {
    const v = seen.get(name);
    if (!v) { const c = globals.get(name); return !!c?.const; }
    if (!v.const || !v.init || env.has(v)) return !!v.const && !!v.init;
    env.add(v);
    return namesIn(v.init).every((i) => constant(i.name) || MATH[i.name]);
  };
  for (const id of namesIn(loop)) {
    if (bases.has(id) || inner.has(id.name)) continue;
    if (callees.has(id)) continue;
    if (targets.has(id.name)) return null;   // (read by the loop: its values before it are not constants)
    if (constant(id.name)) continue;
    const v = seen.get(id.name);
    if (!v || v.type.kind === 'array' || v.type.kind === 'ptr' || v.type.volatile || v.static || usedOutside(id.name)) return null;
    if (v.init && !namesIn(v.init).every((i) => constant(i.name) || MATH[i.name])) return null;
    env.add(v);
  }
  return { targets: [...targets.values()], env: [...seen.values()].filter((v) => env.has(v)) };
}

/** Whether a table's only uses in the statements after its loop read its elements, and none before it. */
function onlyRead(name, before, after) {
  if (before.some((x) => namesIn(x).some((i) => i.name === name))) return false;
  const reads = new Set();
  let ok = true;
  walk(after, (n) => {
    if (n.kind === 'index') { const b = baseOf(n); if (b) reads.add(b); }
    if (n.kind === 'assign' || isLvalueOp(n)) { const b = baseOf(n.kind === 'assign' ? n.l : n.e); if (b?.name === name) ok = false; }
  });
  return ok && namesIn(after).every((i) => i.name !== name || reads.has(i));
}

/** The loops of g's own body that only fill arrays from constants: run, their arrays' values initial ones (#2151). */
function foldLoops(checked, g, globals, done, diagnostics) {
  const items = g.body.items;
  // (a name declared once in g: no other variable it could be)
  const count = new Map();
  walk(g.body, (n) => { if (n.kind === 'decl') n.vars.forEach((v) => count.set(v.name, (count.get(v.name) || 0) + 1)); });
  let goesTo = false;
  walk(g.body, (n) => { if (n.kind === 'goto') goesTo = true; });
  if (goesTo) return;
  const seen = new Map();
  items.forEach((st, k) => {
    if (st.kind === 'decl') { st.vars.forEach((v) => seen.set(v.name, v)); return; }
    let loop = st;
    while (loop.kind === 'label') loop = loop.stmt;
    if (!['for', 'while', 'do'].includes(loop.kind)) return;
    const others = items.filter((x) => x !== st).map((x) => (x.kind === 'decl' ? x.vars.map((v) => v.init) : x));
    const r = constantLoop(loop, g, seen, globals, others);
    if (!r || r.targets.some((v) => count.get(v.name) !== 1 || !onlyRead(v.name, items.slice(0, k).filter((x) => x.kind !== 'decl'), items.slice(k + 1)))) return;
    const fn = { name: g.name, params: r.targets, ret: { kind: 'void' }, loc: st.loc,
      body: { kind: 'block', loc: st.loc, items: [...r.env.map((v) => ({ kind: 'decl', vars: [{ ...v, static: false }], loc: v.loc })), loop] } };
    const vs = runAtSynthesis(checked, fn, r.targets);
    if (!vs) return;
    r.targets.forEach((v, i) => {
      v.init = { kind: 'init', items: vs[i].map((x) => literal(x, v.type, v.loc)), loc: v.loc };
      v.const = true;
      done.push(`${g.name}:${v.name}`);
    });
    items[k] = { kind: 'empty', loc: st.loc };
    // (a variable only the loop used: no register of its own)
    for (const d of items) if (d.kind === 'decl') d.vars = d.vars.filter((v) => v.const || !r.env.includes(v));
    // (its count unknown to the check: said of a loop that is not made)
    const said = diagnostics.findIndex((d) => d.line === loop.loc?.line && /^the number of iterations of this loop is not known/.test(d.message));
    if (said >= 0) diagnostics.splice(said, 1);
  });
}

export function foldTables(checked, diagnostics = []) {
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
      if (!fn || !e.args.length || !e.args.every((a) => a.kind === 'id' && decls.has(a.name) && !decls.get(a.name).init && !tooWide(decls.get(a.name).type))) return;
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
    foldLoops(checked, g, globals, done, diagnostics);
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
    // (an ap_fixed's: its bits, literal's value of them)
    const value = (x) => literal(x.v, d.type, d.loc);
    d.init = c.arr ? { kind: 'init', items: c.arr.map(value), loc: d.loc } : value(c);
  }
  // (a global's: its function gone)
  for (const [name] of funcs) if (/^ap_global_ctor\d+$/.test(name)) funcs.delete(name);
  ast.items = ast.items.filter((it) => !(it.kind === 'func' && /^ap_global_ctor\d+$/.test(it.name)));
}
