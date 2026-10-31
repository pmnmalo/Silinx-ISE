// Silinx HLS C++ (#1590): a struct's member functions and constructors, as tokens (for core/c-struct.js). A method is a
// function of its struct's, its object a reference parameter added last: `int S::get() const` is
// `int S_get(const S &ap_this)`, its members `ap_this.m`, its calls of the other methods theirs with ap_this;
// `operator()` is S_call. A constructor is a function `void S_ctor<n>(…, S &ap_this)` whose initializer list assigns
// the members first; a default constructor of constants only (S() : a(0), b(1) {}) is the members' initial values.
// A destructor does nothing. A base class (#1964) is a member of its own, first, named by the class: lookupMember finds
// its members and methods through it, a call of its method passes it (core/c-struct.js's upcast), a constructor calls
// its constructor (the bases', then the members', in their order, as C++). Isomorphic ES module.
//
//   parseMethod(decl, sname, report) -> { name, fn, ret, params, isConst, ctor, inits, body } | null (a destructor)
//   methodFunctions(def) -> the tokens of its methods' and constructors' functions
//   foldDefaultCtor(def)   its default constructor of constants made its members' initial values
//   implicitCtor(def)      a default constructor made when a base's or a member's has to run
//   lookupMember(S, name) -> { via: [base members], member | method } | { ambiguous: true } | null
//   upcast(S, T) -> the suffix of S's base T in S ('' S itself), or null
import { closing, splitTop, constTokens } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });

/** A name in a struct: its own, or a base's (in two bases: ambiguous, as C++). */
export function lookupMember(S, name) {
  const member = S.members.find((m) => m.name === name);
  if (member) return { via: [], member };
  if (S.methods?.has(name)) return { via: [], method: S.methods.get(name) };
  const hits = S.members.filter((m) => m.base).map((b) => [b, lookupMember(b.struct, name)]).filter(([, r]) => r);
  if (hits.length > 1 || hits[0]?.[1].ambiguous) return { ambiguous: true };
  return hits.length ? { ...hits[0][1], via: [hits[0][0], ...hits[0][1].via] } : null;
}
export function upcast(S, T) {
  if (S === T) return '';
  for (const b of S.members.filter((m) => m.base)) {
    const r = upcast(b.struct, T);
    if (r !== null) return `_${b.name}${r}`;
  }
  return null;
}
/** The names of its data members, its bases' too. */
const dataNames = (def) => def.members.flatMap((m) => (m.base ? dataNames(m.struct) : [m.name]));
const hasDefaultCtor = (S) => S.ctors?.some((c) => !splitTop(c.params).length);

/** A member function, a constructor or a destructor declared in a struct (its body there, or null: defined later). */
export function parseMethod(decl, sname, report) {
  let k = 0;
  while (isId(decl[k]) && ['inline', 'virtual', 'explicit', 'constexpr'].includes(decl[k].v)) {
    if (decl[k].v === 'virtual') report(decl[k], `the struct '${sname}': a virtual function is not possible in hardware (Vitis HLS: no virtual functions)`);
    k++;
  }
  if (op(decl[k], '~')) return null;
  // its name: the id before the first '(' (operator(): its own)
  let n = k;
  while (decl[n] && !op(decl[n], '(')) n++;
  let nameTok = decl[n - 1], name = nameTok?.v, open = n;
  if (isId(decl[n - 1], 'operator')) {
    if (!op(decl[n + 1], ')') || !op(decl[n + 2], '(')) { report(decl[n - 1], `the struct '${sname}': only operator() is supported among its operators`); return null; }
    nameTok = decl[n - 1]; name = 'operator()'; open = n + 2;
  } else if (op(decl[n - 2], '~')) return null;
  else if (isId(decl[n - 2], 'operator')) { report(decl[n - 2], `the struct '${sname}': only operator() is supported among its operators`); return null; }
  const close = closing(decl, open);
  const ctor = name === sname && n - 1 === k;
  const ret = ctor ? [L(nameTok, 'void', 'id')] : decl.slice(k, name === 'operator()' ? n - 1 : n - 1);
  if (ret.some((x) => isId(x, 'static'))) { report(nameTok, `the struct '${sname}': a static member function is supported in a class of static members only`); return null; }
  const params = decl.slice(open + 1, close);
  let j = close + 1;
  let isConst = false;
  if (isId(decl[j], 'const')) { isConst = true; j++; }
  while (isId(decl[j], 'override') || isId(decl[j], 'final')) j++;
  // (a constructor's initializer list: a(x), b{y})
  const inits = [];
  if (ctor && op(decl[j], ':')) {
    j++;
    while (isId(decl[j]) && (op(decl[j + 1], '(') || op(decl[j + 1], '{'))) {
      const e = closing(decl, j + 1);
      inits.push({ name: decl[j], value: decl.slice(j + 2, e) });
      j = e + 1;
      if (op(decl[j], ',')) j++;
    }
  }
  const body = op(decl[j], '{') ? decl.slice(j + 1, closing(decl, j)) : null;
  return { name, fn: `${sname}_${name === 'operator()' ? 'call' : name}`, ret, params, isConst, ctor, inits, body, loc: nameTok };
}

