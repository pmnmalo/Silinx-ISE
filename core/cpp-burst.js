// Silinx HLS (#1893): hls_burst_maxi.h's hls::burst_maxi<T> and memcpy, as tokens (first, before core/cpp-fir.js). An
// argument hls::burst_maxi<T> p is a pointer T *p (an m_axi master's, core/c-axi.js): p.read_request(o, n) queues a
// request of n elements from o (up to 4 waiting), p.read() reads the element at its cursor, which moves on, and takes the
// next request when n are read; p.write_request(o, n) and p.write(v) the same for writes; p.write_response() waits for
// nothing more (each write done when made). memcpy(a, b, n) of arrays or
// pointers is the loop copying n bytes, an element at a time (a pointer cast of a or b, (const int *)x, dropped).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   cppBurst(tokens, report) -> tokens
import { closing, splitTop } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const tok = (at, v, t = 'op') => ({ ...at, t, v });
const id = (at, v) => tok(at, v, 'id');
const num = (at, v) => ({ ...at, t: 'num', v: String(v) });

/** The offsets' names of p. */
const offset = (p, rw) => `ap_burst_${p}_${rw}`;

/** The type name was declared with before token i (T name[…], T *name, T name), or null. */
function declared(toks, i, name) {
  for (let j = i - 1; j > 0; j--) {
    if (!isId(toks[j], name)) continue;
    let k = j - 1;
    while (op(toks[k], '*') || isId(toks[k], 'const') || isId(toks[k], 'volatile')) k--;
    if (op(toks[k], '>')) { let d = 0; for (; k >= 0; k--) { if (op(toks[k], '>')) d++; else if (op(toks[k], '<') && --d === 0) break; } return isId(toks[k - 1]) ? toks.slice(k - 1, toks.indexOf(toks[j - 1]) + 1).filter((x) => !op(x, '*') && !isId(x, 'const') && !isId(x, 'volatile')) : null; }
    if (isId(toks[k]) && !['return', 'sizeof', 'case', 'else', 'goto'].includes(toks[k].v) && (op(toks[j + 1], '[') || op(toks[j + 1], ',') || op(toks[j + 1], ')') || op(toks[j + 1], ';') || op(toks[j + 1], '='))) return [toks[k]];
  }
  return null;
}

export function memcpyLoops(toks) {
  const out = [];
  let k = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!(isId(t, 'memcpy') && op(toks[i + 1], '(') && !isId(toks[i - 1]) && !op(toks[i - 1], '.'))) { out.push(t); continue; }
    const end = closing(toks, i + 1);
    const args = splitTop(toks.slice(i + 2, end), ',');
    // (memcpy(&x, &y, n) of two values: a copy of their bits, core/c-interp-lib.js's, #1943)
    const addr = (a) => a.length === 2 && op(a[0], '&') && isId(a[1]);
    if (args.length !== 3 || !op(toks[end + 1], ';') || (addr(args[0]) && addr(args[1]))) { out.push(t); continue; }
    // (a pointer cast dropped: (T *) x, (const T *) x)
    const bare = (a) => (op(a[0], '(') && closing(a, 0) < a.length - 1 && op(a[closing(a, 0) - 1], '*') ? a.slice(closing(a, 0) + 1) : a);
    const [dst, src, n] = [bare(args[0]), bare(args[1]), args[2]];
    const v = `ap_memcpy_${k++}`, P = (x) => [tok(t, '('), ...x, tok(t, ')')];
    // (an element's size: its declared type's, a constant; else sizeof(a[0]))
    const ty = (a) => (a.length === 1 && isId(a[0]) ? declared(toks, i, a[0].v) : null);
    const size = ty(dst) ?? ty(src) ?? [...P(dst), tok(t, '['), num(t, 0), tok(t, ']')];
    // (n written K * sizeof(T), or sizeof(T) * K, of the element's type T: K elements, a constant count when K is)
    const same = (a, b) => a.length === b.length && a.every((x, j) => x.t === b[j].t && x.v === b[j].v);
    const sz = (a) => isId(a[0], 'sizeof') && op(a[1], '(') && closing(a, 1) === a.length - 1 && same(a.slice(2, -1), size);
    const star = n.findIndex((x, j) => op(x, '*') && (sz(n.slice(j + 1)) || sz(n.slice(0, j))));
    const count = star >= 0 ? (sz(n.slice(star + 1)) ? n.slice(0, star) : n.slice(star + 1)) : [...P(n), tok(t, '/'), tok(t, '('), id(t, 'int'), tok(t, ')'), id(t, 'sizeof'), tok(t, '('), ...size, tok(t, ')')];
    out.push(id(t, 'for'), tok(t, '('), id(t, 'int'), id(t, v), tok(t, '='), num(t, 0), tok(t, ';'), id(t, v), tok(t, '<'), ...P(count), tok(t, ';'), id(t, v), tok(t, '++'), tok(t, ')'),
      ...P(dst), tok(t, '['), id(t, v), tok(t, ']'), tok(t, '='), ...P(src), tok(t, '['), id(t, v), tok(t, ']'));
    i = end;
  }
  return out;
}

