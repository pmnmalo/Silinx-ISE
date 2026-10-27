// Silinx HLS (#1590): structs and enums, as tokens (C and C++; in C++ after core/cpp-template.js and core/cpp-sugar.js).
// A struct is disaggregated, as Vitis HLS does with the structs inside the code: each of its members (a nested struct's
// too, its own members) a variable of its own, named by the variable and the member (p.x is p_x, line[2].a.b is
// line_a_b[2]); an array of structs an array per member; a member array of an array of structs one array of both
// sizes (a[i].v[j] is a_v[i * 4 + j]). A struct copied (a = b; S c = d;) member by member; passed to a function, by
// value, by reference or by its address, member by member (their arguments); returned by a function, through
// parameters added for it (its call a statement: x = f(…); or S x = f(…);). Initializer lists ({ … }, nested or
// not) give each member its values. An enum's constants are constants, its type an int.
//
//   cStructs(tokens, report, cpp) -> { tokens, structArgs: Map(function -> [{ name, members: [names] }]) }
import { closing, splitTop, constTokens } from './cpp-template.js';
import { parseMethod, methodFunctions, foldDefaultCtor } from './cpp-method.js';
import { structStreams } from './c-struct-stream.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const QUALS = new Set(['const', 'static', 'volatile', 'register', 'extern', 'inline']);
const STMT_START = (t) => !t || op(t, ';') || op(t, '{') || op(t, '}') || t.t === 'pragma' || op(t, ':');

const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });

/** The constant arguments of the ap types folded: ap_uint<(32 + 7) / 8> is ap_uint<4> (a class template's member
 *  once its parameters are given). */
function foldApWidths(toks) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    out.push(t);
    if (!(isId(t) && /^ap_u?(int|fixed)$/.test(t.v) && op(toks[k + 1], '<'))) continue;
    const end = closing(toks, k + 1);
    if (end < 0 || !toks[end] || !op(toks[end], '>')) continue;
    const args = splitTop(toks.slice(k + 2, end));
    if (!args.some((a) => a.length > 1)) continue;
    const vals = args.map((a) => (a.length > 1 ? constTokens(a) : null));
    out.push(toks[k + 1]);
    args.forEach((a, i) => {
      if (i) out.push(L(a[0], ','));
      out.push(...(vals[i] !== null ? [L(a[0], String(vals[i]), 'num')] : a));
    });
    out.push(toks[end]);
    k = end;
  }
  return out;
}

export function cStructs(input, report, cpp) {
  // (structs: name -> { name, members: [{ name, type: tokens, dims: [tokens], struct, init }] }; sigs: the functions
  // with struct parameters or results, name -> { params: [{ name, S, kind: 'val' | 'ref' | 'ptr' | 'arr', dims }],
  // ret }; structArgs: their members, the top's ports, core/c-hdl.js)
  const cx = { structs: new Map(), enums: new Set(), enumVals: new Map(), sigs: new Map(), structArgs: new Map(), report, cpp };
  const defs = definitions(foldApWidths(input), cx);
  const streamArgs = new Map();
  const toks = cpp ? structStreams(defs, cx.structs, report, streamArgs) : defs;
  signatures(toks, cx);
  for (const [f, a] of streamArgs) cx.structArgs.set(f, [...a, ...(cx.structArgs.get(f) || [])]);
  return { tokens: uses(toks, cx), structArgs: cx.structArgs };
}