/** A default constructor whose initializer list gives constants and whose body is empty: the members' initial values
 *  (so a static or an array of the struct starts with them). */
export function foldDefaultCtor(def) {
  if (def.members.some((m) => m.struct && hasDefaultCtor(m.struct))) return;
  def.ctors = def.ctors.filter((c) => {
    if (splitTop(c.params).length || (c.body && c.body.length) || !c.inits.every((i) => constTokens(i.value) !== null && def.members.some((m) => m.name === i.name.v && !m.struct && !m.dims.length))) return true;
    for (const i of c.inits) def.members.find((m) => m.name === i.name.v).init = i.value;
    return false;
  });
}

export function implicitCtor(def, at) {
  if (def.ctors.length || !def.members.some((m) => m.struct && hasDefaultCtor(m.struct))) return;
  def.ctors.push({ name: def.name, fn: `${def.name}_ctor0`, ret: [L(at, 'void', 'id')], params: [], isConst: false, ctor: true, inits: [], body: [], loc: at });
}

/** A constructor's initializations: its bases' and members', in their order (C++'s, whatever the list's). */
function ctorInits(m, def, fields, own, report) {
  const out = [];
  for (const i of m.inits) if (!def.members.some((x) => x.name === i.name.v)) report(i.name, `'${i.name.v}' is not a member of ${def.name}`);
  for (const mb of def.members) {
    const i = m.inits.find((x) => x.name.v === mb.name);
    const at = i?.name ?? m.loc;
    const self = [L(at, 'ap_this', 'id'), L(at, '.'), L(at, mb.name, 'id')];
    if (mb.struct && !mb.dims.length) {
      const args = i ? splitTop(i.value) : [];
      const c = mb.struct.ctors?.find((x) => splitTop(x.params).length === args.length);
      if (c) {
        const a = body(i?.value ?? [], fields, def, own);
        out.push(L(at, c.fn, 'id'), L(at, '('), ...a, ...(a.length ? [L(at, ',')] : []), ...self, L(at, ')'), L(at, ';'));
        continue;
      }
      if (!i && !mb.struct.ctors?.length) continue;
      if (mb.base || !i || args.length !== 1) { report(at, `'${mb.name}': ${mb.struct.name} has no constructor of ${args.length} argument(s)`); continue; }
    } else if (mb.struct && !i && hasDefaultCtor(mb.struct)) { report(at, `the member array '${mb.name}' of objects whose constructor is not of constants: not supported yet`); continue; }
    if (i) out.push(...self, L(at, '='), L(at, '('), ...body(i.value, fields, def, own), L(at, ')'), L(at, ';'));
  }
  return out;
}

