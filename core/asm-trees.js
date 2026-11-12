// Silinx ASM charts from HDL - the per-state decision trees (#405: out of core/asm-from-hdl.js): a state's
// statements as a tree of conditions and cases (VHDL's sized expressions, widths), trees restricted, merged and
// resolved, their case labels, the last assignment on each path.
import { atLine, fail, lit, stmtList } from './asm-hdl-util.js';
import { exprToString, parseCaseChoices } from './asm.js';
import { MAX_NESTING } from './util.js';
import {
  asmIsBool, condKey, condNegKey, conv, simpLogical
} from './asm-from-hdl.js';

// ---------------------------------------------------------------------------------------
// Statements -> per-state decision trees
// ---------------------------------------------------------------------------------------
// Tree: { k: 'act', acts, next } | { k: 'if', cond, t, f } | { k: 'leaf' }
// act item: { goto: stateKey | '@self' } or { target, ast, prefix? }
// The trees are graphs (#3582): the statements after an `if` or a `case` are one subtree, shared by its branches, so n
// sequential ifs make n decisions, not 2^n; every walk below takes a shared subtree once (memo by node), and keeps the
// nodes it does not change, so that what is shared stays shared.

// A branch built before the subtree of the statements after it (the first branch: the errors come in the statements'
// order) ends at a hole, filled with that subtree once it is built. place(obj, key, node): obj[key] = node, the hole's
// places noted.
const hole = () => ({ k: 'hole', sites: [] });
function place(obj, key, node) {
  obj[key] = node;
  if (node.k === 'hole') node.sites.push([obj, key]);
  return obj;
}
const fill = (h, node) => { for (const [obj, key] of h.sites) place(obj, key, node); };

// VHDL evaluates `unsigned + natural`, shifts and `not` at the width of their vector operands,
// while the chart (like Verilog) evaluates them at the width of their context, and unsized
// literals count as 32 bits. Where the context matters (operands of a comparison that hold
// arithmetic, shifts or ~; the right-hand side of an assignment with >>) the unsized literals
// of a VHDL expression are given the width VHDL used, so that the chart means the same.
const SIZE_SENSITIVE = new Set(['+', '-', '<<', '>>', '~', 'neg']);
const ARITH = new Set(['+', '-', '&', '|', '^']);
const CMPS = new Set(['==', '!=', '<', '>', '<=', '>=']);
export function ctxSens(ast, ops = SIZE_SENSITIVE) {
  if (ast.k === 'un') return ast.op !== '!' && (ops.has(ast.op === '-' ? 'neg' : ast.op) || ctxSens(ast.a, ops));
  if (ast.k !== 'bin') return false;
  if (ops.has(ast.op)) return true;
  if (ARITH.has(ast.op)) return ctxSens(ast.a, ops) || ctxSens(ast.b, ops);
  if (ast.op === '<<' || ast.op === '>>') return ctxSens(ast.a, ops);
  return false;
}
function hasSignal(ast, A) {
  if (ast.k === 'id') return !A.generics.some((g) => A.orig(g.name) === ast.name);
  if (ast.k === 'sel') return true;
  if (ast.k === 'un') return hasSignal(ast.a, A);
  if (ast.k === 'bin') return hasSignal(ast.a, A) || hasSignal(ast.b, A);
  return false;
}
function vhdlSized(ast, A, inSens = false, W = 0) {
  const vw = (x) => A.vw.get(x) ?? (x.k === 'lit' ? x.w ?? 0 : x.k === 'id' && hasSignal(x, A) ? A.asmWidth(x.name) : x.k === 'sel' ? x.hi - x.lo + 1 : 0);
  switch (ast.k) {
    case 'lit': return inSens && ast.w == null ? lit(ast.v, Math.max(W || 32, ast.v.toString(2).length), 'd') : ast;
    case 'un':
      if (ast.op === '!') return { ...ast, a: vhdlSized(ast.a, A) };
      return { ...ast, a: vhdlSized(ast.a, A, inSens, A.vw.get(ast) ?? W) };
    case 'bin': {
      if (CMPS.has(ast.op)) {
        const s = ctxSens(ast.a) || ctxSens(ast.b);
        const Wc = Math.max(vw(ast.a), vw(ast.b));
        return { ...ast, a: vhdlSized(ast.a, A, s, Wc), b: vhdlSized(ast.b, A, s, Wc) };
      }
      if (ast.op === '&&' || ast.op === '||') return { ...ast, a: vhdlSized(ast.a, A), b: vhdlSized(ast.b, A) };
      if (!inSens || !hasSignal(ast, A)) return ast;
      const Wn = A.vw.get(ast) ?? W;
      if (ast.op === '<<' || ast.op === '>>') return { ...ast, a: vhdlSized(ast.a, A, true, Wn), b: vhdlSized(ast.b, A, ctxSens(ast.b), vw(ast.b)) };
      return { ...ast, a: vhdlSized(ast.a, A, true, Wn), b: vhdlSized(ast.b, A, true, Wn) };
    }
  }
  return ast;
}