// ------------------------------------------------------------------ the definitions
function definitions(input, cx) {
  const { structs, enums, enumVals, report } = cx;
  const toks = [];
  for (let k = 0; k < input.length; k++) {
    const t = input[k];
    // enum E { A, B = 5 }; (typedef enum { … } E;): its constants, its type an int
    const td = isId(t, 'typedef');
    const e0 = td ? k + 1 : k;
    if (isId(input[e0], 'enum')) {
      let j = e0 + 1;
      if (isId(input[j], 'class') || isId(input[j], 'struct')) j++;
      const tag = isId(input[j]) ? input[j++].v : null;
      if (op(input[j], ':')) { j++; while (input[j] && !op(input[j], '{') && !op(input[j], ';')) j++; }
      if (op(input[j], '{')) {
        const end = closing(input, j);
        let v = -1n, prev = null;
        for (const item of splitTop(input.slice(j + 1, end))) {
          if (!item.length) continue;
          const name = item[0];
          const val = item.length > 2 && op(item[1], '=') ? item.slice(2) : prev ? [...prev, L(name, '+'), L(name, '1', 'num')] : [L(name, '0', 'num')];
          const c = constTokens(val.map((x) => (x.t === 'id' && enumVals.has(x.v) ? L(x, String(enumVals.get(x.v)), 'num') : x)));
          if (c === null) report(name, `the enum constant '${name.v}': its value must be a constant`);
          v = c ?? v + 1n;
          prev = [L(name, String(v), 'num')];
          enumVals.set(name.v, v);
          toks.push(L(name, 'const', 'id'), L(name, 'int', 'id'), name, L(name, '='), L(name, String(v), 'num'), L(name, ';'));
        }
        let e = end + 1;
        const alias = td && isId(input[e]) ? input[e++] : null;
        if (tag) enums.add(tag);
        if (alias) enums.add(alias.v);
        // (enum E { … } e;: its variables ints)
        if (!td && isId(input[e])) { toks.push(L(t, 'int', 'id')); while (input[e] && !op(input[e], ';')) toks.push(input[e++]); toks.push(input[e]); }
        k = op(input[e], ';') ? e : e - 1;
        continue;
      }
    }
    // struct S { … };  typedef struct [S] { … } A;  class C { … };
    const s0 = td ? k + 1 : k;
    if ((isId(input[s0], 'struct') || isId(input[s0], 'class') || isId(input[s0], 'union')) && !op(toks.at(-1), '(') && !op(toks.at(-1), ',')) {
      let j = s0 + 1;
      const tag = isId(input[j]) ? input[j++].v : null;
      if (isId(input[j], 'final')) j++;
      if (op(input[j], ':')) { report(input[j], `the struct '${tag}': a base class is not supported yet`); while (input[j] && !op(input[j], '{')) j++; }
      if (op(input[j], '{')) {
        if (isId(input[s0], 'union')) report(input[s0], 'a union is not possible in Silinx HLS (its members share their bits: write the conversions)');
        const end = closing(input, j);
        let e = end + 1;
        const alias = td && isId(input[e]) ? input[e++].v : null;
        const name = tag || alias;
        const def = { name, members: [], methods: new Map(), ctors: [] };
        members(input.slice(j + 1, end), def);
        def.at = toks.length;
        structs.set(name, def);
        if (alias && alias !== name) structs.set(alias, def);
        // (struct S { … } a, b;: its variables declared after it)
        if (!td && !op(input[e], ';')) { toks.push(L(input[s0], name, 'id')); while (input[e] && !op(input[e], ';')) toks.push(input[e++]); toks.push(input[e]); }
        k = op(input[e], ';') ? e : e - 1;
        continue;
      }
      // struct S; (declared alone): dropped
      if (tag && op(input[j], ';') && !td) { k = j; continue; }
    }
    // a method defined outside its struct: int S::get() const { … }, S::S(int v) : a(v) { … }
    if (isId(t) && structs.has(t.v) && op(input[k + 1], '::') && (isId(input[k + 2]) || op(input[k + 2], '~')) && !op(input[k - 1], '::')) {
      const def = structs.get(t.v);
      let r = toks.length;
      while (r > 0 && !STMT_START(toks[r - 1])) r--;
      const head = toks.splice(r);
      let e = k + 2;
      while (input[e] && !op(input[e], '{') && !op(input[e], ';')) e = op(input[e], '(') ? closing(input, e) + 1 : e + 1;
      // (a constructor's initializer list: its parentheses skipped above, its braces a body's only after them)
      const end = op(input[e], '{') ? closing(input, e) : e;
      const m = parseMethod([...head, ...input.slice(k + 2, end + 1)], def.name, report);
      if (m?.ctor) {
        const n = splitTop(m.params).length;
        const c = def.ctors.find((x) => !x.body && splitTop(x.params).length === n);
        if (c) Object.assign(c, { params: m.params, inits: m.inits, body: m.body }); else def.ctors.push({ ...m, fn: `${def.name}_ctor${def.ctors.length}` });
      } else if (m) {
        const d = def.methods.get(m.name);
        if (d) Object.assign(d, { params: m.params, body: m.body, isConst: m.isConst }); else def.methods.set(m.name, m);
      }
      k = end;
      continue;
    }
    // typedef [struct] S A; (S a struct or an enum already defined): A another name of it
    if (td) {
      const j = isId(input[k + 1], 'struct') || isId(input[k + 1], 'class') || isId(input[k + 1], 'enum') ? k + 2 : k + 1;
      const s = input[j], a = input[j + 1];
      if (isId(s) && isId(a) && op(input[j + 2], ';') && (structs.has(s.v) || enums.has(s.v))) {
        if (structs.has(s.v)) structs.set(a.v, structs.get(s.v)); else enums.add(a.v);
        k = j + 2;
        continue;
      }
    }
    // (C: struct S x; the tag a type's name)
    if ((isId(t, 'struct') || isId(t, 'enum') || isId(t, 'class')) && isId(input[k + 1]) && (structs.has(input[k + 1].v) || enums.has(input[k + 1].v))) continue;
    if (t.t === 'id' && enums.has(t.v)) { toks.push(L(t, 'int', 'id')); continue; }
    toks.push(t);
  }
  /** A struct's body: its data members [{ name, type, dims, struct, init }], its methods and constructors
   *  (core/cpp-method.js). */
  function members(body, def) {
    const sname = def.name, out = def.members;
    for (const decl of splitStatements(body)) {
      if (!decl.length) continue;
      if ((isId(decl[0], 'public') || isId(decl[0], 'private') || isId(decl[0], 'protected')) && op(decl[1], ':')) { decl.splice(0, 2); if (!decl.length) continue; }
      if (decl.some((x) => op(x, '(')) || op(decl.at(-1), '}')) {
        if (!cx.cpp) { report(decl[0], `the struct '${sname}': a member function is C++ (a .cpp source)`); continue; }
        const m = parseMethod(decl, sname, report);
        if (m?.ctor) def.ctors.push({ ...m, fn: `${sname}_ctor${def.ctors.length}` });
        else if (m) def.methods.set(m.name, m);
        continue;
      }
      if (decl.some((x) => isId(x, 'static'))) { report(decl[0], `the struct '${sname}': a static member is supported in a class of static members only`); continue; }
      if (isId(decl[0], 'typedef')) { report(decl[0], `the struct '${sname}': a typedef inside it is not supported (write it before the struct)`); continue; }
      const parts = splitTop(decl.filter((x) => !op(x, ';')));
      const first = parts[0];
      const nameAt = declaratorName(first);
      if (nameAt < 0) { report(decl[0], `the struct '${sname}': a member expected`); continue; }
      const type = first.slice(0, nameAt);
      // (ap_uint<0> x;: no bits, left out, as AMD's ap_axis's side channels of width 0)
      if (type.length === 4 && /^ap_u?int$/.test(type[0].v) && op(type[1], '<') && type[2].v === '0' && op(type[3], '>')) continue;
      if (type.some((x) => op(x, '*') || op(x, '&'))) { report(first[nameAt], `the member '${first[nameAt].v}': a pointer in a struct is not possible in Silinx HLS`); continue; }
      for (const [i, p] of parts.entries()) {
        const d = i === 0 ? p.slice(nameAt) : p;
        if (d.some((x) => op(x, ':')) && !d.some((x) => op(x, '='))) { report(d[0], `the member '${d[0].v}': a bit field is not supported (write ap_uint<W>)`); continue; }
        const { name, dims, init } = declarator(d);
        if (!name) continue;
        const st = type.find((x) => x.t === 'id' && structs.has(x.v));
        out.push({ name: name.v, type: type.filter((x) => !(x.t === 'id' && (x.v === 'struct' || x.v === 'class'))), dims, struct: st ? structs.get(st.v) : null, init, loc: name });
      }
    }
  }
  // the methods' and constructors' functions where their struct is (the top function stays the file's last)
  for (const def of [...new Set(structs.values())].sort((a, b) => b.at - a.at)) {
    foldDefaultCtor(def);
    toks.splice(def.at, 0, ...methodFunctions(def, report));
  }
  return toks;
}

