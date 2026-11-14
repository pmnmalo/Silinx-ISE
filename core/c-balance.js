// Silinx HLS (#2613): a sum of many terms made a balanced tree, as Vitis HLS balances an integer expression by default
// (its EXPRESSION_BALANCE): `sum += a[k] * c[k]` unrolled is a chain of additions, one after the other; the same terms
// added two by two, then their sums two by two, take the logarithm of that many additions in a path, not that many (the
// shallowest added first, so that a term which is itself a sum comes in late). An
// addition of integers of one width wraps the same in any order (modulo 2^w), so the value is the same, bit for bit. The
// chain's last addition is made again in place (its node, read by whatever reads it, now adds the tree's two halves);
// an addition inside the chain that something else reads ends it, a term of its own (no addition made twice).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   balanceSums(g, roots, min = 4, late)   the sums of `min` terms or more the roots need, balanced in g; late: a Map
//                                          sum's node -> its term added last
//   balances(fn)                     whether a top function's sums are balanced: not under its EXPRESSION_BALANCE off

import { bottomUp } from './c-graph.js';

const LATE = 1e6;
/** The most additions on a path from the node down. */
function depthOf(g, id, memo) {
  const f = (id) => {
    if (memo.has(id)) return memo.get(id);
    const n = g.get(id);
    const d = n.args.length ? (n.op === 'add' ? 1 : 0) + Math.max(...n.args.map(f)) : 0;
    memo.set(id, d);
    return d;
  };
  return bottomUp([id], (id) => g.get(id).args, f, (id) => memo.has(id))[0];
}

/** The additions the roots need: each chain of `min` terms or more of one width (and sign) a tree, in place. */
export function balanceSums(g, all, min = 4, late = null) {
  const roots = all.filter((r) => r != null);   // (a state of a task has no stall)
  const nodes = g.needed(roots);
  const users = new Map(), reader = new Map();
  for (const r of roots) users.set(r, (users.get(r) || 0) + 1);
  for (const n of nodes) for (const a of n.args) { users.set(a, (users.get(a) || 0) + 1); reader.set(a, n); }
  const same = (n, top) => n.op === 'add' && n.w === top.w && n.s === top.s;
  // (an addition inside a chain: read once, by an addition of its width)
  const inner = (n) => n.op === 'add' && users.get(n.id) === 1 && same(reader.get(n.id) ?? {}, n);
  const deep = new Map();
  // (the operands first: a chain's terms balanced before it, their depths known)
  for (const top of nodes) {
    if (top.op !== 'add' || inner(top)) continue;
    const terms = [];
    // (the chain's terms in their order, and its depth in additions)
    // (a stack of its own, not one call per addition: a chain of thousands, #3595)
    let depth = 0;
    const stack = [{ n: top, k: 0, d: 0 }];
    while (stack.length) {
      const at = stack[stack.length - 1];
      if (at.k < at.n.args.length) {
        const id = at.n.args[at.k++], n = g.get(id);
        if (inner(n) && same(n, top)) stack.push({ n, k: 0, d: 0 });
        else terms.push(id);
      } else {
        stack.pop();
        if (stack.length) stack[stack.length - 1].d = Math.max(stack[stack.length - 1].d, at.d + 1);
        else depth = at.d + 1;
      }
    }
    if (terms.length < min || depth <= Math.ceil(Math.log2(terms.length))) continue;
    // (the two shallowest added first, then their sum with the next: a term that is itself a sum added late)
    const t = { w: top.w, s: top.s };
    // (late: a pipeline's variable whose next value the sum is, added last, its recurrence one addition, #2182)
    const level = terms.map((id) => ({ id, d: late?.get(top.id) === id ? LATE : depthOf(g, id, deep) }));
    while (level.length > 2) {
      level.sort((x, y) => x.d - y.d);
      const [x, y] = level.splice(0, 2);
      level.push({ id: g.add('add', [x.id, y.id], t), d: Math.max(x.d, y.d) + 1 });
    }
    top.args = level.map((x) => x.id);
    deep.set(top.id, Math.max(level[0].d, level[1].d) + 1);
  }
}

/** Whether a top function's sums are balanced: by default, not under `#pragma HLS EXPRESSION_BALANCE off` in its body. */
export function balances(fn) {
  return !fn.body.items.some((x) => x.kind === 'pragma' && x.pragma.name === 'EXPRESSION_BALANCE' && x.pragma.args.off !== undefined);
}