/** Verilog self-determined width (unsized literals and generics: 32 bits). */
export function selfWidth(ast, wOf) {
  switch (ast.k) {
    case 'lit': return ast.w ?? 32;
    case 'id': return wOf(ast.name);
    case 'sel': return ast.hi - ast.lo + 1;
    case 'un': return ast.op === '!' ? 1 : selfWidth(ast.a, wOf);
    case 'bin':
      if (ARITH.has(ast.op)) return Math.max(selfWidth(ast.a, wOf), selfWidth(ast.b, wOf));
      if (ast.op === '<<' || ast.op === '>>') return selfWidth(ast.a, wOf);
      return 1;
  }
  return 1;
}

/**
 * Key of the meaning of an expression where literal widths are concerned: they only matter
 * through the width a comparison (or an assignment with >>) is evaluated at, which is part of
 * the key; the widths of the literals themselves are dropped.
 */
export function widthKey(ast, wOf) {
  switch (ast.k) {
    case 'lit': return lit(ast.v);
    case 'un': return { ...ast, a: widthKey(ast.a, wOf) };
    case 'bin': {
      const k = { ...ast, a: widthKey(ast.a, wOf), b: widthKey(ast.b, wOf) };
      if (CMPS.has(ast.op) && (ctxSens(ast.a) || ctxSens(ast.b))) k.op = `${ast.op}@${Math.max(selfWidth(ast.a, wOf), selfWidth(ast.b, wOf))}`;
      if ((ast.op === '<<' || ast.op === '>>') && ctxSens(ast.b)) k.b = { k: 'un', op: `@${selfWidth(ast.b, wOf)}`, a: k.b };
      return k;
    }
  }
  return ast;
}