// ------------------------------------------------------------------ the functions with struct parameters or results
function signatures(toks, cx) {
  const { structs, sigs, structArgs, report } = cx;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (!(isId(t) && op(toks[k + 1], '(') && atTop(k))) continue;
    const close = closing(toks, k + 1);
    if (!(op(toks[close + 1], '{') || op(toks[close + 1], ';') || isId(toks[close + 1], 'const'))) continue;
    let r = k - 1;
    const head = [];
    while (r >= 0 && !STMT_START(toks[r])) head.unshift(toks[r--]);
    if (!head.length || head.some((x) => op(x, '=') || op(x, '('))) continue;
    const rs = head.find((x) => x.t === 'id' && structs.has(x.v));
    const params = splitTop(toks.slice(k + 2, close)).map(param);
    if (!rs && !params.some((p) => p?.S)) continue;
    if (rs && head.some((x) => op(x, '*') || op(x, '&'))) report(rs, `'${t.v}' returns a pointer or a reference to a struct: not possible in Silinx HLS`);
    sigs.set(t.v, { params, ret: rs ? structs.get(rs.v) : null });
    structArgs.set(t.v, [...params.filter((p) => p?.S && p.name).map((p) => ({ name: p.name, members: leaves(p.S).map((l) => `${p.name}${l.suffix}`), loc: p.loc })),
      ...(rs ? [{ name: 'return', members: leaves(structs.get(rs.v)).map((l) => `ap_ret${l.suffix}`), loc: t }] : [])]);
  }
  function atTop(k) { let d = 0; for (let i = 0; i < k; i++) { if (op(toks[i], '{')) d++; if (op(toks[i], '}')) d--; } return d === 0; }
  function param(p) {
    const nameAt = declaratorName(p);
    const st = p.find((x) => x.t === 'id' && structs.has(x.v));
    if (!st) return null;
    const { name, dims } = nameAt < 0 ? { name: null, dims: [] } : declarator(p.slice(nameAt));
    const kind = dims.length ? 'arr' : p.some((x) => op(x, '&')) ? 'ref' : p.some((x) => op(x, '*')) ? 'ptr' : 'val';
    return { name: name?.v ?? null, S: structs.get(st.v), kind, dims, constQ: p.some((x) => isId(x, 'const')), loc: name || st };
  }

}

// ------------------------------------------------------------------ the leaves of a struct
/** Its scalars and arrays, a nested struct's flattened: [{ suffix, type, dims }] (dims: the members' array sizes). */
const leaves = (S) => S.members.flatMap((m) => (m.struct ? leaves(m.struct).map((l) => ({ suffix: `_${m.name}${l.suffix}`, type: l.type, dims: [...m.dims, ...l.dims] })) : [{ suffix: `_${m.name}`, type: m.type, dims: m.dims }]));
const product = (dims) => (dims.length ? dims.flatMap((d, i) => [...(i ? [L(d[0], '*')] : []), L(d[0], '('), ...d, L(d[0], ')')]) : null);

