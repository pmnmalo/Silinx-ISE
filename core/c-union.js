// Silinx HLS (#1896): unions and bit-fields, as tokens (C and C++, before core/c-struct.js). A union is one word, an
// unsigned integer of its size (8, 16, 32 or 64 bits), its members views of the word's bits, laid out as GCC on x86
// lays them out (from the least significant bit; an integer member at an offset of its own size, a bit-field after the
// one before it when it fits in a unit of its type, else at the next): u.m read is the member's bits (an integer cast
// to its type, a bit-field to ap_uint<W> / ap_int<W>, a float or a double its bits as one: ap_bits_float,
// ap_bits_double), u.m = e writes them into the word (the others kept); a struct member of the union (anonymous: its
// members the union's) its members too, an array member its elements (u.b[i]). A union variable, parameter, pointer
// (p->m) or array (a[i].m) is a word; { e } initializes its first member. A bit-field of a struct (outside a union) is a
// member of W bits: ap_uint<W> (ap_int<W> of a signed type), wrapped as C wraps it. Isomorphic ES module.
//
//   cUnions(tokens, report, cpp) -> tokens
import { closing, splitTop, constTokens } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });
const STMT_START = (t) => !t || op(t, ';') || op(t, '{') || op(t, '}') || t.t === 'pragma';
const QUALS = new Set(['const', 'static', 'volatile', 'register', 'extern', 'inline', 'constexpr']);
const STDINT = { int8_t: [8, true], int16_t: [16, true], int32_t: [32, true], int64_t: [64, true], uint8_t: [8, false], uint16_t: [16, false],
  uint32_t: [32, false], uint64_t: [64, false], size_t: [64, false] };