export function makeTreeBuilder(A) {
  const condOf = (e, loc) => {
    const r = conv(e, A, { loc });
    return A.lang === 'vhdl' ? simpLogical(vhdlSized(r.ast, A), true, A.asmWidth) : r.ast;
  };
  const rhsOf = (e, width, loc) => {
    const r = conv(e, A, { loc, width });
    let ast = A.lang === 'vhdl' ? simpLogical(vhdlSized(r.ast, A, ctxSens(r.ast, new Set(['>>'])), A.vw.get(r.ast) ?? r.w ?? 0), false, A.asmWidth) : r.ast;
    if (ast.k === 'lit') {
      if (width === 1 || A.lang === 'vhdl') ast = lit(ast.v);
      else if (ast.w == null) ast = lit(ast.v);
    }
    if (width === 1 && r.ty === 'vec') fail(`assignment${atLine(loc)} gives a ${r.w}-bit value to a 1-bit output`);
    return ast;
  };
  const action = (st, ctx) => {
    if (st.target.op !== 'ref') fail(`assignment${atLine(st.loc)} writes part of a signal: not supported in a chart`);
    const n = st.target.name;
    const r = A.roles.get(n);
    if (!r) fail(`assignment${atLine(st.loc)} to '${A.orig(n)}', which is not part of the state machine`);
    if ((r.kind === 'state' && ctx === 'clocked') || (r.kind === 'next' && ctx === 'comb')) {
      if (st.value.op === 'ref' && st.value.name === A.S) return { goto: '@self' };
      const s = A.stateOfExpr(st.value);
      if (!s) fail(`next-state assignment${atLine(st.loc)} is not a state constant`);
      return { goto: s.key };
    }
    if ((r.kind === 'out' || r.kind === 'reg') && ctx === 'comb') return { target: r.out, ast: rhsOf(st.value, A.outInfo.get(r.out).width, st.loc), loc: st.loc };
    if (r.kind === 'regcur' && ctx === 'clocked') return { target: r.out, ast: rhsOf(st.value, A.outInfo.get(r.out).width, st.loc), loc: st.loc };
    fail(`'${A.orig(n)}' is assigned${atLine(st.loc)} in a ${ctx === 'clocked' ? 'clocked' : 'combinational'} process, which does not match its role in the state machine`);
  };
  // VHDL boolean action: `if C then o <= '1'; else o <= '0'; end if;` == `o = C`
  // (also `o <= '1' when C else '0'` and `o = C ? 1 : 0` in both languages)
  const boolAssign = (st, ctx) => {
    if (A.lang !== 'vhdl' && !st.fromCond) return null;
    const t = stmtList(st.then), f = stmtList(st.else);
    if (t.length !== 1 || f.length !== 1 || t[0].kind !== 'assign' || f[0].kind !== 'assign') return null;
    if (t[0].target.op !== 'ref' || f[0].target.op !== 'ref' || t[0].target.name !== f[0].target.name) return null;
    const r = A.roles.get(t[0].target.name);
    if (!r || !r.out || r.kind === 'next' || r.kind === 'state') return null;
    const w = A.outInfo.get(r.out).width;
    const one = rhsOf(t[0].value, w, t[0].loc), zero = rhsOf(f[0].value, w, f[0].loc);
    if (one.k !== 'lit' || zero.k !== 'lit' || one.v !== 1n || zero.v !== 0n) return null;
    let c = conv(st.cond, A, { loc: st.loc }).ast;
    if (A.lang === 'vhdl') c = vhdlSized(c, A);
    if (st.fromCond) {
      c = A.lang === 'vhdl' ? simpLogical(c, true, A.asmWidth) : c;
      if (w !== 1 && !asmIsBool(c)) return null;
    } else {
      c = simpLogical(c, false, A.asmWidth);
      if (!asmIsBool(c)) return null;
    }
    const a = action(t[0], ctx);
    return { ...a, ast: c };
  };
  const caseChain = (st) => {
    let chain = st.default ? stmtList(st.default) : [];
    for (let i = st.items.length - 1; i >= 0; i--) {
      const it = st.items[i];
      const bodyList = stmtList(it.body);
      const loc = it.body?.loc || bodyList[0]?.loc || st.loc;
      const conds = it.choices.map((ch) => (ch.range
        ? { op: 'binary', o: '&&', a: { op: 'binary', o: '>=', a: st.expr, b: ch.range.right }, b: { op: 'binary', o: '<=', a: st.expr, b: ch.range.left } }
        : { op: 'binary', o: '==', a: st.expr, b: ch }));
      const cond = conds.reduce((x, y) => ({ op: 'binary', o: '||', a: x, b: y }));
      chain = [{ kind: 'if', cond, then: bodyList, else: chain, loc }];
    }
    return chain;
  };
  // The value tested by a case box: a readable signal or a bit selection of one (else null).
  const caseSubject = (e, loc) => {
    let r;
    try { r = conv(e, A, { loc }); } catch { return null; }
    if (r.ast.k === 'sel') return { ast: r.ast, w: r.w };
    if (r.ast.k === 'id' && r.ty !== 'num' && r.w) return { ast: r.ast, w: r.w };
    return null;
  };
  // A constant choice of a case on a `w`-bit value (else null).
  const caseValue = (ch, w, loc) => {
    if (!ch || ch.range) return null;
    let r;
    try { r = conv(ch, A, { loc }); } catch { return null; }
    if (r.ast.k !== 'lit' || r.ast.v >= 1n << BigInt(w)) return null;
    if (A.lang === 'vhdl' && r.ast.w != null && r.ast.w !== w) return null;
    return r.ast.v;
  };
  // items: [{ values: [BigInt], body: [stmt] }]; others: [stmt] | null; each branch then rest (one subtree), then tail
  const caseItems = (subj, items, others, rest, ctx, tail) => {
    const seen = new Set();
    for (const it of items) for (const v of it.values) { if (seen.has(v)) return null; seen.add(v); }
    const full = subj.w <= 16 && seen.size === 2 ** subj.w;
    const arms = items.map((it) => ({ values: it.values, body: it.body }));
    // (an others arm with statements is kept even when the values are all listed)
    if (!full || (others && others.length)) arms.push({ values: null, body: others || [] });
    const h = hole();
    let after = h;
    const branches = arms.map((arm, i) => {
      const br = place({ values: arm.values, sub: null }, 'sub', toTree(arm.body, ctx, after));
      if (i === 0) { after = toTree(rest, ctx, tail); fill(h, after); }
      return br;
    });
    return { k: 'case', expr: subj.ast, w: subj.w, branches };
  };
  // HDL `case` on an input/register (or a selection of one) with constant choices -> case box
  const caseStmtTree = (st, rest, ctx, tail) => {
    const subj = caseSubject(st.expr, st.loc);
    if (!subj) return null;
    const items = [];
    for (const it of st.items) {
      const values = it.choices.map((ch) => caseValue(ch, subj.w, st.loc));
      if (!values.length || values.some((v) => v == null)) return null;
      items.push({ values, body: stmtList(it.body) });
    }
    return caseItems(subj, items, st.default ? stmtList(st.default) : null, rest, ctx, tail);
  };
  // `x = v1 or x = v2 ...` on the same multi-bit selection (VHDL case boxes on a slice are
  // generated as if/elsif chains): { subj, values } or null
  const sliceTest = (cond, loc) => {
    let r;
    try { r = conv(cond, A, { loc }); } catch { return null; }
    const values = [];
    let subj = null;
    const walk = (x) => {
      if (x.k === 'bin' && x.op === '||') return walk(x.a) && walk(x.b);
      if (x.k !== 'bin' || x.op !== '==' || x.a.k !== 'sel' || x.b.k !== 'lit') return false;
      if (subj && exprToString(subj) !== exprToString(x.a)) return false;
      subj = x.a;
      values.push(x.b.v);
      return true;
    };
    if (!walk(r.ast) || subj.hi === subj.lo) return null;
    const w = subj.hi - subj.lo + 1;
    if (values.some((v) => v >= 1n << BigInt(w)) || !A.caseExprs?.has(exprToString(subj))) return null;
    return { subj: { ast: subj, w }, values };
  };
  const sliceChainTree = (st, rest, ctx, tail) => {
    if (A.lang !== 'vhdl') return null;
    const first = sliceTest(st.cond, st.loc);
    if (!first) return null;
    const key = exprToString(first.subj.ast);
    const items = [{ values: first.values, body: stmtList(st.then) }];
    let others = stmtList(st.else);
    while (others.length === 1 && others[0].kind === 'if') {
      const t = sliceTest(others[0].cond, others[0].loc);
      if (!t || exprToString(t.subj.ast) !== key) break;
      items.push({ values: t.values, body: stmtList(others[0].then) });
      others = stmtList(others[0].else);
    }
    return caseItems(first.subj, items, others, rest, ctx, tail);
  };
  // The decisions (if, case) on a path of a state's statements, one after the other or nested: at most MAX_NESTING (the
  // walks of the tree recurse along a path)
  let decisions = 0;
  const decision = (st, f) => {
    if (++decisions > MAX_NESTING) {
      fail(`${st.kind} statement${atLine(st.loc)}: more than ${MAX_NESTING} decisions on a path of a state (if and case statements one after the other or nested), too many for a chart`);
    }
    try { return f(); } finally { decisions--; }
  };
  // the tree of a list of statements, then tail (where the list ends: what follows it)
  const toTree = (list, ctx, tail = { k: 'leaf' }) => {
    list = stmtList(list);
    const acts = [];
    const withActs = (node) => (acts.length ? place({ k: 'act', acts, next: null }, 'next', node) : node);
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.kind === 'assign') { acts.push(action(st, ctx)); continue; }
      if (st.kind === 'case') {
        const node = decision(st, () => caseStmtTree(st, list.slice(i + 1), ctx, tail));
        if (node) return withActs(node);
        list = [...list.slice(0, i), ...caseChain(st), ...list.slice(i + 1)]; i--; continue;
      }
      if (st.kind === 'if') {
        const ba = boolAssign(st, ctx);
        if (ba) { acts.push(ba); continue; }
        const sc = decision(st, () => sliceChainTree(st, list.slice(i + 1), ctx, tail));
        if (sc) return withActs(sc);
        // the then branch, the statements after the if, the else branch: the two branches end at that subtree
        return withActs(decision(st, () => {
          const node = { k: 'if', cond: condOf(st.cond, st.loc), t: null, f: null };
          const h = hole();
          place(node, 't', toTree(st.then, ctx, h));
          const after = toTree(list.slice(i + 1), ctx, tail);
          fill(h, after);
          return place(node, 'f', toTree(st.else, ctx, after));
        }));
      }
      fail(`${st.kind} statement${atLine(st.loc)} is not supported in a state machine chart`);
    }
    return withActs(tail);
  };
  // Every-cycle blocks: sequential items { k: 'acts', acts } | { k: 'if', cond, t, f }; the
  // statement after an `if` is where both branches join again.
  const toSeq = (list, ctx) => {
    list = stmtList(list);
    const out = [];
    const push = (a) => {
      if (a.goto) fail(`assignment${atLine(a.loc)} changes the state in logic that does not depend on the state`);
      if (out.length && out[out.length - 1].k === 'acts') out[out.length - 1].acts.push(a);
      else out.push({ k: 'acts', acts: [a] });
    };
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.kind === 'null') continue;
      if (st.kind === 'assign') {
        if (st.delay) fail(`assignment${atLine(st.loc)} has a delay, which a state machine chart cannot express`);
        if (st.value.op === 'cond') {
          list = [...list.slice(0, i), { kind: 'if', cond: st.value.cond, fromCond: true, loc: st.loc,
            then: [{ ...st, value: st.value.then }], else: [{ ...st, value: st.value.else }] }, ...list.slice(i + 1)];
          i--; continue;
        }
        push({ ...action(st, ctx), loc: st.loc });
        continue;
      }
      if (st.kind === 'case') { list = [...list.slice(0, i), ...caseChain(st), ...list.slice(i + 1)]; i--; continue; }
      if (st.kind === 'if') {
        const ba = boolAssign(st, ctx);
        if (ba) { push(ba); continue; }
        out.push({ k: 'if', cond: condOf(st.cond, st.loc), t: toSeq(st.then, ctx), f: toSeq(st.else, ctx) });
        continue;
      }
      fail(`${st.kind} statement${atLine(st.loc)} is not supported in a state machine chart`);
    }
    return out;
  };
  return { toTree, toSeq };
}