/** A parameter's tokens for a leaf of its struct. */
function paramTokens(pa, l, name, t, cpp) {
  const ty = [...(pa.constQ ? [L(t, 'const', 'id')] : []), ...l.type.map((x) => ({ ...x }))];
  const dims = [...(pa.kind === 'arr' ? pa.dims : []), ...l.dims];
  const nm = L(t, `${name}${l.suffix}`, 'id');
  if (dims.length) return [...ty, nm, L(t, '['), ...product(dims), L(t, ']')];
  if (pa.kind === 'ref') return cpp ? [...ty, L(t, '&'), nm] : [...ty, L(t, '*'), nm];
  if (pa.kind === 'ptr') return [...ty, L(t, '*'), nm];
  return [...ty, nm];
}

/** A member's default value (int x = 3; in the struct) for each element, or null. */
function defaults(S, l, all) {
  const m = memberOf(S, l.suffix);
  if (!m?.init) return null;
  const n = all.length ? Number(constTokens(product(all))) : 1;
  return Array.from({ length: n }, () => m.init.map((x) => ({ ...x })));
}

function memberOf(S, suffix) {
  for (const m of S.members) {
    if (suffix === `_${m.name}`) return m;
    if (m.struct && suffix.startsWith(`_${m.name}_`)) return memberOf(m.struct, suffix.slice(m.name.length + 1));
  }
  return null;
}

/** The values of { … } for each leaf: Map(suffix -> [tokens] in the order of its elements), C's rules (nested or
 *  not, the missing zero). */
function initValues(S, dims, init, at, report) {
  const vals = new Map(leaves(S).map((l) => [l.suffix, []]));
  const num = (d) => { const v = constTokens(d); if (v === null) report(at, `'${at.v}': the size of its array must be a constant here`); return Number(v ?? 0n); };
  const tree = (ts) => (op(ts[0], '{') ? { list: splitTop(ts.slice(1, closing(ts, 0))).filter((x) => x.length).map(tree) } : { e: ts });
  // (a leaf { leaf: suffix }, an array { n, of }, a struct { S, pre })
  const arr = (ds, of) => (ds.length ? { n: num(ds[0]), of: arr(ds.slice(1), of) } : of);
  const memberType = (m, pre) => arr(m.dims, m.struct ? { S: m.struct, pre: `${pre}_${m.name}` } : { leaf: `${pre}_${m.name}` });
  function fill(ty, queue, z = false) {
    if (ty.leaf !== undefined) {
      let v = z ? null : queue.shift();
      while (v?.list) v = v.list[0];
      vals.get(ty.leaf).push(v?.e ?? [L(at, '0', 'num')]);
      return;
    }
    const subs = ty.n !== undefined ? Array.from({ length: ty.n }, () => ty.of) : ty.S.members.map((m) => memberType(m, ty.pre));
    if (!z && queue[0]?.list) {
      const q = queue.shift().list.slice();
      for (const sb of subs) fill(sb, q, !q.length);
      return;
    }
    for (const sb of subs) fill(sb, queue, z || !queue.length);
  }
  fill(arr(dims, { S, pre: '' }), [tree(init)]);
  return vals;
}

/** A chain said wrong: { bad, end } (its tokens skipped). */
function bad(ts, k) {
  let j = k + 1;
  for (;;) {
    if (op(ts[j], '[')) { j = closing(ts, j) + 1; continue; }
    if ((op(ts[j], '.') || op(ts[j], '->')) && isId(ts[j + 1])) { j += 2; continue; }
    if (op(ts[j], '(') && (op(ts[j - 2], '.') || op(ts[j - 2], '->'))) { j = closing(ts, j) + 1; continue; }
    return { bad: true, end: j };
  }
}

/** The index into the linearized array of the indices idx of an array of sizes dims (row-major). */
function lin(idx, dims, t) {
  if (!idx.length) return null;
  let r = [L(t, '('), ...idx[0], L(t, ')')];
  for (let n = 1; n < idx.length; n++) r = [L(t, '('), ...r, L(t, ')'), L(t, '*'), L(t, '('), ...dims[n], L(t, ')'), L(t, '+'), L(t, '('), ...idx[n], L(t, ')')];
  return r;
}

