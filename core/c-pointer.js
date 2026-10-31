// Silinx HLS (#1599): pointer arithmetic as Vitis HLS takes it (UG1399, Pointers): *(p + e), *(e + p) and *(p - e)
// are p[e] (p[-e]) in the syntax tree, for the C simulation and the synthesis alike; a pointer argument of a
// synthesized function indexed so (or as p[i], i not 0) is an array, a memory outside the module (ap_memory), its depth
// the INTERFACE pragma's depth= (else DEFAULT_DEPTH, said). Before core/c-check.js's checks of each function.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   pointerArithmetic(funcs, globals, synth, report, structArgs, top)   (funcs: Map name -> Func; synth: the
//   synthesized functions; structArgs: core/c-struct.js's, a pointer to structs' members said once by its name; top:
//   the one whose depths are said, #1684; depths: its pointer arguments' depths, a DATAFLOW process's, #1707)

export const DEFAULT_DEPTH = 1024;

const walk = (n, fn) => {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { for (const x of n) walk(x, fn); return; }
  fn(n);
  for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && k !== 'pragma' && v && typeof v === 'object') walk(v, fn);
};

/** The terms of a sum (+ and - nested): [{ x, neg }]. */
function terms(e, neg = false, out = []) {
  if (e.kind === 'binary' && (e.op === '+' || e.op === '-')) {
    terms(e.l, neg, out);
    terms(e.r, e.op === '-' ? !neg : neg, out);
  } else out.push({ x: e, neg });
  return out;
}

/** The sum of terms (none: 0), a node of the tree at loc. */
function sum(ts, loc) {
  if (!ts.length) return { kind: 'num', value: 0n, text: '0', loc };
  let e = ts[0].neg ? { kind: 'unary', op: '-', e: ts[0].x, loc } : ts[0].x;
  for (const t of ts.slice(1)) e = { kind: 'binary', op: t.neg ? '-' : '+', l: e, r: t.x, loc };
  return e;
}