// memo: the value of a walk at a node, for a key (a Map per node; a walk's memo lasts one call of mergeTrees,
// resolveTree…)
function memoAt(memo, t, k, f) {
  let m = memo.get(t);
  if (!m) memo.set(t, (m = new Map()));
  if (!m.has(k)) m.set(k, f());
  return m.get(k);
}
// a node with its subtrees mapped by f: the node itself when none changed
function mapSubs(t, f) {
  if (t.k === 'act') { const next = f(t.next); return next === t.next ? t : { ...t, next }; }
  if (t.k === 'if') { const T = f(t.t), F = f(t.f); return T === t.t && F === t.f ? t : { ...t, t: T, f: F }; }
  if (t.k === 'case') {
    const branches = t.branches.map((br) => { const sub = f(br.sub); return sub === br.sub ? br : { ...br, sub }; });
    return branches.every((br, i) => br === t.branches[i]) ? t : { ...t, branches };
  }
  return t;
}

/** Tree `t` where the condition of key `key` (negation `neg`) is known to be `value`. */
function restrict(t, key, neg, value, W, M) {
  return memoAt(M.restricted, t, `${value}\0${key}\0${neg}`, () => {
    const r = (x) => restrict(x, key, neg, value, W, M);
    if (t.k === 'if') {
      const k = condKey(t.cond, W);
      if (k === key) return r(value ? t.t : t.f);
      if (k === neg) return r(value ? t.f : t.t);
    }
    return mapSubs(t, r);
  });
}

