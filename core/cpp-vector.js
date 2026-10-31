// Silinx HLS C++ (#1891): hls::vector's operators, as tokens (after the templates, before core/c-struct.js). A vector is
// a struct of an array (ap_vector, core/cpp-headers.js). A statement `x = e;`, `V x = e;`, `s.write(e);` or `return e;`
// whose e has + - * / of a vector (and a vector or a scalar) computes them element by element in temporaries of its own,
// in the order C++ calls them; `x = c ? a : b;` of vectors is an if. Isomorphic ES module.
//
//   cppVector(tokens) -> tokens
import { closing } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });
const copy = (ts) => ts.map((x) => ({ ...x }));
const STMT_START = (t) => !t || op(t, ';') || op(t, '{') || op(t, '}') || t.t === 'pragma' || op(t, ':');
const COMPOUND = { '+=': '+', '-=': '-', '*=': '*', '/=': '/' };

/** The vector types: name -> its size's tokens (each instance of ap_vector, its typedefs). */
function vectorTypes(toks) {
  const types = new Map();
  for (let k = 0; k + 4 < toks.length; k++) {
    if (!isId(toks[k], 'struct') || !isId(toks[k + 1]) || !op(toks[k + 2], '{')) continue;
    const e = closing(toks, k + 2);
    const m = toks.slice(k + 3, e).findIndex((x) => isId(x, 'ap_d'));
    if (m < 0) continue;
    types.set(toks[k + 1].v, toks.slice(k + 3 + m + 2, closing(toks, k + 3 + m + 1)));
  }
  if (types.size) for (let k = 0; k + 2 < toks.length; k++) if (isId(toks[k], 'typedef') && isId(toks[k + 1]) && types.has(toks[k + 1].v) && isId(toks[k + 2]) && op(toks[k + 3], ';')) types.set(toks[k + 2].v, types.get(toks[k + 1].v));
  return types;
}