const WORD = { 8: ['unsigned', 'char'], 16: ['unsigned', 'short'], 32: ['unsigned', 'int'], 64: ['unsigned', 'long', 'long'] };
const ASSIGN_OPS = new Set(['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

/** A C scalar type's storage { bits, signed, float } (LP64, char signed as GCC's on x86), else null. */
export function scalarOf(type, typedefs = new Map()) {
  const ws = type.filter((x) => !(isId(x) && QUALS.has(x.v))).map((x) => x.v);
  if (ws.length === 1 && typedefs.has(ws[0])) return scalarOf(typedefs.get(ws[0]), typedefs);
  if (ws.length === 1 && STDINT[ws[0]]) return { bits: STDINT[ws[0]][0], signed: STDINT[ws[0]][1] };
  if (ws.length === 1 && (ws[0] === 'float' || ws[0] === 'double')) return { bits: ws[0] === 'float' ? 32 : 64, float: true };
  if (ws.length === 1 && (ws[0] === 'bool' || ws[0] === '_Bool')) return { bits: 8, signed: false, bool: true };
  if (!ws.length || ws.some((w) => !['char', 'short', 'int', 'long', 'signed', 'unsigned'].includes(w))) return null;
  const bits = ws.includes('char') ? 8 : ws.includes('short') ? 16 : ws.includes('long') ? 64 : 32;
  return { bits, signed: !ws.includes('unsigned') };
}

/** A member list's declarations: [{ type, name, dims: [n], width (a bit-field's) | null, sub (a struct's members) }]
 *  (said and left out: what a union cannot hold). */
function memberList(body, ctx, what) {
  const out = [];
  for (const st of statements(body)) {
    if (!st.length) continue;
    // (a struct inside: its members, its name or none (anonymous))
    if ((isId(st[0], 'struct') || isId(st[0], 'union')) && (op(st[1], '{') || op(st[2], '{'))) {
      const open = op(st[1], '{') ? 1 : 2;
      if (isId(st[0], 'union')) { ctx.report(st[0], `${what}: a union inside it is not supported yet`); continue; }
      const end = closing(st, open);
      const sub = memberList(st.slice(open + 1, end), ctx, what);
      if (open === 2) ctx.layouts.set(st[1].v, sub);
      const names = st.slice(end + 1).filter((x) => isId(x));
      if (!names.length) out.push({ name: null, sub });
      for (const n of names) out.push({ name: n.v, sub, loc: n });
      continue;
    }
    const s0 = isId(st[0], 'struct') ? 1 : 0;
    if (s0 && ctx.layouts.has(st[1]?.v) && isId(st[2])) { out.push({ name: st[2].v, sub: ctx.layouts.get(st[1].v), loc: st[2] }); continue; }
    if (s0 && isId(st[1]) && isId(st[2]) && !ctx.layouts.has(st[1].v)) { ctx.report(st[1], `${what}: the struct '${st[1].v}' is not known here`); continue; }
    const parts = splitTop(st);
    const first = parts[0];
    let k = 0;
    while (k < first.length && !op(first[k], '[') && !op(first[k], ':')) k++;
    const nameAt = isId(first[k - 1]) && k > 1 ? k - 1 : -1;
    const type = nameAt < 0 ? first.slice(0, k) : first.slice(0, nameAt);
    const sc = scalarOf(type.filter((x) => !op(x, '*')), ctx.typedefs);
    if (type.some((x) => op(x, '*'))) { ctx.report(first[0], `${what}: a pointer in it is not possible in Silinx HLS`); continue; }
    if (!sc) { ctx.report(first[0], `${what}: '${type.map((x) => x.v).join(' ')}' is not a C integer or floating type (Silinx HLS: a union of C's types)`); continue; }
    for (const [i, p] of parts.entries()) {
      const d = i === 0 ? (nameAt < 0 ? p.slice(k) : p.slice(nameAt)) : p;
      const name = isId(d[0]) ? d[0] : null;
      let j = name ? 1 : 0;
      const dims = [];
      while (op(d[j], '[')) { const e = closing(d, j); dims.push(Number(constTokens(d.slice(j + 1, e)) ?? 0)); j = e + 1; }
      let width = null;
      if (op(d[j], ':')) {
        const w = constTokens(d.slice(j + 1));
        if (w === null || w < 0n || w > BigInt(sc.bits) || sc.float) { ctx.report(d[j], `${what}: the bit-field ${name ? `'${name.v}' ` : ''}must be a constant width from 0 to ${sc.bits}, of an integer type`); continue; }
        width = Number(w);
      }
      if (!name && width === null) continue;
      if (dims.some((n) => !(n >= 1))) { ctx.report(d[0], `${what}: the size of its array '${name?.v}' must be a constant`); continue; }
      out.push({ type, sc, name: name?.v ?? null, dims, width, loc: name || d[0] });
    }
  }
  return out;
}

/** The fields of members laid out from offset 0 (a struct's, as GCC on x86): [{ name, sc, type, off, width, dims,
 *  bf }], its size in bits and alignment. Anonymous structs' members flattened into it with their offsets. */
function layout(members, union) {
  const fields = [];
  let off = 0, size = 0, align = 8;
  for (const m of members) {
    if (m.sub) {
      const s = layout(m.sub, false);
      const at = union ? 0 : Math.ceil(off / s.align) * s.align;
      const shift = (f) => ({ ...f, off: f.off + at });
      if (m.name) fields.push({ name: m.name, struct: s.fields.map(shift), off: at, size: s.size });
      else fields.push(...s.fields.map(shift));
      off = at + s.size; align = Math.max(align, s.align); size = Math.max(size, off);
      continue;
    }
    const S = m.sc.bits;
    let at;
    if (m.width !== null) {
      if (union) at = 0;
      else if (m.width === 0) { off = Math.ceil(off / S) * S; continue; }
      else at = Math.floor(off / S) === Math.floor((off + m.width - 1) / S) ? off : Math.ceil(off / S) * S;
      if (!m.name) { off = at + m.width; size = Math.max(size, off); continue; }   // (an unnamed bit-field: padding)
      fields.push({ name: m.name, sc: m.sc, type: m.type, off: at, width: m.width, dims: [], bf: true });
      off = at + m.width;
    } else {
      at = union ? 0 : Math.ceil(off / S) * S;
      fields.push({ name: m.name, sc: m.sc, type: m.type, off: at, width: S, dims: m.dims, bf: false });
      off = at + S * m.dims.reduce((a, b) => a * b, 1);
    }
    align = Math.max(align, S);
    size = Math.max(size, off);
  }
  return { fields, size: Math.ceil(size / align) * align, align };
}

/** Statements of a member list: split at its ';' (a '{ … }' kept whole). */
function statements(ts) {
  const out = [[]];
  for (let k = 0; k < ts.length; k++) {
    if (op(ts[k], '{') || op(ts[k], '(') || op(ts[k], '[')) { const e = closing(ts, k); out.at(-1).push(...ts.slice(k, e + 1)); k = e; continue; }
    if (op(ts[k], ';')) { out.push([]); continue; }
    out.at(-1).push(ts[k]);
  }
  return out;
}

/** A struct's body with its bit-fields members of their widths (ap_uint<W> / ap_int<W>). */
function bitFieldMembers(body, ctx) {
  const out = [];
  for (let k = 0; k < body.length; k++) {
    if (isId(body[k], 'union') && STMT_START(body[k - 1])) {
      ctx.report(body[k], 'a union inside a struct is not supported yet (a union of its own, a member of the struct)');
      while (k < body.length && !op(body[k], ';')) k = op(body[k], '{') ? closing(body, k) + 1 : k + 1;   // (left out)
      continue;
    }
    // (braces: a member struct's fields, rewritten too; a method's body as it is; parentheses as they are)
    if (op(body[k], '{') || op(body[k], '(')) {
      const e = closing(body, k);
      const sub = op(body[k], '{') && (isId(body[k - 1], 'struct') || isId(body[k - 2], 'struct'));
      out.push(...(sub ? [body[k], ...bitFieldMembers(body.slice(k + 1, e), ctx), body[e]] : body.slice(k, e + 1)));
      k = e;
      continue;
    }
    if (['public', 'private', 'protected'].includes(body[k].v) && op(body[k + 1], ':')) { out.push(body[k], body[++k]); continue; }
    // (a member's declaration: from a statement's start, or after public: …)
    const access = op(body[k - 1], ':') && ['public', 'private', 'protected'].includes(body[k - 2]?.v);
    if (k && !STMT_START(body[k - 1]) && !access) { out.push(body[k]); continue; }
    let e = k;
    while (e < body.length && !op(body[e], ';') && !op(body[e], '{') && !op(body[e], '(') && !op(body[e], '=') && !op(body[e], '?')) e++;
    const st = body.slice(k, e);
    const parts = splitTop(st);
    const colon = parts.length ? parts[0].findIndex((x) => op(x, ':')) : -1;
    if (!op(body[e], ';') || !parts.some((p) => p.some((x) => op(x, ':'))) || colon === 0 || st.some((x) => op(x, '*'))) { out.push(body[k]); continue; }
    if (colon === 1 && parts.length === 1) { k = e; continue; }   // (T : 3;, padding: left out)
    // (T a : 3, b : 4, c;: each its own member)
    const nameAt = colon >= 0 ? colon - 1 : parts[0].length - 1;
    const type = parts[0].slice(0, nameAt);
    const sc = scalarOf(type, ctx.typedefs);
    for (const [i, p] of parts.entries()) {
      const d = i ? p : p.slice(nameAt), name = d[0];
      if (op(name, ':')) continue;   // (padding)
      if (!op(d[1], ':')) { out.push(...type.map((x) => ({ ...x })), ...d, L(name, ';')); continue; }
      const w = constTokens(d.slice(2));
      if (!sc || sc.float || w === null || w < 1n || w > BigInt(sc.bits)) { ctx.report(name, `the bit-field '${name.v}': a constant width from 1 to its type's bits, of a C integer type`); continue; }
      const ap = Number(w) === sc.bits && !sc.bool ? type.map((x) => ({ ...x })) : [L(name, sc.signed ? 'ap_int' : 'ap_uint', 'id'), L(name, '<'), L(name, String(w), 'num'), L(name, '>')];
      out.push(...ap, name, L(name, ';'));
    }
    k = e;
  }
  return out;
}

export function cUnions(input, report, cpp = false) {
  const ctx = { report, typedefs: new Map(), layouts: new Map(), unions: new Map() };
  const vars = [];   // [{ name, U, ptr, depth }]: the union variables in scope
  let out = [];
  let depth = 0;
  const look = (name) => { for (let i = vars.length - 1; i >= 0; i--) if (vars[i].name === name) return vars[i]; return null; };
  for (let k = 0; k < input.length; k++) {
    const t = input[k];
    if (op(t, '{')) depth++;
    if (op(t, '}')) { depth--; while (vars.length && vars.at(-1).depth > depth) vars.pop(); }
    if (op(t, ';') && depth === 0) while (vars.length && vars.at(-1).depth > 0) vars.pop();   // (a prototype's parameters)
    const td = isId(t, 'typedef');
    const s0 = td ? k + 1 : k;
    // typedef union [tag] { … } A;  union tag { … } [a, b];  struct …'s bit-fields
    if ((isId(input[s0], 'union') || isId(input[s0], 'struct') || isId(input[s0], 'class')) && (op(input[s0 + 1], '{') || (isId(input[s0 + 1]) && op(input[s0 + 2], '{')))) {
      const open = op(input[s0 + 1], '{') ? s0 + 1 : s0 + 2;
      const tag = open === s0 + 2 ? input[s0 + 1].v : null;
      const end = closing(input, open);
      const body = input.slice(open + 1, end);
      const alias = td && isId(input[end + 1]) ? input[end + 1].v : null;
      if (!isId(input[s0], 'union')) {
        const members = memberList(body, { ...ctx, report: () => {} }, '');   // (its layout, for a union holding it)
        if (tag) ctx.layouts.set(tag, members);
        if (alias) ctx.layouts.set(alias, members);
        out.push(...input.slice(k, open + 1), ...bitFieldMembers(body, ctx), input[end]);
        k = end;
        continue;
      }
      const name = tag ?? alias ?? '(anonymous)';
      const U = union(body, name, t);
      if (tag) ctx.unions.set(`union ${tag}`, U);
      if (tag && cpp) ctx.unions.set(tag, U);   // (C++: the tag a type's name)
      if (alias) ctx.unions.set(alias, U);
      if (td) { k = op(input[end + 2], ';') ? end + 2 : end + 1; continue; }
      if (op(input[end + 1], ';')) { k = end + 1; continue; }
      // (union U { … } a, b;: its variables)
      k = declarators(input, end + 1, U, t, true);
      continue;
    }
    // typedef union tag A;  typedef T A; (a scalar's: its storage known)
    if (td) {
      let e = k + 1;
      while (input[e] && !op(input[e], ';') && !op(input[e], '{') && !op(input[e], '(')) e++;
      if (op(input[e], ';') && isId(input[e - 1])) {
        const ty = input.slice(k + 1, e - 1);
        const U = ctx.unions.get(ty.map((x) => x.v).join(' '));
        if (U) { ctx.unions.set(input[e - 1].v, U); k = e; continue; }
        ctx.typedefs.set(input[e - 1].v, ty);
      }
    }
    // a union type: its word; a declaration's names its variables
    const U = isId(t, 'union') && isId(input[k + 1]) ? ctx.unions.get(`union ${input[k + 1].v}`) : isId(t) && !op(input[k - 1], '.') && !op(input[k - 1], '->') && !op(input[k - 1], '::') ? ctx.unions.get(t.v) : null;
    if (U) {
      let p = out.length - 1;
      while (p >= 0 && isId(out[p]) && QUALS.has(out[p].v)) p--;
      k = declarators(input, isId(t, 'union') ? k + 2 : k + 1, U, t, STMT_START(out[p]));
      continue;
    }
    // a use of a union variable's member
    const v = isId(t) && !op(input[k - 1], '.') && !op(input[k - 1], '->') ? look(t.v) : null;
    if (v && (op(input[k + 1], '.') || op(input[k + 1], '->') || op(input[k + 1], '['))) { k = use(input, k, v) - 1; continue; }
    out.push(t);
  }
  return out;

  /** A union's definition: { name, bits, word: tokens, fields }. */
  function union(body, name, t) {
    const what = `the union '${name}'`;
    const members = memberList(body, ctx, what);
    const { fields, size } = layout(members, true);
    const bits = [8, 16, 32, 64].find((b) => b >= size);
    if (!bits) report(t, `${what}: ${size} bits: a union of up to 64 bits is supported`);
    return { name, bits: bits ?? 64, word: (at) => WORD[bits ?? 64].map((w) => L(at, w, 'id')), fields };
  }

  /** The declarators after a union's type from j (stmt: a declaration's, else one parameter's or a cast's): the
   *  word's type, the names its variables, { … } a first member's value. The index of its last token. */
  function declarators(ts, j, U, at, stmt) {
    out.push(...U.word(at));
    for (;;) {
      let ptr = false;
      while (op(ts[j], '*') || isId(ts[j], 'const')) { ptr ||= op(ts[j], '*'); out.push(ts[j++]); }
      if (!isId(ts[j]) || op(ts[j + 1], '(')) return j - 1;   // (a cast, sizeof, a function's result)
      const name = ts[j++];
      out.push(name);
      const dims = [];
      while (op(ts[j], '[')) { const e = closing(ts, j); dims.push(ts.slice(j + 1, e)); out.push(...rewrite(ts.slice(j, e + 1))); j = e + 1; }
      vars.push({ name: name.v, U, ptr, arr: dims.length > 0, depth: stmt ? depth : depth + 1 });
      if (op(ts[j], '=')) {
        const e = exprEnd(ts, j + 1);
        out.push(ts[j]);
        const init = ts.slice(j + 1, e);
        out.push(...(op(init[0], '{') ? initList(init, dims.length, U, name) : rewrite(init)));
        j = e;
      }
      if (!stmt || !op(ts[j], ',')) return j - 1;
      out.push(ts[j++]);
    }
  }
  /** { e } (or { { … }, … } of an array): the first member's values as words. */
  function initList(init, nd, U, at) {
    const items = splitTop(init.slice(1, closing(init, 0)));
    if (nd) return [L(at, '{'), ...items.flatMap((x, i) => [...(i ? [L(at, ',')] : []), ...(op(x[0], '{') ? initList(x, nd - 1, U, at) : initList([L(at, '{'), ...x, L(at, '}')], 0, U, at))]), L(at, '}')];
    if (items.some((x) => op(x[0], '.'))) { report(at, `'${at.v}': a designated initializer of a union is not supported yet (its first member's value: { v })`); return [L(at, '0', 'num')]; }
    const f = U.fields[0];
    if (!items.length || !f) return [L(at, '0', 'num')];
    // (a struct member: its fields' values in order, their braces elided or not)
    const leaves = f.struct ? f.struct : [f];
    const vals = (f.struct && items.length === 1 && op(items[0][0], '{') ? splitTop(items[0].slice(1, -1)) : items).map((x) => rewrite(x));
    const parts = leaves.slice(0, vals.length).map((l, i) => merge(U, l, vals[i], null, at));
    return [L(at, '('), ...parts.flatMap((p, i) => [...(i ? [L(at, '|')] : []), ...p]), L(at, ')')];
  }

  /** A union variable's use from k: its member read or written. The index after it. */
  function use(ts, k, v) {
    const t = ts[k];
    let j = k + 1;
    // (the word: v, v[i], (*p), p[i])
    let word = [t];
    while (op(ts[j], '[')) { const e = closing(ts, j); word.push(...rewrite(ts.slice(j, e + 1))); j = e + 1; }
    if (op(ts[j], '->')) { word = [L(t, '('), L(t, '*'), ...word, L(t, ')')]; j++; }
    else if (op(ts[j], '.')) j++;
    else { out.push(...word); return j; }
    if (!isId(ts[j])) { out.push(...word); return j; }
    let f = v.U.fields.find((x) => x.name === ts[j].v);
    if (!f) { report(ts[j], `'${ts[j].v}' is not a member of ${v.U.name}`); out.push(L(t, '0', 'num')); return j + 1; }
    j++;
    if (f.struct) {
      const g = op(ts[j], '.') && isId(ts[j + 1]) ? f.struct.find((x) => x.name === ts[j + 1].v) : null;
      if (!g) { report(ts[j - 1], `'${ts[j - 1].v}': a struct of the union '${v.U.name}': give its member (${t.v}.${ts[j - 1].v}.m)`); out.push(L(t, '0', 'num')); return j; }
      f = g;
      j += 2;
    }
    // (an array member's element: its offset by the index)
    let off = null;
    if (f.dims.length) {
      if (!op(ts[j], '[') || f.dims.length > 1) { report(ts[j - 1], `'${f.name}' of the union '${v.U.name}': an array of one dimension, indexed (${f.name}[i])`); out.push(L(t, '0', 'num')); return j; }
      const e = closing(ts, j);
      off = [L(t, '('), L(t, '('), ...rewrite(ts.slice(j + 1, e)), L(t, ')'), L(t, '*'), L(t, String(f.width), 'num'), L(t, '+'), L(t, String(f.off), 'num'), L(t, ')')];
      j = e + 1;
    }
    const side = word.some((x) => op(x, '++') || op(x, '--') || (x.t === 'op' && /^([-+*/%&|^]|<<|>>)?=$/.test(x.v)));
    const o = ts[j];
    if (op(o, '++') || op(o, '--') || op(out.at(-1), '++') || op(out.at(-1), '--')) { report(o, `'${f.name}' of a union: ++ and -- on it are not supported yet (write ${t.v}.${f.name} += 1)`); out.push(...read(v.U, f, word, off, t)); return j + 1; }
    if (o && o.t === 'op' && (o.v === '=' || ASSIGN_OPS.has(o.v))) {
      if (side) report(t, `'${t.v}': an index with a side effect in a union's member written: not supported (compute it before)`);
      const e = exprEnd(ts, j + 1);
      let rhs = rewrite(ts.slice(j + 1, e));
      if (o.v !== '=') rhs = [L(o, '('), ...read(v.U, f, word, off, t), L(o, ')'), L(o, o.v.slice(0, -1)), L(o, '('), ...rhs, L(o, ')')];
      const keep = f.off === 0 && f.width === v.U.bits && !off ? [] : [L(t, '('), L(t, '('), ...word, L(t, ')'), L(t, '&'), L(t, '~'), ...mask(v.U, f, off, t), L(t, ')'), L(t, '|')];
      out.push(L(t, '('), ...word, L(o, '='), ...keep, ...merge(v.U, f, rhs, off, t), L(t, ')'));
      return e;
    }
    out.push(...read(v.U, f, word, off, t));
    return j;
  }
  /** The tokens from j rewritten up to the end of an expression (a ',', ';', ')', ']', '}' or ':' of no '?' outside). */
  function exprEnd(ts, j) {
    let q = 0;
    for (; j < ts.length; j++) {
      const x = ts[j];
      if (op(x, '(') || op(x, '[') || op(x, '{')) { j = closing(ts, j); continue; }
      if (op(x, '?')) q++;
      if (op(x, ':') && q) { q--; continue; }
      if (op(x, ',') || op(x, ';') || op(x, ')') || op(x, ']') || op(x, '}') || op(x, ':') || x.t === 'eof') return j;
    }
    return j;
  }
  /** Tokens rewritten on their own (an index, a value): their unions' uses. */
  function rewrite(ts) {
    const saved = out;
    out = [];
    for (let k = 0; k < ts.length; k++) {
      const t = ts[k];
      const v = isId(t) && !op(ts[k - 1], '.') && !op(ts[k - 1], '->') ? look(t.v) : null;
      if (v && (op(ts[k + 1], '.') || op(ts[k + 1], '->') || op(ts[k + 1], '['))) { k = use(ts, k, v) - 1; continue; }
      out.push(t);
    }
    const r = out;
    out = saved;
    return r;
  }
}

// ------------------------------------------------------------------ a member's bits
const num = (t, v) => L(t, v, 'num');
const shiftOf = (f, off, t) => off ?? (f.off ? [num(t, String(f.off))] : null);
/** The member's mask in the word, at its place: ((word)M << s). */
function mask(U, f, off, t) {
  const m = ((1n << BigInt(f.width)) - 1n).toString(16);
  const s = shiftOf(f, off, t);
  const M = [L(t, '('), L(t, '('), ...U.word(t), L(t, ')'), num(t, `0x${m}${U.bits > 32 ? 'ULL' : 'u'}`), L(t, ')')];
  return s ? [L(t, '('), ...M, L(t, '<<'), ...s, L(t, ')')] : M;
}
/** A value v of the member as its bits in the word, at its place. */
function merge(U, f, v, off, t) {
  const bits = f.sc.float ? [L(t, f.sc.bits === 32 ? 'ap_float_bits' : 'ap_double_bits', 'id'), L(t, '('), ...v, L(t, ')')] : [L(t, '('), ...v, L(t, ')')];
  const s = shiftOf(f, off, t);
  const w = [L(t, '('), L(t, '('), ...U.word(t), L(t, ')'), ...bits, L(t, '&'), ...mask(U, { ...f, off: 0 }, null, t), L(t, ')')];
  return s ? [L(t, '('), ...w, L(t, '<<'), ...s, L(t, ')')] : w;
}
/** The member read from the word: its type's value of its bits. */
function read(U, f, word, off, t) {
  const s = shiftOf(f, off, t);
  const bits = s ? [L(t, '('), L(t, '('), ...word, L(t, ')'), L(t, '>>'), ...s, L(t, ')')] : [L(t, '('), ...word, L(t, ')')];
  if (f.sc.float) {
    const u = f.sc.bits === 32 ? ['unsigned', 'int'] : ['unsigned', 'long', 'long'];
    return [L(t, f.sc.bits === 32 ? 'ap_bits_float' : 'ap_bits_double', 'id'), L(t, '('), L(t, '('), ...u.map((x) => L(t, x, 'id')), L(t, ')'), ...bits, L(t, ')')];
  }
  const ty = f.bf && (f.width !== f.sc.bits || f.sc.bool) ? [L(t, f.sc.signed ? 'ap_int' : 'ap_uint', 'id'), L(t, '<'), num(t, String(f.width)), L(t, '>')] : f.type.filter((x) => !(isId(x) && QUALS.has(x.v))).map((x) => ({ ...x }));
  return [L(t, '('), L(t, '('), ...ty, L(t, ')'), ...bits, L(t, ')')];
}