/**
 * Merge the trees of two processes into one decision tree. When both start with different
 * decisions, the one ranked first (order of the decisions in the header / previous chart)
 * goes on top; by default the first process (usually the next-state logic) wins.
 */
export function mergeTrees(a, b, W, rank = () => Infinity) {
  return mergeIn(a, b, W, rank, { merged: new Map(), restricted: new Map(), cased: new Map() });
}
function mergeIn(a, b, W, rank, M) {
  return memoAt(M.merged, a, b, () => {
    const merge = (x, y) => mergeIn(x, y, W, rank, M);
    if (a.k === 'act') return { k: 'act', acts: a.acts, next: merge(a.next, b) };
    if (b.k === 'act') return { k: 'act', acts: b.acts, next: merge(a, b.next) };
    if (a.k === 'leaf') return b;
    if (b.k === 'leaf') return a;
    if (a.k === 'case' && b.k === 'case' && caseKey(a) === caseKey(b)) return mergeCases(a, b, merge);
    if (a.k === 'case') {
      return { ...a, branches: a.branches.map((br) => ({ ...br, sub: merge(br.sub, restrictCase(b, a, br.values, M)) })) };
    }
    if (b.k === 'case') {
      const key = condKey(a.cond, W), neg = condNegKey(a.cond, W);
      return { k: 'if', cond: a.cond, t: merge(a.t, restrict(b, key, neg, true, W, M)), f: merge(a.f, restrict(b, key, neg, false, W, M)) };
    }
    if (rank(b.cond) < rank(a.cond)) {
      const key = condKey(b.cond, W), neg = condNegKey(b.cond, W);
      if (condKey(a.cond, W) !== key && condKey(a.cond, W) !== neg) {
        return { k: 'if', cond: b.cond, t: merge(restrict(a, key, neg, true, W, M), b.t),
          f: merge(restrict(a, key, neg, false, W, M), b.f) };
      }
    }
    const key = condKey(a.cond, W), neg = condNegKey(a.cond, W);
    const bt = restrict(b, key, neg, true, W, M), bf = restrict(b, key, neg, false, W, M);
    return { k: 'if', cond: a.cond, t: merge(a.t, bt), f: merge(a.f, bf) };
  });
}