export function pointerArithmetic(funcs, globals, synth, report, structArgs = new Map(), top = null, depths = null) {
  for (const f of funcs.values()) {
    if (!f.body) continue;
    // (the names of its pointers and arrays: its parameters', its variables', the globals')
    const ptrs = new Set([...globals].filter(([, v]) => v.type.kind === 'array' || v.type.kind === 'ptr').map(([n]) => n));
    for (const pa of f.params) if (pa.name && (pa.type.kind === 'ptr' || pa.type.kind === 'array')) ptrs.add(pa.name);
    walk(f.body, (n) => { if (n.kind === 'var' && (n.type.kind === 'ptr' || n.type.kind === 'array')) ptrs.add(n.name); });
    const isPtr = (x) => x.kind === 'id' && ptrs.has(x.name);
    // *(p + e) is p[e]
    walk(f.body, (n) => {
      if (!(n.kind === 'unary' && n.op === '*' && n.e.kind === 'binary' && (n.e.op === '+' || n.e.op === '-'))) return;
      const ts = terms(n.e);
      const ps = ts.filter((t) => isPtr(t.x));
      if (ps.length !== 1 || ps[0].neg) return;   // (a difference of pointers, two pointers: said by the checks)
      const base = ps[0].x, i = sum(ts.filter((t) => t !== ps[0]), n.loc);
      for (const k of Object.keys(n)) if (k !== 'loc') delete n[k];
      Object.assign(n, { kind: 'index', e: base, i, fromDeref: true });
    });
  }
  // a pointer argument indexed, or passed to a function whose parameter is one (its array, #1684): an array (ap_memory)
  const isArg = (pa) => pa.name && pa.type.kind === 'ptr' && pa.type.to.kind !== 'ptr' && pa.type.to.kind !== 'stream' && pa.type.to.kind !== 'struct';
  const arrays = new Set();
  for (let more = true; more;) {
    more = false;
    for (const f of funcs.values()) {
      if (!f.body || !synth.has(f.name)) continue;
      for (const pa of f.params) {
        if (!isArg(pa) || arrays.has(pa)) continue;
        let indexed = false;
        walk(f.body, (n) => {
          if (n.kind === 'index' && n.e.kind === 'id' && n.e.name === pa.name && !(n.i.kind === 'num' && n.i.value === 0n && !n.fromDeref)) indexed = true;
          if (n.kind === 'call' && n.callee.kind === 'id') {
            const g = funcs.get(n.callee.name);
            n.args.forEach((x, i) => { if (x.kind === 'id' && x.name === pa.name && g?.params[i] && arrays.has(g.params[i])) indexed = true; });
          }
        });
        if (indexed) { arrays.add(pa); more = true; }
      }
    }
  }
  for (const f of funcs.values()) {
    if (!f.body || !synth.has(f.name)) continue;
    for (const pa of f.params) {
      if (!arrays.has(pa)) continue;
      let depth = null;
      walk(f.body, (n) => { if (n.kind === 'pragma' && n.pragma.name === 'INTERFACE' && n.pragma.args.port === pa.name && n.pragma.args.depth !== undefined) depth = Number(n.pragma.args.depth); });
      // (a DATAFLOW process's: its caller's array's size, #1707)
      if (!(depth >= 1) && f.name === top && depths?.[pa.name] >= 1) depth = depths[pa.name];
      // (ap_fifo, ap_hs: no memory, no depth to say, #1901)
      let stream = false;
      walk(f.body, (n) => { if (n.kind === 'pragma' && n.pragma.name === 'INTERFACE' && !n.pragma.of && n.pragma.args.port === pa.name && /^ap_(fifo|hs)$/i.test(String(n.pragma.args.mode ?? Object.keys(n.pragma.args).find((k) => /^ap_/i.test(k))))) stream = true; });
      if (!(depth >= 1) && stream) depth = DEFAULT_DEPTH;
      if (!(depth >= 1)) {
        depth = DEFAULT_DEPTH;
        // (said of the top function's: the others are inlined, their arrays the caller's)
        const S = structArgs.get(f.name)?.find((a) => a.members.includes(pa.name));
        if (f.name === top && !S) report(pa.loc, `the pointer argument '${pa.name}' is indexed: a memory (ap_memory) of ${DEFAULT_DEPTH} elements, its depth not given (#pragma HLS INTERFACE port=${pa.name} depth=N)`, 'warning');
        else if (f.name === top && !S.said) {
          S.said = true;
          report(S.loc, `the pointer to structs '${S.name}' is indexed: a memory (ap_memory) of ${DEFAULT_DEPTH} structs, its depth not given (#pragma HLS INTERFACE port=${S.name} depth=N)`, 'warning');
        }
      }
      pa.type = { kind: 'array', of: pa.type.to, size: null, length: depth, fromPtr: true };
      // (*p of it: p[0])
      walk(f.body, (n) => {
        if (n.kind === 'unary' && n.op === '*' && n.e.kind === 'id' && n.e.name === pa.name) {
          const { e, loc } = n;
          for (const k of Object.keys(n)) if (k !== 'loc') delete n[k];
          Object.assign(n, { kind: 'index', e, i: { kind: 'num', value: 0n, text: '0', loc }, fromDeref: true });
        }
      });
    }
  }
}

// ------------------------------------------------------------------ pointer variables
// A local pointer of a synthesized function (dout_t *p = a; p = cond ? … ; p = &x; p += 1; int *q = &arr[0]): its
// value which of its targets (the arrays or variables it is set to: p_sel, when more than one) and an offset in it
// (p_off, when not always 0); *p and p[e] the target's element (a multiplexer of the targets' for a read), written
// only when it has one target. Its targets and offsets known where it is set; a pointer passed on or cast to another
// type is said, not supported yet.

const num = (v, loc) => ({ kind: 'num', value: BigInt(v), text: String(v), loc });
const id = (name, loc) => ({ kind: 'id', name, loc });
const INT_T = { kind: 'int', name: 'int', signed: true, bits: 32 };
const replace = (n, m) => { for (const k of Object.keys(n)) if (k !== 'loc') delete n[k]; Object.assign(n, m); };

/** walk with each node's parent and key (its parent's property holding it). */
function walkP(n, fn, parent = null, key = null) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach((x, i) => walkP(x, fn, parent, key)); return; }
  fn(n, parent, key);
  for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && k !== 'pragma' && v && typeof v === 'object') walkP(v, fn, n, k);
}

export function pointerVariables(funcs, globals, synth, report) {
  for (const f of funcs.values()) {
    if (!f.body || !synth.has(f.name)) continue;
    const decls = [];
    // (the types of the names it can point to: its parameters', its variables', the globals')
    const types = new Map([...globals].map(([n, g]) => [n, g.type]));
    for (const pa of f.params) if (pa.name) types.set(pa.name, pa.type);
    walkP(f.body, (n, parent) => {
      if (n.kind === 'var') types.set(n.name, n.type);
      if (n.kind === 'var' && n.type.kind === 'ptr' && parent?.kind === 'decl') decls.push({ v: n, decl: parent });
    });
    for (const { v, decl } of decls) pointerVariable(f, v, decl, types, report);
  }
}

