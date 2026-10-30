// Silinx HLS (#1963): initializers as tokens, before core/c-union.js. An initializer with designators (.x = 1, [2] = 5,
// .a.b[1] = 3), or of a type with a union in it, is walked by C's rules (the current object, braces elided, a later
// value of the same place the one kept) and written in full: a struct's members and an array's elements in order, the
// missing zero (or the member's default value, C++), a union's as { .m = v, … } on a '{' carrying its definition's place
// (uinit: core/c-union.js makes its word of them). Any other initializer stays as it is. Isomorphic ES module.
//
//   cDesignated(tokens, report) -> tokens
import { closing, splitTop, constTokens } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });
const STMT_START = (t) => !t || op(t, ';') || op(t, '{') || op(t, '}') || t.t === 'pragma';
const QUALS = new Set(['const', 'static', 'volatile', 'register', 'extern', 'inline', 'constexpr', 'typedef']);
const WORDS = new Set(['void', 'char', 'short', 'int', 'long', 'signed', 'unsigned', 'float', 'double', 'bool', '_Bool']);
const NOT_TYPE = new Set(['return', 'else', 'do', 'goto', 'case', 'default', 'break', 'continue', 'if', 'for', 'while', 'switch', 'sizeof', 'namespace', 'using', 'template']);
const SCALAR = { k: 's' };
const placeOf = (t) => `${t.file ?? ''}:${t.line}:${t.col}`;

// Types: SCALAR, an array { k: 'a', n (null: []), of }, a struct or a union { k: 'r', union, members: [{ name (null:
// anonymous), type, init }], key (a union: its definition's place) }.
const has = (r, name) => r.members.some((m) => m.name === name || (m.name === null && has(m.type, name)));
const withUnion = (ty) => (ty.k === 'a' ? withUnion(ty.of) : ty.k === 'r' && (ty.union || ty.members.some((m) => withUnion(m.type))));

/** An initializer's braces as a tree: { list: [{ des: [{ name, at } | { index, at }], val, at }] } | { e: tokens }. */
function tree(ts, consts, report) {
  if (!op(ts[0], '{')) return { e: ts };
  const list = splitTop(ts.slice(1, closing(ts, 0))).filter((x) => x.length).map((x) => {
    const des = [];
    let j = 0;
    for (;;) {
      if (op(x[j], '.') && isId(x[j + 1])) { des.push({ name: x[j + 1].v, at: x[j + 1] }); j += 2; continue; }
      if (op(x[j], '[')) {
        const e = closing(x, j);
        const v = constOf(x.slice(j + 1, e), consts);
        if (v === null) report(x[j], 'a designator\'s index must be a constant');
        des.push({ index: Number(v ?? 0n), at: x[j] });
        j = e + 1;
        continue;
      }
      break;
    }
    if (des.length && op(x[j], '=')) j++;
    return { des, cont: false, at: x[0], val: tree(x.slice(j), consts, report) };
  });
  return { list };
}
const constOf = (ts, consts) => constTokens(ts.map((x) => (isId(x) && consts.has(x.v) ? L(x, String(consts.get(x.v)), 'num') : x)));

/** The values of a list for a type, by C's rules: { e } | { a: [] } | { s: [] } | { m, n }. */
function fill(ty, q, braced, what, report, node = null) {
  if (ty.k === 's') { const it = q.shift(); return { e: it?.val.e ?? [] }; }
  const un = ty.k === 'r' && ty.union;
  node ??= ty.k === 'a' ? { a: [] } : un ? { m: -1, n: null } : { s: [] };
  const count = ty.k === 'a' ? ty.n ?? Infinity : un ? 1 : ty.members.length;
  const typeAt = (i) => (ty.k === 'a' ? ty.of : ty.members[i].type);
  const get = (i) => (ty.k === 'a' ? node.a[i] : un ? (node.m === i ? node.n : null) : node.s[i]);
  const set = (i, v) => { if (ty.k === 'a') node.a[i] = v; else if (un) { node.m = i; node.n = v; } else node.s[i] = v; };
  const value = (sub, prev) => {
    const it = q[0];
    if (it.des.length) return fill(sub, q, false, what, report, prev);
    if (it.val.list) {
      q.shift();
      if (sub.k !== 's') return fill(sub, it.val.list.slice(), true, what, report);
      let v = it.val;
      while (v?.list) v = v.list[0]?.val;
      return { e: v?.e ?? [L(it.at, '0', 'num')] };
    }
    if (sub.k === 's') { q.shift(); return { e: it.val.e }; }
    return fill(sub, q, false, what, report);
  };
  let pos = 0;
  while (q.length) {
    const it = q[0];
    if (it.des.length) {
      if (!it.cont && !braced) return node;
      const d = it.des[0];
      if (d.name !== undefined) {
        if (ty.k !== 'r') { report(d.at, `'${what}': '.${d.name}' designates a member of what is not a struct or a union`); q.shift(); continue; }
        pos = ty.members.findIndex((m) => m.name === d.name || (m.name === null && has(m.type, d.name)));
        if (pos < 0) { report(d.at, `'${d.name}' is not a member of '${what}'`); q.shift(); pos = 0; continue; }
        if (ty.members[pos].name === null) it.cont = true;
        else { it.des = it.des.slice(1); it.cont = it.des.length > 0; }
      } else {
        if (ty.k !== 'a') { report(d.at, `'${what}': [${d.index}] designates an element of what is not an array`); q.shift(); continue; }
        if (d.index < 0 || d.index >= count) { report(d.at, `'${what}': the index ${d.index} is outside its array of ${ty.n}`); q.shift(); continue; }
        pos = d.index;
        it.des = it.des.slice(1);
        it.cont = it.des.length > 0;
      }
      if (typeAt(pos).k === 's' && it.des.length) { report(d.at, `'${what}': a designator goes on inside a value that is neither a struct nor an array`); q.shift(); continue; }
      set(pos, value(typeAt(pos), get(pos)));
      pos++;
      continue;
    }
    if (pos >= count) {
      if (braced) { report(it.at, `'${what}': more initial values than it holds`); q.length = 0; }
      return node;
    }
    set(pos, value(typeAt(pos), get(pos)));
    pos++;
  }
  return node;
}