export function cppBurst(toks0, report) {
  let toks = toks0;
  // the arguments: hls::burst_maxi<T> p -> T *p, by function
  const names = new Set();
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const q = isId(t, 'hls') && op(toks[i + 1], '::') && isId(toks[i + 2], 'burst_maxi') ? 2 : isId(t, 'burst_maxi') ? 0 : -1;
    if (q < 0 || !op(toks[i + q + 1], '<')) { out.push(t); continue; }
    const close = closing(toks, i + q + 1), p = toks[close + 1];
    if (!isId(p) || !(op(toks[i - 1], '(') || op(toks[i - 1], ',') || isId(toks[i - 1], 'const'))) { report(t, 'hls::burst_maxi<T>: only as an argument of a function (hls::burst_maxi<T> name)'); out.push(t); continue; }
    out.push(...toks.slice(i + q + 2, close), tok(t, '*'));
    names.add(p.v);
    i = close;
  }
  toks = out;
  if (!names.size) return memcpyLoops(toks);
  // the calls of their requests, reads and writes: each request queued (its offset and count, up to Q), each read or
  // write at the cursor, which takes the next request once the current one is done
  const used = new Set();
  const V = (p, rw, n) => `ap_burst_${p}_${rw}_${n}`;
  const edits = [];
  const res = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!(isId(t) && names.has(t.v) && op(toks[i + 1], '.') && isId(toks[i + 2]) && op(toks[i + 3], '('))) { res.push(t); continue; }
    const m = toks[i + 2].v, end = closing(toks, i + 3), args = splitTop(toks.slice(i + 4, end)).filter((a) => a.length);
    const rw = m.startsWith('read') ? 'r' : 'w';
    const v = (n) => { used.add(`${t.v}|${rw}`); return id(t, V(t.v, rw, n)); };
    const P = (x) => [tok(t, '('), ...x, tok(t, ')')];
    if ((m === 'read_request' || m === 'write_request') && args.length === 2) {
      // (queued: qo<k>, qn<k> the k-th's offset and count)
      const set = (k) => [v(`qo${k}`), tok(t, '='), ...P(args[0]), tok(t, ';'), v(`qn${k}`), tok(t, '='), ...P(args[1]), tok(t, ';')];
      const chain = [];
      for (let k = 0; k < Q; k++) chain.push(...(k ? [id(t, 'else')] : []), ...(k < Q - 1 ? [id(t, 'if'), tok(t, '('), v('qc'), tok(t, '=='), num(t, k), tok(t, ')')] : []), tok(t, '{'), ...set(k), tok(t, '}'));
      res.push(tok(t, '{'), ...chain, v('qc'), tok(t, '++'), tok(t, ';'), tok(t, '}'), id(t, 'if'), tok(t, '('), num(t, 0), tok(t, ')'), tok(t, ';'));
      // (a statement of its own: `p.read_request(o, n);` its `;` the if's)
      i = end;
      continue;
    }
    if (m === 'write_response' && !args.length) { res.push(v('c'), tok(t, '='), v('c')); i = end; continue; }
    if (!((m === 'read' && !args.length) || (m === 'write' && args.length === 1))) {
      report(toks[i + 2], `hls::burst_maxi: ${m}() is not one of its functions (read_request(offset, n), read(), write_request(offset, n), write(v), write_response())`);
      res.push(t);
      continue;
    }
    // the access, at the cursor; before its statement the next request taken if the current one is done, after it the cursor moved
    const take = [id(t, 'if'), tok(t, '('), v('l'), tok(t, '=='), num(t, 0), tok(t, ')'), tok(t, '{'), v('c'), tok(t, '='), v('qo0'), tok(t, ';'), v('l'), tok(t, '='), v('qn0'), tok(t, ';')];
    for (let k = 0; k < Q - 1; k++) take.push(v(`qo${k}`), tok(t, '='), v(`qo${k + 1}`), tok(t, ';'), v(`qn${k}`), tok(t, '='), v(`qn${k + 1}`), tok(t, ';'));
    take.push(v('qc'), tok(t, '--'), tok(t, ';'), tok(t, '}'));
    edits.push({ at: res.length, pre: take, post: [v('c'), tok(t, '++'), tok(t, ';'), v('l'), tok(t, '--'), tok(t, ';')], t });
    res.push(t, tok(t, '['), v('c'), tok(t, ']'), ...(m === 'write' ? [tok(t, '='), ...P(args[0])] : []));
    i = end;
  }
  // each access's statement: { take; the statement; move } (no braces when it is not a control statement's body: its
  // declaration kept in scope); one access a statement
  const plan = [];
  for (const e of edits) {
    const s0 = stmtStart(res, e.at), s1 = stmtEnd(res, e.at);
    if (s0 === null || s1 === null) { report(e.t, 'hls::burst_maxi: a read() or write() only in a statement (not in a condition)'); continue; }
    if (plan.some((x) => x.s0 === s0.at)) { report(e.t, 'hls::burst_maxi: one read() or write() a statement'); continue; }
    plan.push({ s0: s0.at, s1, wrap: s0.body, ...e });
  }
  for (const x of plan.sort((a, b) => b.s0 - a.s0)) {
    res.splice(x.s1 + 1, 0, ...x.post, ...(x.wrap ? [tok(x.t, '}')] : []));
    res.splice(x.s0, 0, ...(x.wrap ? [tok(x.t, '{')] : []), ...x.pre);
  }
  // each function body declares the offsets it uses
  const fin = [];
  let depth = 0;
  const vars = [...used].flatMap((u) => { const [p, rw] = u.split('|'); return ['c', 'l', 'qc', ...Array.from({ length: Q }, (_, k) => [`qo${k}`, `qn${k}`]).flat()].map((n) => V(p, rw, n)); });
  for (let i = 0; i < res.length; i++) {
    fin.push(res[i]);
    if (op(res[i], '}')) depth--;
    if (!op(res[i], '{')) continue;
    if (depth++ || !op(res[i - 1], ')')) continue;
    const end = closing(res, i);
    const mine = vars.filter((v) => res.slice(i, end).some((x) => isId(x, v)));
    for (const v of mine) fin.push(id(res[i], 'int'), id(res[i], v), tok(res[i], '='), num(res[i], 0), tok(res[i], ';'));
  }
  return memcpyLoops(fin);
}

