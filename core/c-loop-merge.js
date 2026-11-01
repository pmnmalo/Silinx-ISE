// Silinx HLS (#1961): LOOP_FLATTEN and LOOP_MERGE as Vitis HLS makes them (UG1399), on a sequential module's code before
// its registers are made (core/c-fsmd.js). LOOP_FLATTEN in a loop: the loop made one with the loop around it, when that one
// holds nothing else and both counts are constants, and so on upward; off: left alone. LOOP_MERGE in a body: its
// consecutive loops made one, of the largest count (each body run while its own count lasts), or of their common bound when
// it is not a constant; not when one loop's values reach the other's in another order, unless `force` (the designer's word,
// as Vitis HLS's). What cannot be made keeps its loops, with a warning saying why. The C simulation runs the C as written:
// the results are the same. Isomorphic ES module: no DOM and no Node APIs.
//
//   mergeLoops(body, { trip, warn }) -> the body with its loops made one
//     trip(loop) -> { trip, max }, its count; warn(loc, message)
//     a loop made here carries its count in `count` (core/c-fsmd.js's loopCount)

const isLoop = (s) => s && (s.kind === 'for' || s.kind === 'while' || s.kind === 'do');
const INT = { kind: 'int', name: 'int', bits: 32, signed: true };
const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  if (f(x) === false) return;
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') walk(v, f);
};
const unlabel = (s) => { while (s?.kind === 'label') s = s.stmt; return s; };
const itemsOf = (l) => (l.body?.kind === 'block' ? l.body.items : [l.body]);
const inLoop = (s) => (s?.flatOf ? s.flatOf : unlabel(s));   // (a loop made here: its block of inits around it)
const pragmaOf = (l, name) => itemsOf(l).find((s) => s?.kind === 'pragma' && s.pragma.name === name)?.pragma ?? null;
const num = (v, loc) => ({ kind: 'num', value: BigInt(v), text: String(v), unsigned: false, long: false, loc });
const id = (name, loc) => ({ kind: 'id', name, loc });
const stmtOf = (e, loc) => ({ kind: 'expr', e, loc });
const block = (items, loc) => ({ kind: 'block', items, loc });
const not = (e, loc) => ({ kind: 'unary', op: '!', e, loc });
const strip = (x) => JSON.stringify(x, (k, v) => (k === 'loc' ? undefined : typeof v === 'bigint' ? `${v}` : v));