/** The functions of a struct's methods and constructors (defined). */
export function methodFunctions(def, report) {
  const out = [];
  const fields = new Set(dataNames(def));
  for (const m of [...def.methods.values(), ...def.ctors]) {
    const t = m.loc;
    // (said: an empty body from here on, one error)
    if (!m.body) { report(m.loc, `'${m.name}' of '${def.name}' is declared but not defined`); m.body = isId(m.ret[0], 'void') && m.ret.length === 1 ? [] : [L(t, 'return', 'id'), L(t, '0', 'num'), L(t, ';')]; }
    const own = new Set(splitTop(m.params).map((p) => p.filter((x) => isId(x)).at(-1)?.v));
    const self = [...(m.isConst ? [L(t, 'const', 'id')] : []), L(t, def.name, 'id'), L(t, '&'), L(t, 'ap_this', 'id')];
    out.push(...m.ret, L(t, m.fn, 'id'), L(t, '('), ...m.params, ...(m.params.length ? [L(t, ',')] : []), ...self, L(t, ')'), L(t, '{'));
    if (m.ctor) out.push(...ctorInits(m, def, fields, own, report));
    out.push(...body(m.body, fields, def, own), L(t, '}'));
  }
  return out;
}
/** A method's body: its struct's members ap_this's, its calls of the other methods with ap_this. */
function body(ts, fields, def, own) {
  const out = [];
  const locals = new Set(own);
  for (let k = 0; k < ts.length; k++) {
    const t = ts[k];
    const after = op(ts[k - 1], '.') || op(ts[k - 1], '->') || op(ts[k - 1], '::');
    if (isId(t, 'this') && op(ts[k + 1], '->')) { out.push(L(t, 'ap_this', 'id'), L(t, '.')); k++; continue; }
    if (isId(t, 'this')) { out.push(L(t, 'ap_this', 'id')); continue; }
    if (op(t, '*') && isId(ts[k + 1], 'this')) { out.push(L(t, 'ap_this', 'id')); k++; continue; }
    // (B::f(…), B::m: a base's, even when hidden here)
    const base = isId(t) && op(ts[k + 1], '::') && isId(ts[k + 2]) ? lookupMember(def, t.v)?.member : null;
    if (base?.base) {
      const named = lookupMember(base.struct, ts[k + 2].v);
      if (named?.method && op(ts[k + 3], '(')) {
        const e = closing(ts, k + 3);
        const args = body(ts.slice(k + 4, e), fields, def, locals);
        if (!after) out.push(L(t, named.method.fn, 'id'), L(t, '('), ...args, ...(args.length ? [L(t, ',')] : []), L(t, 'ap_this', 'id'), L(t, ')'));
        else out.push(t, L(t, '.'), ts[k + 2], L(t, '('), ...args, L(t, ')'));
        k = e;
        continue;
      }
      out.push(...(after ? [] : [L(t, 'ap_this', 'id'), L(t, '.')]), t, L(t, '.'), ts[k + 2]);
      k += 2;
      continue;
    }
    // (a local of the same name hides the member: int a = …;)
    if (isId(t) && !after && fields.has(t.v) && isId(ts[k - 1]) && !['return', 'case', 'else'].includes(ts[k - 1].v) && (op(ts[k + 1], '=') || op(ts[k + 1], ';') || op(ts[k + 1], ',') || op(ts[k + 1], '['))) { locals.add(t.v); out.push(t); continue; }
    if (isId(t) && !after && !locals.has(t.v) && fields.has(t.v)) { out.push(L(t, 'ap_this', 'id'), L(t, '.'), t); continue; }
    const named = isId(t) && !after && op(ts[k + 1], '(') ? lookupMember(def, t.v)?.method : null;
    if (named) {
      const e = closing(ts, k + 1);
      const args = body(ts.slice(k + 2, e), fields, def, locals);
      out.push(L(t, named.fn, 'id'), L(t, '('), ...args, ...(args.length ? [L(t, ',')] : []), L(t, 'ap_this', 'id'), L(t, ')'));
      k = e;
      continue;
    }
    out.push(t);
  }
  return out;
}