const caseKey = (t) => exprToString(t.expr);
/** Index of the branch of case tree `t` taken for value `v` (the others branch, or -1). */
function caseBranch(t, v) {
  const i = t.branches.findIndex((br) => br.values && br.values.includes(v));
  return i >= 0 ? i : t.branches.findIndex((br) => !br.values);
}
const caseSub = (t, i) => (i >= 0 ? t.branches[i].sub : { k: 'leaf' });

/** Values of case tree `c` that go to its others branch, or null when there are too many. */
function othersValues(c) {
  if (c.w > 16) return null;
  const listed = new Set(c.branches.flatMap((br) => br.values || []));
  const out = [];
  for (let v = 0n; v < 1n << BigInt(c.w); v++) if (!listed.has(v)) out.push(v);
  return out;
}

/** Tree `t` where the subject of case tree `c` is known to be one of `values` (null: others of c). */
function restrictCase(t, c, values, M) {
  return memoAt(memoAt(M.cased, c, values, () => new Map()), t, null, () => {
    const r = (x) => restrictCase(x, c, values, M);
    if (t.k === 'case' && caseKey(t) === caseKey(c)) {
      const vals = values || othersValues(c);
      if (vals && vals.length) {
        const idx = new Set(vals.map((v) => caseBranch(t, v)));
        if (idx.size === 1) return r(caseSub(t, [...idx][0]));
      }
    }
    return mapSubs(t, r);
  });
}

/** Merge two case trees on the same value: one branch per distinct pair of branches taken (merge: of two subtrees). */
function mergeCases(a, b, merge) {
  const groups = new Map();
  const seen = new Set();
  for (const t of [a, b]) {
    for (const br of t.branches) {
      for (const v of br.values || []) {
        if (seen.has(v)) continue;
        seen.add(v);
        const ia = caseBranch(a, v), ib = caseBranch(b, v);
        const k = `${ia},${ib}`;
        if (!groups.has(k)) groups.set(k, { ia, ib, values: [] });
        groups.get(k).values.push(v);
      }
    }
  }
  const branches = [...groups.values()].map((g) => ({ values: g.values, sub: merge(caseSub(a, g.ia), caseSub(b, g.ib)) }));
  const oa = a.branches.findIndex((br) => !br.values), ob = b.branches.findIndex((br) => !br.values);
  if (!(a.w <= 16 && seen.size === 2 ** a.w) || oa >= 0 || ob >= 0) {
    branches.push({ values: null, sub: merge(caseSub(a, oa), caseSub(b, ob)) });
  }
  return { ...a, branches };
}

/**
 * Exits of a case box built from case tree `t`: [{ label, sub }]. The labels, their order and
 * the exits whose arm the generator left to `others` are taken from the `<expr> = <label>`
 * conditions of the header / previous chart when they match.
 */