export function cppVector(input) {
  const types = vectorTypes(input);
  if (!types.size) return input;
  let toks = input, fresh = 0;

  /** What name is declared as, before position at: { V, stream, dims }, or null (not a vector's). */
  function declared(name, at) {
    for (let i = at - 1; i >= 0; i--) {
      if (!isId(toks[i], name) || op(toks[i - 1], '.') || op(toks[i - 1], '->')) continue;
      const refd = op(toks[i - 1], '&') && op(toks[i - 2], '(') && op(toks[i + 1], ')');
      if (!refd && !(op(toks[i + 1], ',') || op(toks[i + 1], ')') || op(toks[i + 1], ';') || op(toks[i + 1], '=') || op(toks[i + 1], '[') || op(toks[i + 1], '('))) continue;
      let p = refd ? i - 3 : i - 1;
      // (a list: V a, b;: back to its first)
      if (op(toks[p], ',')) {
        let q = p;
        while (op(toks[q], ',') && isId(toks[q - 1])) q -= 2;
        if (!isId(toks[q]) && !op(toks[q], '>')) continue;
        p = q;
      }
      let ptr = 0;
      while (op(toks[p], '*') || op(toks[p], '&')) { if (op(toks[p], '*')) ptr++; p--; }
      let V = null, stream = false;
      if (op(toks[p], '>')) {
        let q = p, d = 0;
        for (; q >= 0; q--) { if (op(toks[q], '>')) d++; else if (op(toks[q], '<') && --d === 0) break; }
        if (!isId(toks[q - 1], 'stream')) return null;
        stream = true;
        V = toks[q + 1]?.v;
      } else if (isId(toks[p]) && !isId(toks[p], 'return')) V = toks[p].v;
      else continue;
      if (!types.has(V)) return ['else', 'case', 'goto', 'sizeof', 'new', 'delete', 'throw'].includes(V) ? (declared(name, i)) : null;
      let j = refd ? i + 2 : i + 1, dims = ptr;
      while (op(toks[j], '[')) { dims++; j = closing(toks, j) + 1; }
      return { V, stream, dims, size: op(toks[refd ? i + 2 : i + 1], '[') ? toks.slice((refd ? i + 2 : i + 1) + 1, closing(toks, refd ? i + 2 : i + 1)) : null };
    }
    return null;
  }
  /** The vector type of an expression's tokens (a variable, its element, a stream's read()), or null. */
  function vectorOf(e, at) {
    if (!isId(e[0])) return op(e[0], '(') && closing(e, 0) === e.length - 1 ? vectorOf(e.slice(1, -1), at) : null;
    const d = declared(e[0].v, at);
    if (!d) return null;
    let j = 1, n = 0;
    while (op(e[j], '[')) { n++; j = closing(e, j) + 1; }
    if (d.stream) return op(e[j], '.') && isId(e[j + 1], 'read') && op(e[j + 2], '(') && op(e[j + 3], ')') && j + 4 === e.length ? d.V : null;
    return j === e.length && n === d.dims ? d.V : null;
  }
  /** The last binary operator of ops at e's top level, or -1. */
  function split(e, ops) {
    let d = 0;
    for (let i = e.length - 1; i > 0; i--) {
      const x = e[i];
      if (x.t !== 'op') continue;
      if (x.v === ')' || x.v === ']') d++;
      else if (x.v === '(' || x.v === '[') d--;
      else if (!d && ops.includes(x.v) && (e[i - 1].t === 'id' || e[i - 1].t === 'num' || op(e[i - 1], ')') || op(e[i - 1], ']'))) return i;
    }
    return -1;
  }
  /** e as a value: { V, get(k): the tokens of its element k } (a vector) or { get(): e } (a scalar); pre: its statements. */
  function value(e, at, pre, t) {
    if (op(e[0], '(') && closing(e, 0) === e.length - 1) return value(e.slice(1, -1), at, pre, t);
    const s = split(e, ['+', '-']) >= 0 ? split(e, ['+', '-']) : split(e, ['*', '/']);
    if (s >= 0) {
      const a = value(e.slice(0, s), at, pre, t), b = value(e.slice(s + 1), at, pre, t);
      const V = a.V || b.V;
      if (!V) return { get: () => e };
      const r = L(t, `ap_v${fresh++}`, 'id'), i = L(t, `ap_v${fresh++}`, 'id');
      pre.push(L(t, V, 'id'), r, L(t, ';'), L(t, 'for', 'id'), L(t, '('), L(t, 'int', 'id'), i, L(t, '='), L(t, '0', 'num'), L(t, ';'), { ...i }, L(t, '<'), L(t, '('), ...copy(types.get(V)), L(t, ')'), L(t, ';'), { ...i }, L(t, '++'), L(t, ')'),
        { ...r }, L(t, '.'), L(t, 'ap_d', 'id'), L(t, '['), { ...i }, L(t, ']'), L(t, '='), L(t, '('), ...copy(a.get(i)), L(t, ')'), e[s], L(t, '('), ...copy(b.get(i)), L(t, ')'), L(t, ';'));
      return { V, tmp: r, get: (k) => [{ ...r }, L(t, '.'), L(t, 'ap_d', 'id'), L(t, '['), { ...k }, L(t, ']')] };
    }
    const V = vectorOf(e, at);
    if (!V) return { get: () => e };
    let base = e;
    if (op(e.at(-1), ')')) {   // (a stream's read(): once)
      const r = L(t, `ap_v${fresh++}`, 'id');
      pre.push(L(t, V, 'id'), r, L(t, '='), ...e, L(t, ';'));
      base = [r];
    }
    return { V, tmp: base.length === 1 ? base[0] : null, get: (k) => [...copy(base), L(t, '.'), L(t, 'ap_d', 'id'), L(t, '['), { ...k }, L(t, ']')] };
  }
  /** e lowered if it has a vector's operators: { pre, e }, else null. */
  function lower(e, at, t) {
    if (split(e, ['+', '-']) < 0 && split(e, ['*', '/']) < 0) return null;
    const pre = [];
    const v = value(e, at, pre, t);
    return v.V ? { pre, e: [v.tmp] } : null;
  }
  /** The statement at k..end (toks[end] its ';') rewritten, or null. */
  function statement(k, end) {
    const s = toks.slice(k, end), t = s[0];
    if (isId(t, 'return')) {
      const l = lower(s.slice(1), k, t);
      return l && [L(t, '{'), ...l.pre, t, ...l.e, L(t, ';'), L(t, '}')];
    }
    if (isId(t) && op(s[1], '.') && isId(s[2], 'write') && op(s[3], '(') && closing(s, 3) === s.length - 1) {
      const l = lower(s.slice(4, -1), k, t);
      return l && [L(t, '{'), ...l.pre, ...s.slice(0, 4), ...l.e, L(t, ')'), L(t, ';'), L(t, '}')];
    }
    let d = 0, eq = -1;
    for (let i = 0; i < s.length && eq < 0; i++) {
      if (op(s[i], '(') || op(s[i], '[')) d++;
      else if (op(s[i], ')') || op(s[i], ']')) d--;
      else if (!d && (op(s[i], '=') || COMPOUND[s[i].v])) eq = i;
    }
    if (eq < 1) return null;
    const lhs = s.slice(0, eq);
    let e = s.slice(eq + 1);
    const ty = lhs.filter((x) => !isId(x, 'const'));
    const decl = ty.length === 2 && isId(ty[0]) && types.has(ty[0].v);
    if (!decl && !vectorOf(lhs, k)) return null;
    if (COMPOUND[s[eq].v]) e = [...lhs, L(t, COMPOUND[s[eq].v]), ...e];
    // c ? a : b
    let q = -1;
    d = 0;
    for (let i = 0; i < e.length && q < 0; i++) {
      if (op(e[i], '(') || op(e[i], '[')) d++;
      else if (op(e[i], ')') || op(e[i], ']')) d--;
      else if (!d && op(e[i], '?')) q = i;
    }
    if (q > 0) {
      let c = -1;
      d = 0;
      for (let i = q + 1; i < e.length && c < 0; i++) {
        if (op(e[i], '(') || op(e[i], '[')) d++;
        else if (op(e[i], ')') || op(e[i], ']')) d--;
        else if (!d && op(e[i], ':')) c = i;
      }
      if (c < 0) return null;
      const target = decl ? [ty[1]] : lhs;
      return [...(decl ? [...ty, L(t, ';')] : []), L(t, 'if', 'id'), L(t, '('), ...e.slice(0, q), L(t, ')'), ...copy(target), L(t, '='), ...e.slice(q + 1, c), L(t, ';'), L(t, 'else', 'id'), ...copy(target), L(t, '='), ...e.slice(c + 1), L(t, ';')];
    }
    const l = lower(e, k, t);
    if (!l) return null;
    if (decl) return [...l.pre, ...lhs, L(t, '='), ...l.e, L(t, ';')];
    return [L(t, '{'), ...l.pre, ...lhs, L(t, '='), ...l.e, L(t, ';'), L(t, '}')];
  }
  // (a test bench's std::vector of them, v.data(), v.size(): the array, its size, core/cpp-stl.js)
  const plain = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const d = isId(t) && op(toks[k + 1], '.') && (isId(toks[k + 2], 'data') || isId(toks[k + 2], 'size')) && op(toks[k + 3], '(') && op(toks[k + 4], ')') ? declared(t.v, k) : null;
    if (!d?.size || d.stream) { plain.push(t); continue; }
    if (isId(toks[k + 2], 'data')) plain.push(t);
    else plain.push(L(t, '('), ...copy(d.size), L(t, ')'));
    k += 4;
  }
  toks = plain;
  const out = [];
  let depth = 0;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (op(t, '{')) depth++;
    if (op(t, '}')) depth--;
    if (!depth || !STMT_START(out.at(-1)) || op(t, '{') || op(t, '}')) { out.push(t); continue; }
    let a = k;
    // (the statement of an if (…), a loop's, an else's)
    for (;;) {
      if ((isId(toks[a], 'if') || isId(toks[a], 'while') || isId(toks[a], 'for') || isId(toks[a], 'switch')) && op(toks[a + 1], '(')) { a = closing(toks, a + 1) + 1; continue; }
      if (isId(toks[a], 'else') || isId(toks[a], 'do')) { a++; continue; }
      break;
    }
    let e = a, bad = false;
    while (toks[e] && !op(toks[e], ';')) {
      if (op(toks[e], '{') || op(toks[e], '}') || toks[e].t === 'pragma') { bad = true; break; }
      e = op(toks[e], '(') || op(toks[e], '[') ? closing(toks, e) + 1 : e + 1;
    }
    const r = !bad && toks[e] && e > a ? statement(a, e) : null;
    if (!r) { out.push(t); continue; }
    out.push(...toks.slice(k, a), ...r);
    k = e;
  }
  return out;
}