// (the requests a burst_maxi queues: Vitis HLS's depth of outstanding requests is the bus's, 4 here)
const Q = 4;

/** The start of the statement token k is in: { at, body: a control statement's body (if, else, for, while, do) },
 *  or null if k is inside a condition. */
function stmtStart(toks, k) {
  let depth = 0;
  for (let j = k - 1; j >= 0; j--) {
    const t = toks[j];
    if (op(t, ')') || op(t, ']')) {
      if (depth === 0 && op(t, ')')) {
        const o = opening(toks, j);
        if (o > 0 && ['if', 'for', 'while', 'switch'].includes(toks[o - 1].v) && isId(toks[o - 1])) return { at: j + 1, body: true };
        j = o;
        continue;
      }
      depth++;
    } else if (op(t, '(') || op(t, '[')) { if (depth === 0) return null; depth--; }
    else if (depth === 0 && (op(t, ';') || op(t, '{') || op(t, '}'))) return { at: j + 1, body: false };
    else if (depth === 0 && (isId(t, 'else') || isId(t, 'do'))) return { at: j + 1, body: true };
  }
  return { at: 0, body: false };
}
function opening(toks, j) {
  let depth = 0;
  for (let i = j; i >= 0; i--) { if (op(toks[i], ')')) depth++; else if (op(toks[i], '(') && --depth === 0) return i; }
  return -1;
}
function stmtEnd(toks, k) {
  let depth = 0;
  for (let j = k; j < toks.length; j++) {
    if (op(toks[j], '(') || op(toks[j], '[') || op(toks[j], '{')) depth++;
    else if (op(toks[j], ')') || op(toks[j], ']') || op(toks[j], '}')) { if (--depth < 0) return null; }
    else if (depth === 0 && op(toks[j], ';')) return j;
  }
  return null;
}