export function caseLabels(t, conds, lang) {
  const xt = exprToString(t.expr);
  const known = [];
  for (const c of conds) {
    if (!c.startsWith(`${xt} = `)) continue;
    const label = c.slice(xt.length + 3).trim();
    const r = parseCaseChoices(label, t.w);
    if (r.error) continue;
    known.push(r.others ? { label: 'others', others: true } : { label, values: r.values });
  }
  const setKey = (vals) => vals.map(String).sort().join(',');
  const branches = t.branches.map((br) => ({ ...br }));
  const oi = branches.findIndex((br) => !br.values);
  if (oi >= 0) {
    // values the generated code left to the others arm (same effect)
    const listed = new Set(branches.flatMap((br) => br.values || []));
    let added = false;
    for (const k of known) {
      if (k.others || !k.values.length || k.values.some((v) => listed.has(v))) continue;
      k.values.forEach((v) => listed.add(v));
      branches.splice(oi, 0, { values: k.values, sub: branches[oi].sub });
      added = true;
    }
    if (added && !known.some((k) => k.others) && t.w <= 16 && listed.size === 2 ** t.w) branches.pop();
  }
  const pos = (br) => {
    const i = known.findIndex((k) => (br.values ? k.values && setKey(k.values) === setKey(br.values) : k.others));
    return i < 0 ? Infinity : i;
  };
  const order = branches.map((br, i) => ({ br, i, p: pos(br) }))
    .sort((x, y) => (x.p === y.p ? (!x.br.values) - (!y.br.values) || x.i - y.i : x.p - y.p));
  return order.map(({ br, p }) => {
    if (!br.values) return { label: 'others', sub: br.sub };
    if (p !== Infinity) return { label: known[p].label, sub: br.sub };
    const text = (v) => (lang === 'vhdl' || t.w === 1 ? v.toString(2).padStart(t.w, '0') : `${t.w}'d${v}`);
    return { label: br.values.map(text).join('|'), sub: br.sub };
  });
}

/** Resolve next-state assignments: leaves become { k: 'goto', state }. */
export function resolveTree(t, cur, self, M = { resolved: new Map(), sig: treeSigs() }) {
  return memoAt(M.resolved, t, cur, () => {
    const resolve = (x, c) => resolveTree(x, c, self, M);
    if (t.k === 'act') {
      let c = cur;
      const acts = [];
      for (const x of t.acts) { if (x.goto) c = x.goto === '@self' ? self : x.goto; else acts.push(x); }
      const next = resolve(t.next, c);
      if (!acts.length) return next;
      if (next.k === 'act') return { k: 'act', acts: lastWins([...acts, ...next.acts]), next: next.next };
      return { k: 'act', acts: lastWins(acts), next };
    }
    if (t.k === 'if') {
      const T = resolve(t.t, cur), F = resolve(t.f, cur);
      if (M.sig(T) === M.sig(F)) return T;
      return { k: 'if', cond: t.cond, t: T, f: F };
    }
    if (t.k === 'case') {
      const branches = t.branches.map((br) => ({ ...br, sub: resolve(br.sub, cur) }));
      if (branches.every((br) => M.sig(br.sub) === M.sig(branches[0].sub))) return branches[0].sub;
      return { ...t, branches };
    }
    return { k: 'goto', state: cur || self };
  });
}

/** Drop assignments overridden later in the same box (e.g. a default before the case). */
function lastWins(acts) {
  return acts.filter((a, i) => !acts.slice(i + 1).some((b) => b.target === a.target));
}

// A tree's signature: equal for two trees whose text (JSON, without the source lines) is equal. Each node's own text,
// its subtrees' numbers in their places, is numbered once (a shared subtree is not written out again).
const TREE_KINDS = new Set(['act', 'if', 'case', 'leaf', 'goto']);
const SUB_KEYS = new Set(['next', 't', 'f', 'sub']);
function treeSigs() {
  const nums = new Map(), sigs = new Map();
  const sig = (t) => {
    if (!sigs.has(t)) {
      const text = JSON.stringify(t, (k, v) => (typeof v === 'bigint' ? `${v}n` : k === 'loc' ? undefined
        : v !== t && SUB_KEYS.has(k) && TREE_KINDS.has(v?.k) ? `#${sig(v)}` : v));
      if (!nums.has(text)) nums.set(text, nums.size);
      sigs.set(t, nums.get(text));
    }
    return sigs.get(t);
  };
  return sig;
}

export function assignsOnEveryPath(t, target, memo = new Map()) {
  return memoAt(memo, t, target, () => {
    const every = (x) => assignsOnEveryPath(x, target, memo);
    if (t.k === 'act') return t.acts.some((x) => x.target === target) || every(t.next);
    if (t.k === 'if') return every(t.t) && every(t.f);
    if (t.k === 'case') return t.branches.every((br) => every(br.sub));
    return false;
  });
}