// ------------------------------------------------------------------ the uses
function uses(toks, cx) {
  const { structs, sigs, report, cpp } = cx;
  let fresh = 0;
  const scopes = [new Map()];
  const bind = (name, b) => scopes.at(-1).set(name, b);
  const look = (name) => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return scopes[i].get(name); return null; };
  let pendingScope = null, retOf = null, fnDepth = 0;
  const out = [];
  rewrite(toks, out, true);
  return out;

  /** The tokens rewritten into out (top: the file's, where functions are defined). */
  function rewrite(ts, dst, top) {
    for (let k = 0; k < ts.length; k++) {
      const t = ts[k];
      if (op(t, '{')) {
        scopes.push(pendingScope || new Map());
        if (pendingScope) fnDepth = scopes.length;
        pendingScope = null;
        dst.push(t);
        continue;
      }
      // a pragma naming a struct (port=, variable=): one per member, said once (core/c-pragma.js, #1684)
      if (t.t === 'pragma' && !t.v.of && pragmaPerMember(t, look, dst)) continue;
      if (op(t, '}')) { if (scopes.length === fnDepth) { fnDepth = 0; retOf = null; } scopes.pop(); dst.push(t); continue; }
      // a function's header: its struct parameters their members', a struct result parameters added
      if (top && isId(t) && sigs.has(t.v) && op(ts[k + 1], '(') && scopes.length === 1 && !STMT_START(ts[k - 1]) && !op(ts[k - 1], '=')) {
        const sg = sigs.get(t.v);
        const close = closing(ts, k + 1);
        const ps = splitTop(ts.slice(k + 2, close));
        const flat = [];
        const sc = new Map();
        ps.forEach((p, i) => {
          const pa = sg.params[i];
          if (!pa) { flat.push(p); return; }
          if (!pa.name) { flat.push(...leaves(pa.S).map((l) => paramTokens(pa, l, `ap_${fresh++}`, t, cpp))); return; }
          if (pa.kind === 'arr' && pa.dims.some((d) => !d.length)) report(pa.loc, `the parameter '${pa.name}': an array of structs needs its size`);
          for (const l of leaves(pa.S)) flat.push(paramTokens(pa, l, pa.name, t, cpp));
          sc.set(pa.name, { S: pa.S, prefix: pa.name, dims: pa.kind === 'arr' ? pa.dims : [], kind: pa.kind === 'ref' || pa.kind === 'ptr' ? (cpp && pa.kind === 'ref' ? 'ref' : 'ptr') : 'val' });
        });
        if (sg.ret) {
          const ret = cpp ? 'ref' : 'ptr';
          for (const l of leaves(sg.ret)) flat.push(paramTokens({ kind: ret === 'ref' ? 'ref' : 'ptr', dims: [] }, l, 'ap_ret', t, cpp));
          sc.set('ap_ret', { S: sg.ret, prefix: 'ap_ret', dims: [], kind: ret });
          // (its type: void)
          let r = dst.length - 1;
          while (r >= 0 && !STMT_START(dst[r])) r--;
          const head = dst.splice(r + 1);
          dst.push(...head.filter((x) => QUALS.has(x.v) && x.v !== 'const'), L(t, 'void', 'id'));
        }
        dst.push(t, L(t, '('));
        flat.forEach((p, i) => { if (i) dst.push(L(t, ',')); dst.push(...p); });
        if (!flat.length) dst.push(L(t, 'void', 'id'));
        dst.push(L(t, ')'));
        k = close;
        if (op(ts[k + 1], '{')) { pendingScope = sc; retOf = sg.ret ? { ...sc.get('ap_ret'), sub: '', idx: [] } : null; }
        continue;
      }
      // a declaration of struct variables
      if (STMT_START(dst.at(-1)) || (op(dst.at(-1), '(') && isId(dst.at(-2), 'for')) || afterHeader(dst)) {
        let j = k;
        while (isId(ts[j]) && QUALS.has(ts[j].v)) j++;
        // (S f(…): a function returning a struct, its header below)
        if (isId(ts[j]) && structs.has(ts[j].v) && isId(ts[j + 1]) && op(ts[j + 2], '(') && top && scopes.length === 1 && sigs.has(ts[j + 1].v)) { dst.push(...ts.slice(k, j + 1)); k = j; continue; }
        if (isId(ts[j]) && structs.has(ts[j].v) && isId(ts[j + 1])) {
          let e = j;
          while (ts[e] && !op(ts[e], ';')) e = op(ts[e], '(') || op(ts[e], '{') || op(ts[e], '[') ? closing(ts, e) + 1 : e + 1;
          declare(ts.slice(k, j), structs.get(ts[j].v), ts.slice(j + 1, e), dst, t);
          k = e;
          continue;
        }
        // a statement: a struct copied (x = y;), a struct returned
        if (isId(t, 'return') && retOf) {
          let e = k + 1;
          while (ts[e] && !op(ts[e], ';')) e = op(ts[e], '(') ? closing(ts, e) + 1 : e + 1;
          dst.push(L(t, '{'));
          assignFrom(retOf, ts.slice(k + 1, e), dst, t);
          dst.push(t, L(t, ';'), L(t, '}'));
          k = e;
          continue;
        }
        if (isId(t) && look(t.v)) {
          const p = path(ts, k);
          if (!p.bad && !p.leaf && op(ts[p.end], '=')) {
            let e = p.end + 1;
            while (ts[e] && !op(ts[e], ';')) e = op(ts[e], '(') ? closing(ts, e) + 1 : e + 1;
            dst.push(L(t, '{'));
            assignFrom(p, ts.slice(p.end + 1, e), dst, t);
            dst.push(L(t, '}'));
            k = e;
            continue;
          }
        }
      }
      // a call of a function with struct parameters: their members passed
      if (isId(t) && sigs.has(t.v) && op(ts[k + 1], '(') && !(top && scopes.length === 1)) {
        const sg = sigs.get(t.v);
        const close = closing(ts, k + 1);
        if (sg.ret) {
          report(t, `'${t.v}' returns a struct: call it as a statement, x = ${t.v}(…); or S x = ${t.v}(…);`);
          dst.push(L(t, '0', 'num'));
          k = bad(ts, close).end - 1;
          continue;
        }
        dst.push(t, L(t, '('), ...callArgs(sg, splitTop(ts.slice(k + 2, close)), t, null), L(t, ')'));
        k = close;
        continue;
      }
      // a member: its variable
      if (isId(t) && look(t.v) && !op(ts[k - 1], '.') && !op(ts[k - 1], '->')) {
        const p = path(ts, k);
        if (p.bad) { dst.push(L(t, '0', 'num')); k = p.end - 1; continue; }
        // v.m(…), v(…) (operator()): the method's function, v its last argument
        const call = p.method ? { m: p.method, open: p.end + 2 } : !p.leaf && op(ts[p.end], '(') && p.S.methods?.has('operator()') ? { m: p.S.methods.get('operator()'), open: p.end } : null;
        if (call) {
          const e = closing(ts, call.open);
          const args = ts.slice(call.open + 1, e);
          rewrite([L(t, call.m.fn, 'id'), L(t, '('), ...args, ...(args.length ? [L(t, ',')] : []), ...ts.slice(k, p.end), L(t, ')')], dst, false);
          k = e;
          continue;
        }
        if (!p.leaf) { report(t, `the struct '${t.v}' used as a value here: copy it (x = ${t.v};), pass it to a function or read its members`); dst.push(L(t, '0', 'num')); k = p.end - 1; continue; }
        dst.push(...leafRef(p, null, t));
        k = p.end - 1;
        continue;
      }
      dst.push(t);
    }
  }


  /** `S a, b[4] = { … }, c = d;`: each member's variable, their values. */
  function declare(quals, S, rest, dst, t) {
    for (const d of splitTop(rest)) {
      if (op(d[0], '*') || op(d[0], '&')) { report(d[0], `a pointer or a reference to a struct (${S.name}) as a variable is not possible in Silinx HLS: use the struct or an index`); continue; }
      const { name, dims, init, ctor } = declarator(d);
      if (!name) continue;
      // (a constructor: called after the members are declared)
      const open = d.indexOf(name) + 1;
      const args = ctor ? splitTop(d.slice(open + 1, closing(d, open))) : [];
      const c = ctor || !init ? S.ctors?.find((x) => splitTop(x.params).length === args.length) : null;
      if (ctor && !c) report(name, `'${name.v}': ${S.name} has no constructor of ${args.length} argument(s)`);
      const b = { S, prefix: name.v, dims, kind: 'val' };
      const isStatic = quals.some((x) => isId(x, 'static')) || scopes.length === 1;
      // the initial values: a list, or a struct copied
      const list = init && op(init[0], '{') ? initValues(S, dims, init, name, report) : null;
      for (const l of leaves(S)) {
        const all = [...dims, ...l.dims];
        dst.push(...quals.map((x) => ({ ...x })), ...l.type.map((x) => ({ ...x })), L(name, `${name.v}${l.suffix}`, 'id'));
        if (all.length) dst.push(L(name, '['), ...product(all), L(name, ']'));
        const vals = list?.get(l.suffix) ?? defaults(S, l, all);
        if (vals) {
          dst.push(L(name, '='));
          // (the values' own struct members rewritten: S v = {w.a, w.b};, #1703)
          if (all.length) { dst.push(L(name, '{')); vals.forEach((v, i) => { if (i) dst.push(L(name, ',')); rewrite(v, dst, false); }); dst.push(L(name, '}')); }
          else rewrite(vals[0], dst, false);
        }
        dst.push(L(name, ';'));
      }
      bind(name.v, b);
      if (c) {
        if (dims.length || isStatic) report(name, `'${name.v}': ${dims.length ? 'an array' : 'a static or global'} of a struct with a constructor is not supported yet (give its members their values in the struct)`);
        else rewrite([L(name, c.fn, 'id'), L(name, '('), ...args.flatMap((a, i) => [...(i ? [L(name, ',')] : []), ...a]), ...(args.length ? [L(name, ',')] : []), { ...name }, L(name, ')'), L(name, ';')], dst, false);
      }
      if (init && !list) {
        if (dims.length) report(name, `the array of structs '${name.v}': initialize it with { … }`);
        else assignFrom({ ...b, sub: '', idx: [] }, init, dst, t);
      }
    }
  }


  /** A struct value's members assigned from src: another struct (a variable, an element, a member) or a call of a
   *  function returning one. */
  function assignFrom(dstP, src, dst, t) {
    const call = isId(src[0]) && sigs.get(src[0].v)?.ret && op(src[1], '(') && closing(src, 1) === src.length - 1 ? src[0] : null;
    if (call) {
      const sg = sigs.get(call.v);
      if (sg.ret !== dstP.S) report(call, `'${call.v}' returns a ${sg.ret.name}, not a ${dstP.S.name}`);
      dst.push(call, L(t, '('), ...callArgs(sg, splitTop(src.slice(2, -1)), call, dstP), L(t, ')'), L(t, ';'));
      return;
    }
    const s = isId(src[0]) && look(src[0].v) ? path(src, 0) : null;
    if (s?.bad) return;
    if (!s || s.leaf || s.end !== src.length) { report(src[0] || t, `a ${dstP.S.name} is copied from another (a variable, an element of an array, a member) or from a call`); return; }
    if (s.S !== dstP.S) { report(src[0], `a ${s.S.name} copied to a ${dstP.S.name}`); return; }
    // (an index with a side effect, b[i++] = a[3]: computed once, before the members', #1685)
    const once = (p) => ({ ...p, idx: p.idx.map((x) => {
      if (!x.some((y) => op(y, '++') || op(y, '--') || (y.t === 'op' && /^([-+*/%&|^]|<<|>>)?=$/.test(y.v)))) return x;
      const v = L(t, `ap_c${fresh++}`, 'id');
      dst.push(L(t, 'int', 'id'), v, L(t, '='), L(t, '('), ...x, L(t, ')'), L(t, ';'));
      return [{ ...v }];
    }) });
    dstP = once(dstP);
    const s1 = once(s);
    for (const l of leaves(dstP.S)) {
      if (!l.dims.length) { dst.push(...leafRef(dstP, l, t), L(t, '='), ...leafRef(s1, l, t), L(t, ';')); continue; }
      // (a member array: element by element)
      const i = L(t, `ap_c${fresh++}`, 'id');
      dst.push(L(t, 'for', 'id'), L(t, '('), L(t, 'int', 'id'), i, L(t, '='), L(t, '0', 'num'), L(t, ';'), { ...i }, L(t, '<'), L(t, '('), ...product(l.dims), L(t, ')'), L(t, ';'), { ...i }, L(t, '++'), L(t, ')'),
        ...leafRef(dstP, l, t, i), L(t, '='), ...leafRef(s1, l, t, i), L(t, ';'));
    }
  }

  /** A call's arguments: a struct parameter's argument (a struct, &a struct) its members'; with `into`, the struct a
   *  result goes into. */
  function callArgs(sg, args, t, into) {
    const outArgs = [];
    const push = (a) => { if (outArgs.length) outArgs.push(L(t, ',')); outArgs.push(...a); };
    args.forEach((a, i) => {
      const pa = sg.params[i];
      if (!pa) { const r = []; rewrite(a, r, false); push(r); return; }
      const addr = op(a[0], '&');
      const src = addr ? a.slice(1) : a;
      const p = isId(src[0]) && look(src[0].v) ? path(src, 0) : null;
      if (p?.bad) { push([L(t, '0', 'num')]); return; }
      if (!p || p.leaf || p.end !== src.length || (p.S !== pa.S)) { report(a[0] || t, `the argument of '${pa.name ?? i + 1}': a ${pa.S.name} (a variable, an element of an array, a member)${pa.kind === 'ptr' ? ' by its address, &x' : ''}`); push([L(t, '0', 'num')]); return; }
      // (an array of structs passed to a pointer to structs: its members' arrays, #1684)
      if (pa.kind === 'ptr' && p.dims.length && !p.idx.length && !p.sub) { for (const l of leaves(pa.S)) push([L(t, `${p.prefix}${l.suffix}`, 'id')]); return; }
      if (pa.kind === 'arr') { if (p.idx.length || p.sub) report(a[0], `the argument of '${pa.name}': an array of structs, whole`); for (const l of leaves(pa.S)) push([L(t, `${p.prefix}${l.suffix}`, 'id')]); return; }
      for (const l of leaves(pa.S)) push(byRef(p, l, pa.kind === 'ptr' || (pa.kind === 'ref' && !cpp), t));
    });
    if (into) for (const l of leaves(sg.ret)) push(byRef(into, l, !cpp, t));
    return outArgs;
  }
  /** A leaf of a struct passed to a pointer (its address) or a reference (itself); an array: its name. */
  function byRef(p, l, addr, t) {
    if (l.dims.length) {
      if (p.idx.length || p.dims.length) report(t, 'a member array of an element of an array of structs passed to a function: not supported yet');
      return [L(t, `${p.prefix}${p.sub}${l.suffix}`, 'id')];
    }
    const r = leafRef(p, l, t);
    if (!addr) return r;
    if (op(r[0], '(') && op(r[1], '*')) return r.slice(2, -1);   // (a pointer's: itself)
    return [L(t, '&'), ...r];
  }

  /** The chain of a struct variable's uses from k: v, v[i], v.m, p->m, …: { S (the struct reached, or null at a
   *  leaf), leaf, prefix, sub (the members' suffix), idx (the indices given), dims, kind, end }. */
  function path(ts, k) {
    const b = look(ts[k].v);
    let S = b.S, sub = '', dims = b.dims.slice(), idx = [], j = k + 1, leaf = null, ldims = [];
    for (;;) {
      if (op(ts[j], '[')) {
        // (a pointer to structs indexed, #1684: its members' pointers indexed, core/c-pointer.js's arrays)
        if (b.kind === 'ptr' && !idx.length && !sub && !dims.length) dims = [[]];
        const e = closing(ts, j);
        const inner = [];
        rewrite(ts.slice(j + 1, e), inner, false);
        if (leaf ? idx.length >= dims.length + ldims.length : idx.length >= dims.length) break;
        idx.push(inner);
        j = e + 1;
        continue;
      }
      if (!leaf && (op(ts[j], '.') || op(ts[j], '->')) && isId(ts[j + 1])) {
        if (op(ts[j], '->') !== (b.kind === 'ptr' && !sub && !idx.length)) { if (op(ts[j], '->')) report(ts[j], `'->' on '${ts[k].v}', which is not a pointer to a struct: write '.'`); }
        if (idx.length < dims.length) { report(ts[j], `'${ts[k].v}' is an array of structs: index it before its member`); return bad(ts, k); }
        const m = S.members.find((x) => x.name === ts[j + 1].v);
        if (!m && S.methods?.has(ts[j + 1].v) && op(ts[j + 2], '(')) return { S, leaf: false, prefix: b.prefix, sub, idx, dims, kind: b.kind, end: j, method: S.methods.get(ts[j + 1].v) };
        if (!m) { report(ts[j + 1], `'${ts[j + 1].v}' is not a member of ${S.name}`); return bad(ts, k); }
        sub += `_${m.name}`;
        if (m.struct) { S = m.struct; dims = [...dims, ...m.dims]; }
        else { leaf = m; ldims = m.dims; S = null; }
        j += 2;
        // (a nested struct's member arrays: their sizes the outer's)
        continue;
      }
      break;
    }
    if (!leaf && S && sub && dims.length > b.dims.length && idx.length < dims.length) { /* (a nested struct array, its element still to come) */ }
    return { S, leaf: !!leaf, prefix: b.prefix, sub, idx, dims: leaf ? [...dims, ...ldims] : dims, kind: b.kind, end: j };
  }
  /** A leaf's tokens: its variable, indexed (the indices of the struct's arrays, then its own, i an index of the
   *  member array's elements in order). */
  function leafRef(p, l, t, i = null) {
    const name = `${p.prefix}${p.sub}${l ? l.suffix : ''}`;
    const dims = l ? [...p.dims, ...l.dims] : p.dims;
    const own = l ? l.dims : [];
    const idx = p.idx.slice();
    let index = null;
    if (dims.length) {
      if (i) {
        // (the struct's indices, then i over the member array's product)
        const outer = lin(idx, dims.slice(0, dims.length - own.length), t);
        index = outer ? [L(t, '('), ...outer, L(t, ')'), L(t, '*'), L(t, '('), ...product(own), L(t, ')'), L(t, '+'), { ...i }] : [{ ...i }];
      } else if (idx.length === dims.length) index = lin(idx, dims, t);
      else if (idx.length) report(t, `'${name}': an element of an array of structs, its member array indexed too (${name}[…])`);
    }
    const v = L(t, name, 'id');
    if (index) return [v, L(t, '['), ...index, L(t, ']')];
    if (p.kind === 'ptr' && !dims.length) return [L(t, '('), L(t, '*'), v, L(t, ')')];
    return [v];
  }
}