/** A value as tokens, in full (at: where it is said; full: an array's elements all said, a row of a larger one). */
function emit(ty, node, at, full = false) {
  const num0 = () => L(at, '0', 'num');
  if (ty.k === 's') return node?.e?.length ? node.e : [num0()];
  if (ty.k === 'a') {
    const items = node?.a ?? [];
    const n = Math.max(full && ty.n ? ty.n : items.length, 1);
    return [L(at, '{'), ...Array.from({ length: n }, (_, i) => [...(i ? [L(at, ',')] : []), ...emit(ty.of, items[i], at, true)]).flat(), L(at, '}')];
  }
  if (ty.union) {
    const parts = [];
    unionValues(ty, node, [], at, parts);
    return [{ ...L(at, '{'), uinit: ty.key }, ...parts.flatMap((p, i) => [...(i ? [L(at, ',')] : []), ...p]), L(at, '}')];
  }
  return [L(at, '{'), ...ty.members.flatMap((m, i) => [...(i ? [L(at, ',')] : []), ...(node?.s?.[i] || !m.init ? emit(m.type, node?.s?.[i], at) : m.init.map((x) => ({ ...x })))]), L(at, '}')];
}
/** A union's values: .path = value, one per scalar given. */
function unionValues(ty, node, pre, at, parts) {
  if (!node) return;
  if (ty.k === 's') { parts.push([...pre, L(at, '='), ...(node.e?.length ? node.e : [L(at, '0', 'num')])]); return; }
  if (ty.k === 'a') { node.a.forEach((n, i) => unionValues(ty.of, n, [...pre, L(at, '['), L(at, String(i), 'num'), L(at, ']')], at, parts)); return; }
  const member = (m, n) => unionValues(m.type, n, m.name === null ? pre : [...pre, L(at, '.'), L(at, m.name, 'id')], at, parts);
  if (ty.union) { if (node.m >= 0) member(ty.members[node.m], node.n); return; }
  ty.members.forEach((m, i) => member(m, node.s[i]));
}

/** The statements of a struct's body: at its ';', after a function's { … }. */
function memberStatements(ts) {
  const out = [[]];
  for (let k = 0; k < ts.length; k++) {
    if (op(ts[k], '{') || op(ts[k], '(') || op(ts[k], '[')) {
      const e = closing(ts, k);
      const fn = op(ts[k], '{') && (op(ts[k - 1], ')') || isId(ts[k - 1], 'const'));
      out.at(-1).push(...ts.slice(k, e + 1));
      k = e;
      if (fn) out.push([]);
      continue;
    }
    if (op(ts[k], ';')) { out.push([]); continue; }
    out.at(-1).push(ts[k]);
  }
  return out.filter((x) => x.length);
}

