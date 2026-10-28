// Silinx HLS (#1895): pointer arguments as Vitis HLS takes them beyond indexing (UG1399, Pointers), rewritten in the
// syntax tree before core/c-pointer.js's pointerArithmetic, for the C simulation and the synthesis alike:
// - a pointer to a pointer of a function the top calls (int **pp), resolved at compile time: each call passes &q, q a
//   pointer, and the function only reads through it (**pp, (*pp)[i]): pp a pointer (int *pp), *pp is pp, &q is q;
// - a pointer argument moved by arithmetic (p += n, p -= n, p++, p--, p = p + n): an offset of its own (p_off, from 0),
//   p[i] is p[p_off + i] and *p is p[p_off].
// What does not resolve so is said, with the rule. Isomorphic ES module: no DOM and no Node APIs.
//
//   pointerToPointer(funcs, synth, top, report)   pointerArgsMoved(funcs, synth, report)

const num = (v, loc) => ({ kind: 'num', value: BigInt(v), text: String(v), loc });
const id = (name, loc) => ({ kind: 'id', name, loc });
const replace = (n, m) => { for (const k of Object.keys(n)) if (k !== 'loc') delete n[k]; Object.assign(n, m); };

/** walk with each node's parent and key (its parent's property holding it). */
function walkP(n, fn, parent = null, key = null) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach((x) => walkP(x, fn, parent, key)); return; }
  fn(n, parent, key);
  for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && k !== 'pragma' && v && typeof v === 'object') walkP(v, fn, n, k);
}
const written = (parent, key) => (parent?.kind === 'assign' && key === 'l') || parent?.kind === 'postfix'
  || (parent?.kind === 'unary' && (parent.op === '++' || parent.op === '--' || parent.op === '&'));

export function pointerToPointer(funcs, synth, top, report) {
  for (const f of funcs.values()) {
    if (!f.body || !synth.has(f.name) || f.name === top) continue;   // (the top's: a port, said by the checks)
    f.params.forEach((pa, k) => {
      if (!pa.name || pa.type.kind !== 'ptr' || pa.type.to.kind !== 'ptr' || pa.type.to.to.kind === 'ptr') return;
      const rule = `a pointer to a pointer resolves at compile time (Vitis HLS): read through it only (**${pa.name}, (*${pa.name})[i])`;
      const calls = [];
      for (const g of funcs.values()) walkP(g.body, (n) => { if (n.kind === 'call' && n.callee.kind === 'id' && n.callee.name === f.name && n.args[k]) calls.push(n.args[k]); });
      // (said once: its arguments' pointers not said again, core/c-pointer.js)
      const refuse = (loc, m) => { report(loc, m); pa.said = true; for (const a of calls) a.said = true; };
      const derefs = [];
      let bad = false;
      walkP(f.body, (n, parent, key) => {
        if (bad || n.kind !== 'id' || n.name !== pa.name) return;
        const p2 = parent?.kind === 'unary' && parent.op === '*' ? parent : null;
        if (!p2) { refuse(n.loc, `the parameter '${pa.name}': used other than *${pa.name}: not supported (${rule})`); bad = true; return; }
        derefs.push(p2);
      });
      // (*pp written, pp's own target changed: the caller's pointer)
      walkP(f.body, (n, parent, key) => { if (!bad && derefs.includes(n) && written(parent, key)) { refuse(n.loc, `the parameter '${pa.name}': *${pa.name} changed: not supported (${rule})`); bad = true; } });
      if (bad) return;
      pa.type = { ...pa.type.to };
      for (const d of derefs) replace(d, id(pa.name, d.loc));
      const okArg = (a) => (a.kind === 'unary' && a.op === '&' && a.e.kind === 'id') || a.kind === 'id';
      const wrong = calls.find((a) => !okArg(a));
      if (wrong) refuse(wrong.loc, `the argument of '${pa.name}': &p of a pointer p (${rule})`);
      for (const a of calls) if (a.kind === 'unary' && okArg(a)) replace(a, id(a.e.name, a.loc));
    });
  }
}

export function pointerArgsMoved(funcs, synth, report) {
  for (const f of funcs.values()) {
    if (!f.body || !synth.has(f.name)) continue;
    for (const pa of f.params) {
      if (!pa.name || pa.type.kind !== 'ptr' || ['ptr', 'stream', 'struct'].includes(pa.type.to.kind)) continue;
      const name = pa.name, off = `${name}_off`;
      const isP = (x) => x?.kind === 'id' && x.name === name;
      const moves = [];
      walkP(f.body, (n) => {
        if (n.kind === 'assign' && isP(n.l) && (n.op === '+=' || n.op === '-=')) moves.push(n);
        else if ((n.kind === 'postfix' || (n.kind === 'unary' && (n.op === '++' || n.op === '--'))) && isP(n.e)) moves.push(n);
        else if (n.kind === 'assign' && n.op === '=' && isP(n.l) && n.r.kind === 'binary' && (n.r.op === '+' || n.r.op === '-') && isP(n.r.l)) moves.push(n);
      });
      if (!moves.length) continue;
      // its other uses: p[i], *p, *(p + e) (core/c-pointer.js's p[e]); passed on or set otherwise, said
      let bad = false;
      walkP(f.body, (n, parent, key) => {
        if (bad || !isP(n) || moves.some((m) => m.l === n || m.e === n || m.r?.l === n)) return;
        if ((parent.kind === 'index' && key === 'e') || (parent.kind === 'unary' && parent.op === '*') || (parent.kind === 'binary' && (parent.op === '+' || parent.op === '-') && key === 'l')) return;
        report(n.loc, `the pointer argument '${name}' moves (${name} += n): ${parent.kind === 'call' ? 'passed on' : 'used other than *p, p[i], *(p + i)'}: not supported yet (Silinx HLS: a pointer argument moved by arithmetic, then indexed)`);
        bad = true;
      });
      if (bad) continue;
      for (const m of moves) {
        if (m.kind === 'assign' && m.op === '=') replace(m, { kind: 'assign', op: m.r.op === '+' ? '+=' : '-=', l: id(off, m.loc), r: m.r.r });
        else if (m.kind === 'assign') m.l = id(off, m.loc);
        else m.e = id(off, m.loc);
      }
      // (p's reads from its offset: *(p + e) and p[e] by core/c-pointer.js after this, so p's own node is p + p_off)
      const uses = [];
      walkP(f.body, (n, parent, key) => { if (isP(n)) uses.push({ n, parent, key }); });
      for (const { n, parent, key } of uses) {
        // (p[i]: p[p_off + i])
        if (parent.kind === 'index' && key === 'e') parent.i = { kind: 'binary', op: '+', l: id(off, n.loc), r: parent.i, loc: parent.loc };
        else replace(n, { kind: 'binary', op: '+', l: id(name, n.loc), r: id(off, n.loc) });
      }
      f.body.items.unshift({ kind: 'decl', vars: [{ kind: 'var', name: off, type: { kind: 'int', name: 'int', signed: true, bits: 32 }, init: num(0, pa.loc), static: false, const: false, loc: pa.loc }], loc: pa.loc });
    }
  }
}