/** A pragma naming a struct (port=, variable=; look: its binding) pushed once per member, its name the member's (said
 *  once: of, dup); false when it names none. */
function pragmaPerMember(t, look, dst) {
  const key = ['port', 'variable'].find((x) => typeof t.v.args?.[x] === 'string' && look(t.v.args[x]));
  if (!key) return false;
  const nm = t.v.args[key], b = look(nm);
  leaves(b.S).forEach((l, i) => {
    const text = t.v.text.replace(new RegExp(`(${key}\\s*=\\s*)${nm}\\b`, 'i'), `$1${b.prefix}${l.suffix}`);
    dst.push({ ...t, v: { ...t.v, args: { ...t.v.args, [key]: `${b.prefix}${l.suffix}` }, text, of: nm, ...(i ? { dup: true } : {}) } });
  });
  return true;
}

/** Whether the tokens end with a control's header (if (…), for (…), while (…), else, do): a statement starts next (#1685). */
function afterHeader(ts) {
  const t = ts.at(-1);
  if (isId(t, 'else') || isId(t, 'do')) return true;
  if (!op(t, ')')) return false;
  let d = 0;
  for (let i = ts.length - 1; i >= 0; i--) {
    if (op(ts[i], ')')) d++;
    else if (op(ts[i], '(') && !--d) return isId(ts[i - 1], 'if') || isId(ts[i - 1], 'for') || isId(ts[i - 1], 'while');
  }
  return false;
}