/** Why a loop cannot be made one with another: what jumps out of it, or null. */
function jumps(l) {
  let why = null;
  walk(l.body, (n) => {
    if (why) return false;
    if (n.kind === 'return') why = "a 'return' is in it";
    else if (n.kind === 'goto') why = "a 'goto' is in it";
    else if (n.kind === 'subcall') why = 'it calls a sub-module';
    else if (isLoop(n) || n.kind === 'switch') { if (hasJumpOut(n)) why = "a 'return' or a 'goto' is in it"; return false; }
    else if (n.kind === 'break' || n.kind === 'continue') why = `a '${n.kind}' is in it`;
    return !why;
  });
  return why;
}
function hasJumpOut(x) { let hit = false; walk(x, (n) => { if (n.kind === 'return' || n.kind === 'goto') hit = true; return !hit; }); return hit; }
/** The variables a statement writes, directly. */
function writes(x) {
  const out = new Set();
  const base = (e) => { while (e && (e.kind === 'index' || e.kind === 'member' || e.kind === 'paren' || (e.kind === 'unary' && e.op === '*'))) e = e.e; return e?.kind === 'id' ? e.name : null; };
  walk(x, (n) => {
    const t = n.kind === 'assign' ? n.l : n.kind === 'postfix' || (n.kind === 'unary' && (n.op === '++' || n.op === '--')) ? n.e : null;
    if (t && base(t)) out.add(base(t));
    if (n.kind === 'call') for (const a of n.args || []) if (base(a)) out.add(base(a));   // (a call may write what it is given)
    if (n.kind === 'call' && n.callee?.kind === 'member' && base(n.callee.e)) out.add(base(n.callee.e));   // (a stream's read or write)
  });
  return out;
}
const names = (x) => { const out = new Set(); walk(x, (n) => { if (n.kind === 'id') out.add(n.name); }); return out; };
const declared = (x) => { const out = new Set(); walk(x, (n) => { if (n.kind === 'decl') for (const v of n.vars) out.add(v.name); }); return out; };
const stepOf = (l) => (l.step ? [stmtOf(l.step, l.loc)] : []);
// (pre: what a loop made here starts with, its loops' inits)
const initsOf = (l) => [...(l.pre || []), ...(l.init ? [l.init.kind === 'decl' || l.init.kind === 'expr' ? l.init : stmtOf(l.init, l.loc)] : [])];
/** A loop's inits again, their declarations as assignments. */
const initAgain = (l) => initsOf(l).flatMap((i) => (i.kind !== 'decl' ? [i] : i.vars.filter((v) => v.init).map((v) => stmtOf({ kind: 'assign', op: '=', l: id(v.name, l.loc), r: v.init, loc: l.loc }, l.loc))));
const isIndex = (e, i) => e?.kind === 'id' && e.name === i;
/** The loop's own variable, declared in its init: its name, or null. */
const ownVar = (l) => (l.kind === 'for' && l.init?.kind === 'decl' && l.init.vars.length === 1 ? l.init.vars[0].name : null);
/** The copy of a loop with its own variable named `to`. */
function renamed(l, from, to) {
  const go = (x) => {
    if (!x || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(go);
    if (typeof x.value === 'bigint') return x;
    if (x.kind === 'id' && x.name === from) return { ...x, name: to };
    const y = { ...x };
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') y[k] = go(v);
    if (x.kind === 'var' && x.name === from) y.name = to;
    return y;
  };
  return go(l);
}

export function mergeLoops(body, { trip, warn }) {
  let asked = false;
  const any = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(any); return; } if (x.kind === 'pragma' && /^LOOP_(FLATTEN|MERGE)$/.test(x.pragma.name)) asked = true; for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') any(v); };
  any(body);
  if (!asked) return body;
  let serial = 0;
  /** The loop `outer` with the one inside it made one: one iteration a pair of theirs, the inner's step and, at its
   *  end, the outer's (each variable ending as the C leaves it). Why not: a string. */
  const flat = (outer, inner) => {
    const rest = itemsOf(outer).filter((s) => s && s.kind !== 'pragma' && s.kind !== 'empty');
    if (rest.length !== 1 || inLoop(rest[0]) !== inner) return 'the loop around it holds other statements';
    if (outer.kind !== 'for' || inner.kind !== 'for') return "only 'for' loops";
    if (pragmaOf(outer, 'UNROLL') || pragmaOf(inner, 'UNROLL')) return 'an UNROLL is on it';
    const a = trip(outer).trip, b = trip(inner).trip;
    if (a == null || b == null) return 'the counts of both loops must be constants';
    const why = jumps(inner);
    if (why) return why;
    const vars = new Set([...names(outer.step), ...names(inner.step), ...names(outer.cond), ...names(inner.cond)]);
    const loc = outer.loc, k = `ap_flat_${++serial}`;
    for (const w of writes(inner.body)) if (vars.has(w)) return `its body writes '${w}', a bound or a variable of the loops`;
    const keep = (l) => itemsOf(l).filter((s) => s?.kind === 'pragma' && !['LOOP_TRIPCOUNT'].includes(s.pragma.name));
    const pre = [...initsOf(outer), ...initsOf(inner)];
    const bodyItems = [...keep(outer).filter((s) => s.pragma.name !== 'LOOP_FLATTEN'), ...keep(inner), ...itemsOf(inner).filter((s) => s?.kind !== 'pragma'), ...stepOf(inner),
      { kind: 'if', cond: not(inner.cond, loc), then: block([...stepOf(outer), { kind: 'if', cond: outer.cond, then: block(initAgain(inner), loc), else: null, loc }], loc), else: null, loc }];
    const init = { kind: 'decl', vars: [{ kind: 'var', name: k, type: INT, init: num(0, loc), static: false, const: false, loc }], loc };
    const n = a * b;
    const made = { kind: 'for', init, cond: { kind: 'binary', op: '<', l: id(k, loc), r: num(n, loc), loc }, step: { kind: 'postfix', op: '++', e: id(k, loc), loc }, body: block(bodyItems, loc), loc, count: { trip: n, max: n }, pre, ...(outer.label ? { label: outer.label } : {}) };
    return made;
  };
  /** Consecutive loops made one, or why not. */
  const merged = (ls, force) => {
    for (const l of ls) {
      if (l.kind !== 'for') return "only 'for' loops";
      if (pragmaOf(l, 'UNROLL')) return 'an UNROLL is on one';
      const why = jumps(l);
      if (why) return why;
    }
    const counts = ls.map((l) => trip(l).trip), loc = ls[0].loc;
    const constant = counts.every((n) => n != null);
    if (!constant && new Set(ls.map((l) => (l.cond?.kind === 'binary' ? `${l.cond.op}${strip(l.cond.r)}` : strip(l.cond)))).size > 1) return 'their counts are not constants, nor the same bound';
    const own = ls.map(ownVar);
    if (!force) {
      for (let a = 0; a < ls.length; a++) {
        for (let b = a + 1; b < ls.length; b++) {
          const wa = writes(ls[a].body), wb = writes(ls[b].body);
          const local = new Set([...declared(ls[a].body), ...declared(ls[b].body), own[a], own[b]]);
          for (const v of [...wa, ...wb]) {
            if (local.has(v)) continue;
            if (!names(ls[wa.has(v) ? b : a].body).has(v) && !(wa.has(v) && wb.has(v))) continue;
            // (an array read or written by both at their own variable, the first's before the second's: as the C's)
            let same = !(new Set(counts).size > 1) && own[a] && own[b];
            const at = (l, i) => walk(l.body, (n) => { if (n.kind === 'id' && n.name === v) same &&= false; if (n.kind === 'index' && n.e?.kind === 'id' && n.e.name === v) { if (!isIndex(n.i ?? n.index, i)) same = false; return false; } });
            if (same) { at(ls[a], own[a]); at(ls[b], own[b]); }
            if (!same) return `'${v}' is used by more than one of them (force merges them all the same)`;
          }
        }
      }
    }
    // (each one's variable its own, in one scope)
    const made = ls.map((l) => { const v = ownVar(l); return v ? renamed(l, v, `ap_merge_${++serial}_${v}`) : l; });
    const max = constant ? Math.max(...counts) : Math.max(...ls.map((l) => trip(l).max ?? 0));
    const keep = made.flatMap((l) => itemsOf(l).filter((s) => s?.kind === 'pragma' && s.pragma.name !== 'LOOP_TRIPCOUNT'));
    const kept = itemsOf(ls[0]).filter((s) => s?.kind === 'pragma' && s.pragma.name === 'LOOP_TRIPCOUNT');
    const inits = made.flatMap(initsOf);
    const seen = new Set();
    const prag = keep.filter((s) => { const key = s.pragma.text; if (seen.has(key)) return false; seen.add(key); return true; });
    if (!constant) {
      const items = [...prag, ...kept, ...made.flatMap((l, k) => [...itemsOf(l).filter((s) => s?.kind !== 'pragma'), ...(k ? stepOf(l) : [])])];
      return { inits, loop: { kind: 'for', init: null, cond: made[0].cond, step: made[0].step, body: block(items, loc), loc, count: { trip: null, max: max || null } } };
    }
    const k = `ap_merge_${++serial}`;
    const items = [...prag];
    made.forEach((l, j) => {
      const part = block([...itemsOf(l).filter((s) => s?.kind !== 'pragma'), ...stepOf(l)], l.loc);
      items.push(counts[j] === max ? part : { kind: 'if', cond: { kind: 'binary', op: '<', l: id(k, l.loc), r: num(counts[j], l.loc), loc: l.loc }, then: part, else: null, loc: l.loc });
    });
    const init = { kind: 'decl', vars: [{ kind: 'var', name: k, type: INT, init: num(0, loc), static: false, const: false, loc }], loc };
    return { inits, loop: { kind: 'for', init, cond: { kind: 'binary', op: '<', l: id(k, loc), r: num(max, loc), loc }, step: { kind: 'postfix', op: '++', e: id(k, loc), loc }, body: block(items, loc), loc, count: { trip: max, max } } };
  };

  /** A body's items: its loops first, then its consecutive loops if a LOOP_MERGE is in it, then a loop with the one inside it. */
  const visitItems = (items) => {
    let out = items.map(visit);
    const pg = out.find((s) => s?.kind === 'pragma' && s.pragma.name === 'LOOP_MERGE');
    if (pg) out = mergeRuns(out, pg);
    return out;
  };
  const mergeRuns = (items, pg) => {
    const out = [];
    let any = false;
    for (let k = 0; k < items.length;) {
      if (!isLoop(unlabel(items[k]))) { out.push(items[k++]); continue; }
      const run = [];
      let j = k;
      for (; j < items.length; j++) {
        const s = items[j];
        if (isLoop(unlabel(s))) run.push(unlabel(s));
        else if (!(s?.kind === 'pragma' || s?.kind === 'empty')) break;
      }
      if (run.length < 2) { out.push(items[k++]); continue; }
      const r = merged(run, pg.pragma.args.force !== undefined);
      if (typeof r === 'string') { warn(pg.loc, `#pragma HLS LOOP_MERGE: the loops at line${run.length > 1 ? 's' : ''} ${run.map((l) => l.loc.line).join(', ')} are not merged: ${r}`); for (; k < j; k++) out.push(items[k]); continue; }
      any = true;
      out.push(block([...r.inits, r.loop], r.loop.loc));
      k = j;
    }
    if (!any && !items.some((s) => isLoop(unlabel(s)))) warn(pg.loc, '#pragma HLS LOOP_MERGE: no loops in this body: ignored');
    else if (!any && items.filter((s) => isLoop(unlabel(s))).length < 2) warn(pg.loc, '#pragma HLS LOOP_MERGE: only one loop in this body: ignored');
    return out;
  };
  const visit = (s) => {
    if (!s || typeof s !== 'object') return s;
    if (s.kind === 'label') { const st = visit(s.stmt); return st === s.stmt ? s : { ...s, stmt: st }; }
    if (s.kind === 'block') return { ...s, items: visitItems(s.items) };
    if (s.kind === 'if') return { ...s, then: visit(s.then), else: visit(s.else) };
    if (!isLoop(s)) return s;
    const l = { ...s, body: s.body?.kind === 'block' ? { ...s.body, items: visitItems(s.body.items) } : visit(s.body) };
    // (a loop inside with LOOP_FLATTEN: made one with this one)
    const inside = itemsOf(l).map(inLoop).filter(isLoop);
    const child = inside.length === 1 ? inside[0] : null;
    const childPg = child && pragmaOf(child, 'LOOP_FLATTEN');
    if (childPg && !childPg.args.off) {
      const r = flat(l, child);
      if (typeof r === 'string') warn(child.loc, `#pragma HLS LOOP_FLATTEN: this loop is not flattened: ${r}`);
      else return { ...block([...r.pre, r], l.loc), flatOf: r };
    }
    for (const x of inside) if (x !== child) { const p = pragmaOf(x, 'LOOP_FLATTEN'); if (p && !p.args.off) warn(x.loc, '#pragma HLS LOOP_FLATTEN: this loop is not flattened: the loop around it holds other loops'); }
    return l;
  };
  // (the outermost's: no loop around it to be made one with)
  const top = (x) => walk(x, (n) => { if (isLoop(n)) { const p = pragmaOf(n, 'LOOP_FLATTEN'); if (p && !p.args.off) warn(p.loc ?? n.loc, '#pragma HLS LOOP_FLATTEN: no loop around this one: ignored'); return false; } if (n.flatOf) { return false; } });
  const made = visitItems(body.items);
  top(body.items);
  return { ...body, items: made };
}
