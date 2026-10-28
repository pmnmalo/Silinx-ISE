// Silinx HLS C++ (#1898): an array of hls::task's, as tokens: `hls_thread_local hls::task t[N];` dropped and each
// element started, t[k](f, a…); or in a loop of constant bounds, for (int i = 0; i < N; i++) t[i](f, a…); (Vitis HLS's
// mixed control and data driven example: its body unrolled), made `hls::task t_k(f, a…);` for each k, i its value in
// the arguments (core/cpp-lex.js: a task of its own). Any other use is said. After core/cpp-np-channel.js, before
// core/c-stream-array.js (s[i] its element). Isomorphic ES module.
//
//   taskArrays(tokens, report) -> tokens
import { closing, constTokens, constDecl, named } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (at, v, t = 'op') => ({ ...at, t, v });
const FORM = (nm) => `the array of tasks '${nm}': each started as ${nm}[k](f, a…); or in a loop for (int i = 0; i < N; i++) ${nm}[i](f, a…);`;

export function taskArrays(toks, report) {
  const out = [], arrays = new Map(), consts = new Map(), started = new Set();
  // t[e](f, a…); at k, i given its value: the tokens of hls::task t_v(f, a…); or null (dry: only looked at)
  const start = (k, i, iv, dry = false) => {
    const nm = toks[k].v, n = arrays.get(nm);
    const c = closing(toks, k + 1);
    const at = (x) => (i && isId(x, i) ? L(x, String(iv), 'num') : x);
    const v = constTokens(named(toks.slice(k + 2, c).map(at), consts));
    if (v === null || !op(toks[c + 1], '(')) return null;
    const e = closing(toks, c + 1);
    if (!op(toks[e + 1], ';') || !isId(toks[c + 2])) return null;
    if (v < 0n || v >= BigInt(n)) { if (!dry) report(toks[k], `'${nm}[${v}]': outside the array of ${n} tasks`); return { end: e + 2, toks: [] }; }
    if (!dry && started.has(`${nm}_${v}`)) { report(toks[k], `'${nm}[${v}]': started twice`); return { end: e + 2, toks: [] }; }
    if (!dry) started.add(`${nm}_${v}`);
    const args = toks.slice(c + 2, e).map((x, j, a) => (op(a[j - 1], '.') || op(a[j - 1], '->') ? x : at(x)));
    return { end: e + 2, toks: [L(toks[k], 'hls', 'id'), L(toks[k], '::'), L(toks[k], 'task', 'id'), L(toks[k], `${nm}_${v}`, 'id'), toks[c + 1], ...args, toks[e], toks[e + 1]] };
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    constDecl(toks, k, consts);
    // hls::task t[N];
    if (isId(t, 'hls') && op(toks[k + 1], '::') && isId(toks[k + 2], 'task') && isId(toks[k + 3]) && op(toks[k + 4], '[')) {
      const c = closing(toks, k + 4);
      const n = constTokens(named(toks.slice(k + 5, c), consts));
      // (not one: said, the declaration dropped)
      if (n === null || n < 1n || !op(toks[c + 1], ';')) report(toks[k + 3], `the array of tasks '${toks[k + 3].v}': hls::task ${toks[k + 3].v}[N]; (N a constant)`);
      while (isId(out.at(-1), 'hls_thread_local') || isId(out.at(-1), 'static')) out.pop();
      arrays.set(toks[k + 3].v, Number(n ?? 1n) || 1);
      k = c + 1;
      continue;
    }
    if (!arrays.size) { out.push(t); continue; }
    // for (int i = a; i < b; i++) { #pragma HLS unroll  t[i](f, a…); … }
    if (isId(t, 'for') && op(toks[k + 1], '(')) {
      const loop = unrolled(toks, k, arrays, consts, start);
      if (loop) { out.push(...loop.toks); k = loop.end - 1; continue; }
    }
    // t[k](f, a…);
    if (isId(t) && arrays.has(t.v) && op(toks[k + 1], '[')) {
      const s = start(k);
      if (s) { out.push(...s.toks); k = s.end - 1; continue; }
    }
    // (any other use: said, its statement dropped)
    if (isId(t) && arrays.has(t.v) && !op(toks[k - 1], '.') && !op(toks[k - 1], '->')) {
      report(t, FORM(t.v));
      for (let d = 0; k < toks.length && !(d === 0 && op(toks[k], ';')); k++) d += '([{'.includes(toks[k].v) && toks[k].t === 'op' ? 1 : ')]}'.includes(toks[k].v) && toks[k].t === 'op' ? -1 : 0;
      out.push(L(t, ';'));
      continue;
    }
    out.push(t);
  }
  return out;
}

/** A loop at k of constant bounds starting tasks of an array only: its tokens, one start for each i, or null. */
function unrolled(toks, k, arrays, consts, start) {
  const c = closing(toks, k + 1);
  const head = toks.slice(k + 2, c), s1 = head.findIndex((x) => op(x, ';')), s2 = head.findIndex((x, j) => j > s1 && op(x, ';'));
  if (s1 < 0 || s2 < 0) return null;
  const [init, cond, step] = [head.slice(0, s1), head.slice(s1 + 1, s2), head.slice(s2 + 1)];
  const decl = isId(init[0], 'int') || isId(init[0], 'unsigned') ? init.slice(1) : init;
  const i = decl[0]?.v;
  if (!isId(decl[0]) || !op(decl[1], '=') || !isId(cond[0], i) || !(op(cond[1], '<') || op(cond[1], '<='))) return null;
  if (!(step.length === 2 && ((isId(step[0], i) && op(step[1], '++')) || (op(step[0], '++') && isId(step[1], i))))) return null;
  const a = constTokens(named(decl.slice(2), consts)), b = constTokens(named(cond.slice(2), consts));
  if (a === null || b === null) return null;
  const last = op(cond[1], '<=') ? b : b - 1n;
  // its body: { #pragma HLS unroll  t[i](f, a…); … } or one t[i](f, a…);
  const braces = op(toks[c + 1], '{');
  const calls = [];
  let j = c + 1 + (braces ? 1 : 0);
  for (; braces ? !op(toks[j], '}') : !calls.length; ) {
    if (toks[j]?.t === 'pragma' && toks[j].v.name === 'UNROLL') { j++; continue; }
    if (!(isId(toks[j]) && arrays.has(toks[j].v) && op(toks[j + 1], '['))) return null;
    const s = start(j, i, a, true);
    if (!s?.toks) return null;
    calls.push(j);
    j = s.end;
  }
  const out = [];
  for (let v = a; v <= last; v++) for (const n of calls) out.push(...start(n, i, v).toks);
  return { toks: out, end: braces ? j + 1 : j };
}