export function cDesignated(input, report) {
  const types = new Map(), consts = new Map(), after = new Map();
  const out = [];
  for (let k = 0; k < input.length; k++) {
    const t = input[k];
    if (after.has(k)) { const e = declarators(k, after.get(k)); if (e > k) { k = e - 1; continue; } }
    if (isId(t, 'enum')) enumValues(k);
    if (STMT_START(input[k - 1])) {
      const e = statement(k);
      if (e > k) { k = e - 1; continue; }
    }
    // (a list of values, its type not known here: an expression's, as (S){ .x = 1 })
    if ((op(t, '{') || op(t, ',')) && (op(input[k + 1], '.') && isId(input[k + 2]) || (op(t, '{') && op(input[k + 1], '[')))) {
      report(input[k + 1], 'a designated initializer is supported in a declaration of a struct, a union or an array, not here');
      out.push(t, L(t, '0', 'num'), L(t, '}'));
      k = op(t, '{') ? closing(input, k) : k + 2;
      continue;
    }
    out.push(t);
  }
  return out;

  function enumValues(k) {
    let j = k + 1;
    if (isId(input[j], 'class') || isId(input[j], 'struct')) j++;
    if (isId(input[j])) j++;
    if (op(input[j], ':')) while (input[j] && !op(input[j], '{') && !op(input[j], ';')) j++;
    if (!op(input[j], '{')) return;
    let v = -1n;
    for (const item of splitTop(input.slice(j + 1, closing(input, j)))) {
      if (!isId(item[0])) continue;
      v = (op(item[1], '=') ? constOf(item.slice(2), consts) : null) ?? v + 1n;
      consts.set(item[0].v, v);
    }
  }

  /** The type at j: { type, next } or null. */
  function typeAt(ts, j) {
    while (isId(ts[j]) && QUALS.has(ts[j].v)) j++;
    const x = ts[j];
    if (!isId(x) || NOT_TYPE.has(x.v)) return null;
    if (['struct', 'union', 'class', 'enum'].includes(x.v)) return isId(ts[j + 1]) ? { type: types.get(ts[j + 1].v) ?? SCALAR, next: j + 2 } : null;
    if (WORDS.has(x.v)) { while (isId(ts[j]) && (WORDS.has(ts[j].v) || QUALS.has(ts[j].v))) j++; return { type: SCALAR, next: j }; }
    if (op(ts[j + 1], '<')) { const e = closing(ts, j + 1); return e > 0 ? { type: SCALAR, next: e + 1 } : null; }
    return { type: types.get(x.v) ?? SCALAR, next: j + 1 };
  }

  /** A declarator's array of its dimensions' tokens. */
  function arrayOf(type, dims) {
    return dims.reduceRight((of, d) => ({ k: 'a', n: d.length ? (() => { const v = constOf(d, consts); return v === null ? null : Number(v); })() : null, of }), type);
  }

  /** A struct's or a union's type from its body. */
  function record(body, union, at) {
    const ty = { k: 'r', union, members: [], key: placeOf(at) };
    for (const st of memberStatements(body)) {
      let j = 0;
      while (['public', 'private', 'protected'].includes(st[j]?.v) && op(st[j + 1], ':')) j += 2;
      if (j >= st.length || st.slice(j).some((x) => isId(x, 'static') || isId(x, 'typedef') || isId(x, 'friend') || isId(x, 'using'))) continue;
      const kw = st[j];
      const inner = (isId(kw, 'struct') || isId(kw, 'union') || isId(kw, 'class')) ? (op(st[j + 1], '{') ? j + 1 : op(st[j + 2], '{') ? j + 2 : -1) : -1;
      let type, next;
      if (inner >= 0) {
        const e = closing(st, inner);
        type = record(st.slice(inner + 1, e), isId(kw, 'union'), kw);
        if (inner === j + 2) types.set(st[j + 1].v, type);
        next = e + 1;
        if (next >= st.length) { if (inner === j + 1) ty.members.push({ name: null, type, init: null }); continue; }
      } else {
        if (st.slice(j).some((x, i, a) => op(x, '(') && !a.slice(0, i).some((y) => op(y, '=')))) continue;   // (a method)
        const r = typeAt(st, j);
        if (!r) continue;
        ({ type, next } = r);
        if (type === SCALAR && st[j + 1] && op(st[j + 1], '<') && st[j + 2]?.v === '0') continue;   // (ap_uint<0>: no bits, no member)
      }
      for (const d of splitTop(st.slice(next))) {
        let i = 0;
        let ptr = false;
        while (op(d[i], '*') || op(d[i], '&') || isId(d[i], 'const')) { ptr ||= !isId(d[i]); i++; }
        if (!isId(d[i])) continue;   // (an unnamed bit-field: padding)
        const name = d[i++].v;
        const dims = [];
        while (op(d[i], '[')) { const e = closing(d, i); dims.push(d.slice(i + 1, e)); i = e + 1; }
        const init = op(d[i], '=') ? d.slice(i + 1) : op(d[i], '{') ? d.slice(i) : null;
        ty.members.push({ name, type: arrayOf(ptr ? SCALAR : type, dims), init });
      }
    }
    return ty;
  }

  /** A statement from k: a definition's type kept, a declaration's initializers written. The index after what it
   *  wrote, or k when it wrote nothing. */
  function statement(k) {
    let j = k;
    while (isId(input[j]) && QUALS.has(input[j].v)) j++;
    const kw = input[j];
    const td = isId(input[k], 'typedef');
    if ((isId(kw, 'struct') || isId(kw, 'union') || isId(kw, 'class')) && (op(input[j + 1], '{') || (isId(input[j + 1]) && (op(input[j + 2], '{') || op(input[j + 2], ':'))))) {
      let open = j + 1;
      while (input[open] && !op(input[open], '{')) open++;
      const end = closing(input, open);
      const ty = record(input.slice(open + 1, end), isId(kw, 'union'), kw);
      if (isId(input[j + 1])) types.set(input[j + 1].v, ty);
      if (td && isId(input[end + 1])) types.set(input[end + 1].v, ty);
      else if (!td) after.set(end + 1, ty);
      return k;
    }
    if (td) {
      const r = typeAt(input, j);
      if (r && r.type !== SCALAR && isId(input[r.next]) && op(input[r.next + 1], ';')) types.set(input[r.next].v, r.type);
      return k;
    }
    const r = typeAt(input, k);
    if (!r) return k;
    // (const int N = 4;: a constant of the sizes and the indices)
    if (r.type === SCALAR && isId(input[k], 'const') && isId(input[r.next]) && op(input[r.next + 1], '=')) {
      let e = r.next + 2;
      while (input[e] && !op(input[e], ';') && !op(input[e], ',')) e++;
      const v = constOf(input.slice(r.next + 2, e), consts);
      if (v !== null) consts.set(input[r.next].v, v);
    }
    if (!isId(input[r.next]) && !op(input[r.next], '*') && !op(input[r.next], '&')) return k;
    out.push(...input.slice(k, r.next));
    const e = declarators(r.next, r.type);
    if (e > r.next) return e;
    out.length -= r.next - k;
    return k;
  }

  /** The declarators from j of a type: each one's initializer written if it asks for it. The index after what it wrote
   *  (its ';' left), or j when none of them did. */
  function declarators(j, type) {
    const mark = out.length;
    let changed = false;
    for (;;) {
      let i = j;
      let ptr = false;
      while (op(input[i], '*') || op(input[i], '&') || isId(input[i], 'const')) { ptr ||= !isId(input[i]); i++; }
      if (!isId(input[i]) || op(input[i + 1], '(')) break;
      const name = input[i++];
      const dims = [];
      while (op(input[i], '[')) { const e = closing(input, i); dims.push(input.slice(i + 1, e)); i = e + 1; }
      const eq = op(input[i], '=');
      const open = eq ? i + 1 : i;
      if (op(input[open], '{')) {
        const end = closing(input, open);
        const ts = input.slice(open, end + 1);
        const ty = arrayOf(ptr ? SCALAR : type, dims);
        if (designated(ts) || withUnion(ty)) {
          // (the sizes as numbers: an enum's constant, a const int)
          const sizes = dims.flatMap((d) => { const v = d.length ? constOf(d, consts) : null; return [L(name, '['), ...(v === null ? d : [L(name, String(v), 'num')]), L(name, ']')]; });
          out.push(...input.slice(j, input.indexOf(name, j) + 1), ...sizes, L(input[i], '='), ...written(ty, ts, name));
          changed = true;
        } else out.push(...input.slice(j, end + 1));
        i = end + 1;
      } else {
        out.push(...input.slice(j, i));
        if (eq) { const e = valueEnd(i + 1); out.push(...input.slice(i, e)); i = e; }
      }
      j = i;
      if (!op(input[j], ',')) break;
      out.push(input[j++]);
    }
    if (changed) return j;
    out.length = mark;
    return -1;
  }
  function valueEnd(j) {
    for (; j < input.length; j++) {
      const x = input[j];
      if (op(x, '(') || op(x, '[') || op(x, '{')) { j = closing(input, j); continue; }
      if (op(x, ',') || op(x, ';') || op(x, ')')) return j;
    }
    return j;
  }
  /** Whether a list (and the lists in it) has a designator. */
  function designated(ts) { return ts.some((x, i) => (op(x, '.') && isId(ts[i + 1]) && (op(ts[i - 1], '{') || op(ts[i - 1], ','))) || (op(x, '[') && (op(ts[i - 1], '{') || op(ts[i - 1], ',')))); }
  /** A list in full for its type. */
  function written(ty, ts, name) {
    const q = tree(ts, consts, report).list;
    if (ty.k === 's') { report(name, `'${name.v}': a designated initializer of what is not a struct, a union or an array`); return [L(name, '0', 'num')]; }
    return emit(ty, fill(ty, q, true, name.v, report), name);
  }
}