function pointerVariable(f, v, decl, types, report) {
  const name = v.name;
  if (v.type.to.kind === 'ptr' || v.type.to.kind === 'struct' || v.type.to.kind === 'stream') return;   // (said by the checks)
  // its targets: { base, scalar, off }
  const bases = [];
  let bad = false;
  const fail = (loc, m) => { if (!bad) report(loc, `the pointer '${name}': ${m}`); bad = true; v.said = true; };   // (said once: core/c-check.js's own error left out)
  const sameType = (a, b) => a && b && a.kind === b.kind && a.bits === b.bits && !!a.signed === !!b.signed && !!a.fixed === !!b.fixed;
  const target = (e) => {
    const cast = e.kind === 'cast';
    while (e.kind === 'cast') { e.said = true; e = e.e; }   // (a cast of a pointer said here, not by core/c-check.js)   // (its target's own type checked below)
    let base = null, off = num(0, e.loc), scalar = false;
    if (e.kind === 'id') base = e.name;
    else if (e.kind === 'unary' && e.op === '&' && e.e.kind === 'id') { base = e.e.name; scalar = true; }
    else if (e.kind === 'unary' && e.op === '&' && e.e.kind === 'index' && e.e.e.kind === 'id') { base = e.e.e.name; off = e.e.i; }
    else if (e.kind === 'binary' && (e.op === '+' || e.op === '-') && e.l.kind === 'id') { base = e.l.name; off = e.op === '-' ? { kind: 'unary', op: '-', e: e.r, loc: e.loc } : e.r; }
    if (!base || base === name) { fail(e.loc, 'set to something other than an array, &x, &a[i] or a + i: not supported yet'); return null; }
    const bt = types.get(base);
    const et = scalar ? bt : bt?.kind === 'array' || bt?.kind === 'ptr' ? bt.of ?? bt.to : null;
    // (a cast to a narrower integer type, char *p = (char *)&a[i] (#1895): its elements the target's, r of them in one,
    // from its least significant bits, as on x86; its offset counted in its own elements)
    const to = v.type.to;
    const r = sameType(et, to) ? 1 : cast && !scalar && et?.kind === 'int' && to.kind === 'int' && !et.fixed && !to.fixed && et.bits && to.bits && et.bits % to.bits === 0 ? et.bits / to.bits : 0;
    if (!r || (r & (r - 1))) { fail(e.loc, `set to '${base}', of another type (a cast of a pointer): not supported (Vitis HLS: a cast of a pointer between native integer types, ${scalar ? 'to an array' : 'to a narrower one'})`); return null; }
    let j = bases.findIndex((b) => b.base === base);
    if (j < 0) { j = bases.length; bases.push({ base, scalar, r }); }
    if (bases[j].r !== r) { fail(e.loc, `set to '${base}' as another type before: not supported`); return null; }
    return { j, off: r === 1 ? off : off.kind === 'num' ? num(off.value * BigInt(r), e.loc) : { kind: 'binary', op: '*', l: off, r: num(r, e.loc), loc: e.loc } };
  };
  // its uses
  const sets = [], moves = [], reads = [], passes = [];
  if (v.init) sets.push({ init: true, t: target(v.init) });
  walkP(f.body, (n, parent, key) => {
    if (n.kind !== 'id' || n.name !== name || bad) return;
    if (parent.kind === 'unary' && parent.op === '&' && parent.said) { bad = true; v.said = true; return; }   // (&p to a pointer to a pointer refused: said, core/c-pointer-args.js)
    if (parent.kind === 'assign' && key === 'l') {
      if (parent.op === '=') sets.push({ node: parent, t: target(parent.r) });
      else if (parent.op === '+=' || parent.op === '-=') moves.push({ node: parent });
      else fail(parent.loc, `'${parent.op}' on it: not supported`);
    } else if ((parent.kind === 'postfix' || (parent.kind === 'unary' && (parent.op === '++' || parent.op === '--')))) moves.push({ node: parent });
    else if (parent.kind === 'unary' && parent.op === '*') reads.push({ node: parent, i: num(0, parent.loc) });
    else if (parent.kind === 'index' && key === 'e') reads.push({ node: parent, i: parent.i });
    else if (parent.kind === 'call' && key === 'args') passes.push(n);
    else fail(n.loc, 'used other than *p, p[i], p = …, p += …, p++ (passed on, compared): not supported yet');
  });
  if (bad || sets.some((s) => !s.t)) return;
  if (!bases.length) { report(v.loc, `the pointer '${name}' is never set`); v.said = true; return; }
  const many = bases.length > 1;
  const moving = moves.length > 0 || sets.some((s) => !(s.t.off.kind === 'num' && s.t.off.value === 0n));
  const sel = `${name}_sel`, off = `${name}_off`;
  // passed on to a function: its target (one, not moved, its own type)
  if (passes.length && (many || moving || bases[0].r > 1)) { report(passes[0].loc, `the pointer '${name}': passed on to a function ${many ? 'with several targets' : moving ? 'after it moves' : 'as another type'}: not supported yet`); v.said = true; return; }
  for (const n of passes) replace(n, bases[0].scalar ? { kind: 'unary', op: '&', e: id(bases[0].base, n.loc), loc: n.loc } : id(bases[0].base, n.loc));
  // its variables in its declaration's place
  const vars = [];
  if (many) vars.push({ kind: 'var', name: sel, type: { ...INT_T }, init: v.init ? num(sets[0].t.j, v.loc) : null, static: false, const: false, loc: v.loc });
  if (moving) vars.push({ kind: 'var', name: off, type: { ...INT_T }, init: v.init ? sets[0].t.off : null, static: false, const: false, loc: v.loc });
  decl.vars.splice(decl.vars.indexOf(v), 1, ...vars);
  // p = …: its target and offset set
  for (const s of sets.filter((x) => !x.init)) {
    const parts = [];
    if (many) parts.push({ kind: 'assign', op: '=', l: id(sel, s.node.loc), r: num(s.t.j, s.node.loc), loc: s.node.loc });
    if (moving) parts.push({ kind: 'assign', op: '=', l: id(off, s.node.loc), r: s.t.off, loc: s.node.loc });
    replace(s.node, parts.length === 2 ? { kind: 'comma', l: parts[0], r: parts[1] } : parts.length ? parts[0] : num(0, s.node.loc));
  }
  // p += n, p++: its offset moved
  for (const m of moves) {
    if (m.node.kind === 'assign') m.node.l = id(off, m.node.loc);
    else m.node.e = id(off, m.node.loc);
  }
  // *p, p[i]: the element (a written one: its target one)
  const elem = (b, i, loc) => {
    if (bases[b].scalar) return id(bases[b].base, loc);
    const k = moving ? { kind: 'binary', op: '+', l: id(off, loc), r: i, loc } : i, r = bases[b].r;
    if (r === 1) return { kind: 'index', e: id(bases[b].base, loc), i: k, loc };
    // (a narrower type's: its bits of the target's element, a[k / r] >> (k % r * W))
    const bin = (op, l, rr) => ({ kind: 'binary', op, l, r: rr, loc });
    const word = { kind: 'index', e: id(bases[b].base, loc), i: bin('>>', k, num(Math.log2(r), loc)), loc };
    return { kind: 'cast', type: { ...v.type.to }, e: bin('>>', word, bin('*', bin('&', structuredClone(k), num(r - 1, loc)), num(v.type.to.bits, loc))), loc };
  };
  walkP(f.body, (n, parent, key) => {
    const r = reads.find((x) => x.node === n);
    if (!r) return;
    const written = (parent?.kind === 'assign' && key === 'l') || parent?.kind === 'postfix' || (parent?.kind === 'unary' && (parent.op === '++' || parent.op === '--' || parent.op === '&'));
    if (bases.some((b) => b.scalar) && !(r.i.kind === 'num' && r.i.value === 0n && !moving)) { report(n.loc, `the pointer '${name}' to a variable: only *${name} (${name}[0])`); replace(n, elem(0, r.i, n.loc)); return; }
    if (written && bases.some((b) => b.r > 1)) { report(n.loc, `the pointer '${name}' (cast to a narrower type): written through it: not supported yet (only read)`); replace(n, elem(0, r.i, n.loc)); return; }
    if (written && many) { report(n.loc, `the pointer '${name}' (to one of ${bases.map((b) => b.base).join(', ')}): written through it: not supported yet (only read)`); replace(n, elem(0, r.i, n.loc)); return; }   // (said once: its first target's)
    let e = elem(bases.length - 1, r.i, n.loc);
    for (let b = bases.length - 2; b >= 0; b--) e = { kind: 'cond', c: { kind: 'binary', op: '==', l: id(sel, n.loc), r: num(b, n.loc), loc: n.loc }, a: elem(b, r.i, n.loc), b: e, loc: n.loc };
    replace(n, e);
  });
}