/** Statements of a body: split at its ';' and after a '{ … }' that ends one. */
function splitStatements(ts) {
  const out = [[]];
  for (let k = 0; k < ts.length; k++) {
    const t = ts[k];
    if (op(t, '{') || op(t, '(') || op(t, '[')) { const e = closing(ts, k); out.at(-1).push(...ts.slice(k, e + 1)); k = e; if (op(t, '{') && !op(ts[k + 1], ';')) out.push([]); continue; }
    out.at(-1).push(t);
    if (op(t, ';')) out.push([]);
  }
  return out;
}
/** The index of a declarator's name in a declaration's first part: the id before its '[', '=', '(' or its end. */
function declaratorName(p) {
  let k = 0;
  for (; k < p.length; k++) if (op(p[k], '[') || op(p[k], '=') || op(p[k], '(') || op(p[k], '{') || op(p[k], ':')) break;
  // (a type's <…>: its name before them)
  for (let j = k - 1; j >= 0; j--) { if (isId(p[j]) && !QUALS.has(p[j].v)) return j > 0 || k === 1 ? j : -1; if (op(p[j], '>')) return -1; }
  return -1;
}
/** name, [dims], = init | { init } | (ctor args). */
function declarator(d) {
  let k = 0;
  while (d[k] && !isId(d[k])) k++;
  const name = d[k];
  const dims = [];
  let j = k + 1;
  while (op(d[j], '[')) { const e = closing(d, j); dims.push(d.slice(j + 1, e)); j = e + 1; }
  let init = null, ctor = false;
  if (op(d[j], '=')) init = d.slice(j + 1);
  else if (op(d[j], '{')) init = d.slice(j);
  else if (op(d[j], '(')) ctor = true;
  return { name, dims, init, ctor };
}
