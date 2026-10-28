// Silinx HLS C++ (#1590): templates, as tokens (before core/cpp-lex.js's other passes). A function template or a class
// template made once for each list of arguments it is used with: its parameters replaced, its name the template's and
// its arguments' (f<4, int> is f_4_int); an explicit specialization (template <> struct S<1> { … }) taking its
// arguments; a type parameter not given deduced from the call's arguments (the type they are declared with); a class
// of static members only (a class template's too) its functions and constants named by it (S::f is S_f). The
// instantiations are written where the template is last defined. In an instantiation a pragma's value may be a
// parameter (factor=N); `#pragma HLS if (cond) …` is kept when cond holds. Isomorphic ES module.
//
//   cppTemplates(tokens, report) -> tokens
//   constTokens(tokens) -> the value (BigInt) of a constant expression of numbers, or null
//   declType(tokens, name) -> the type tokens a name is declared with last in tokens, or null
import { readPragma } from './c-pragma.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const QUALS = new Set(['const', 'static', 'volatile', 'register', 'inline', 'typename', 'constexpr']);

/** The index of the token closing the bracket open at k ('(' ')', '{' '}', '[' ']'; '<' '>' with '>>' its two). */
export function closing(toks, k) {
  const o = toks[k].v, c = { '(': ')', '{': '}', '[': ']', '<': '>' }[o];
  let depth = 0;
  for (let j = k; j < toks.length; j++) {
    const t = toks[j];
    if (t.t !== 'op') continue;
    if (t.v === o) depth++;
    else if (t.v === c) depth--;
    else if (o === '<' && t.v === '>>') depth -= 2;
    else if (o === '<' && (t.v === '(' || t.v === '[')) { j = closing(toks, j); continue; }
    else if (o === '<' && (t.v === ';' || t.v === '{')) return -1;
    if (depth <= 0) return j;
  }
  return -1;
}
/** The tokens between k and the matching '>' of a '<' at k, split at its commas: [args, the index after '>']; a '>>'
 *  closing it split into two (its second the next token). */
function angleArgs(toks, k) {
  const end = closing(toks, k);
  if (end < 0) return null;
  const inner = toks.slice(k + 1, end);
  if (op(toks[end], '>>')) toks.splice(end, 1, { ...toks[end], v: '>' }, { ...toks[end], v: '>', col: toks[end].col + 1 });
  return [splitTop(inner), end + 1];
}
/** Tokens split at their commas outside brackets. */
export function splitTop(toks) {
  const out = [[]];
  for (let j = 0; j < toks.length; j++) {
    const t = toks[j];
    if (op(t, '(') || op(t, '[') || op(t, '{') || op(t, '<')) {
      const e = closing(toks, j);
      if (e > j) { out.at(-1).push(...toks.slice(j, e + 1)); j = e; continue; }
    }
    if (op(t, ',')) { out.push([]); continue; }
    out.at(-1).push(t);
  }
  return out.length === 1 && !out[0].length ? [] : out;
}

// ---------------------------------------------------------------- constant expressions
const PREC = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
const B = (x) => (x ? 1n : 0n);
const BIN = { '||': (a, b) => B(a || b), '&&': (a, b) => B(a && b), '|': (a, b) => a | b, '^': (a, b) => a ^ b, '&': (a, b) => a & b,
  '==': (a, b) => B(a === b), '!=': (a, b) => B(a !== b), '<': (a, b) => B(a < b), '>': (a, b) => B(a > b), '<=': (a, b) => B(a <= b),
  '>=': (a, b) => B(a >= b), '<<': (a, b) => a << b, '>>': (a, b) => a >> b, '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
  '/': (a, b) => (b ? a / b : null), '%': (a, b) => (b ? a % b : null) };
export function constTokens(toks) {
  let k = 0;
  const num = (t) => { try { return BigInt(String(t.v).replace(/[uUlL]+$/, '')); } catch { return null; } };
  const unary = () => {
    const t = toks[k++];
    if (!t) return null;
    if (t.t === 'num') return num(t);
    if (t.t === 'chr') return BigInt(t.v);
    if (op(t, '(')) { const v = cond(); if (!op(toks[k++], ')')) return null; return v; }
    if (op(t, '-')) { const v = unary(); return v === null ? null : -v; }
    if (op(t, '+')) return unary();
    if (op(t, '!')) { const v = unary(); return v === null ? null : B(!v); }
    if (op(t, '~')) { const v = unary(); return v === null ? null : ~v; }
    return null;
  };
  const binary = (min) => {
    let a = unary();
    for (;;) {
      const t = toks[k];
      const p = t?.t === 'op' ? PREC[t.v] : undefined;
      if (p === undefined || p < min || a === null) return a;
      k++;
      const b = binary(p + 1);
      a = b === null ? null : BIN[t.v](a, b);
    }
  };
  const cond = () => {
    const c = binary(1);
    if (!op(toks[k], '?')) return c;
    k++;
    const a = cond();
    if (!op(toks[k++], ':')) return null;
    const b = cond();
    return c === null ? null : c ? a : b;
  };
  const v = cond();
  return k === toks.length ? v : null;
}

// ---------------------------------------------------------------- declarations
/** The type a name is declared with last in toks (a parameter, a variable; `const` and `&` dropped), or null. */
export function declType(toks, name) {
  for (let i = toks.length - 1; i > 0; i--) {
    if (!isId(toks[i], name)) continue;
    const nx = toks[i + 1];
    if (!(op(nx, ',') || op(nx, ')') || op(nx, ';') || op(nx, '=') || op(nx, '[') || op(nx, ':'))) continue;
    const ty = [];
    let j = i - 1, depth = 0;
    for (; j >= 0; j--) {
      const t = toks[j];
      if (op(t, '>')) depth++;
      else if (op(t, '<')) { if (!depth) break; depth--; }
      else if (!depth && (op(t, '(') || op(t, ',') || op(t, ';') || op(t, '{') || op(t, '}') || t.t === 'pragma')) break;
      else if (!depth && !(t.t === 'id' || op(t, '&') || op(t, '*') || op(t, '::'))) { ty.length = 0; break; }
      ty.unshift(t);
    }
    // (a list of declarations: int a, b; b's type a's)
    if (!ty.length && op(toks[j], ',')) { const prev = toks.slice(0, j); for (let q = j - 1; q >= 0; q--) if (isId(toks[q]) && (op(toks[q + 1], ',') || op(toks[q + 1], '=') || op(toks[q + 1], '['))) return declType(prev.slice(0, q + 2).concat([{ t: 'op', v: ';' }]), toks[q].v); }
    const kept = ty.filter((t) => !(t.t === 'id' && QUALS.has(t.v)) && !op(t, '&'));
    if (kept.length && kept.some((t) => t.t === 'id')) return kept;
  }
  return null;
}
/** The type a typedef names (typedef T name;) in toks, or null. */
function typedefOf(toks, name) {
  for (let i = toks.length - 1; i > 0; i--) {
    if (!isId(toks[i], name) || !op(toks[i + 1], ';')) continue;
    let j = i - 1;
    while (j >= 0 && !op(toks[j], ';') && !op(toks[j], '{') && !op(toks[j], '}') && !isId(toks[j], 'typedef')) j--;
    if (isId(toks[j], 'typedef')) return toks.slice(j + 1, i);
  }
  return null;
}
/** The type of an argument: its first name's declared type (a literal: int), or null. */
function argType(arg, before) {
  if (arg.length === 1 && arg[0].t === 'num') return [{ ...arg[0], t: 'id', v: /[lL]{2}$/.test(arg[0].v) ? 'long long' : 'int' }];
  for (const t of arg) if (t.t === 'id') { const ty = declType(before, t.v); if (ty) return ty; }
  return null;
}
const mangle = (a) => (a.value !== undefined ? (a.value < 0n ? `m${-a.value}` : String(a.value))
  : a.type.map((t) => (op(t, '*') ? 'p' : String(t.v))).join('_').replace(/\W+/g, '_').replace(/_+$/, ''));

// ---------------------------------------------------------------- templates
/** A type parameter from the call: the argument of the first parameter declared with it. */
function deduce(tpl, pname, callArgs, before) {
  const d = tpl.primary;
  const params = splitTop(d.toks.slice(d.paren + 1, closing(d.toks, d.paren)));
  for (let i = 0; i < params.length && i < callArgs.length; i++) {
    const ty = params[i].slice(0, -1).filter((t) => !(t.t === 'id' && QUALS.has(t.v)) && !op(t, '&'));
    if (ty.length === 1 && isId(ty[0], pname)) return argType(callArgs[i], before);
  }
  return null;
}
/** An integer parameter from the call: the argument's type's (ap_ufixed<W2, IW2> &r given an ap_ufixed<16, 8>: W2
 *  is 16), a typedef's name read through it. */
function deduceValue(tpl, pname, callArgs, before) {
  const d = tpl.primary;
  const params = splitTop(d.toks.slice(d.paren + 1, closing(d.toks, d.paren)));
  for (let i = 0; i < params.length && i < callArgs.length; i++) {
    const ty = params[i].filter((t) => !(t.t === 'id' && QUALS.has(t.v)) && !op(t, '&'));
    const lt = ty.findIndex((t) => op(t, '<'));
    if (lt < 1) continue;
    const mine = splitTop(ty.slice(lt + 1, closing(ty, lt)));
    const k = mine.findIndex((m) => m.length === 1 && isId(m[0], pname));
    if (k < 0) continue;
    let at = argType(callArgs[i], before);
    // (a typedef's name: its type)
    for (let n = 0; at && at.length === 1 && n < 8; n++) at = typedefOf(before, at[0].v) || at;
    const alt = at ? at.findIndex((t) => op(t, '<')) : -1;
    if (alt < 1 || at[alt - 1].v !== ty[lt - 1].v) continue;
    const theirs = splitTop(at.slice(alt + 1, closing(at, alt)));
    if (theirs[k]) return theirs[k];
  }
  return null;
}
export function cppTemplates(input, report) {
  const templates = new Map();   // name -> { name, params, kind, primary, specs, at, insts, scope, loc }
  const classes = new Map();     // a class of static members (an instance's too): name -> Map(member -> its name)
  const work = [];
  let depth = 0, deep = false;
  // (the names made: an instance's, a member's; legal in VHDL, no '__', none of the source's)
  const used = new Set(input.filter((t) => t.t === 'id').map((t) => t.v));
  const fresh = (base) => { let n = base.replace(/_+/g, '_').replace(/_$/, ''); while (used.has(n)) n += '_t'; used.add(n); return n; };

  /** template <params>: [{ name, type: true | false, def: tokens }], the index after '>'. */
  const header = (toks, k) => {
    const r = angleArgs(toks, k);
    if (!r) { report(toks[k], "'template <…>' not closed"); return [[], toks.length]; }
    const params = r[0].map((p) => {
      const eq = p.findIndex((t) => op(t, '='));
      const head = eq < 0 ? p : p.slice(0, eq);
      const name = head.at(-1)?.v;
      return { name, type: isId(head[0], 'typename') || isId(head[0], 'class'), def: eq < 0 ? null : p.slice(eq + 1) };
    });
    return [params, r[1]];
  };
  /** A declaration from k: { end (its last token), kind: 'struct' | 'func', name, nameAt, args (a specialization's) }. */
  const declaration = (toks, k) => {
    if (isId(toks[k], 'struct') || isId(toks[k], 'class')) {
      const name = toks[k + 1]?.v;
      let j = k + 2, args = null;
      if (op(toks[j], '<')) { const r = angleArgs(toks, j); args = r[0]; j = r[1]; }
      while (toks[j] && !op(toks[j], '{') && !op(toks[j], ';')) j++;
      const close = op(toks[j], '{') ? closing(toks, j) : j;
      return { kind: 'struct', name, nameAt: k + 1, args, body: [j, close], end: op(toks[close + 1], ';') ? close + 1 : close };
    }
    let j = k;
    while (toks[j] && !op(toks[j], '(')) {
      if (op(toks[j], ';') || op(toks[j], '=') || op(toks[j], '{')) {
        // a variable (its initializer to its ';')
        while (toks[j] && !op(toks[j], ';')) j = op(toks[j], '{') || op(toks[j], '(') ? closing(toks, j) + 1 : j + 1;
        return { kind: 'var', end: j };
      }
      if (op(toks[j], '<') && j > k) { const e = closing(toks, j); if (e > 0) { j = e + 1; continue; } }
      j++;
    }
    if (!toks[j]) return { kind: 'var', end: toks.length - 1 };
    let nameAt = j - 1, args = null;
    if (op(toks[nameAt], '>')) {
      // f<1>(…): a function's explicit specialization
      let q = nameAt, d = 0;
      for (; q > k; q--) { if (op(toks[q], '>')) d++; if (op(toks[q], '<')) { d--; if (!d) break; } }
      args = splitTop(toks.slice(q + 1, nameAt));
      nameAt = q - 1;
    }
    const pClose = closing(toks, j);
    let e = pClose + 1;
    while (toks[e] && !op(toks[e], '{') && !op(toks[e], ';')) e++;
    return { kind: 'func', name: toks[nameAt]?.v, nameAt, args, defined: op(toks[e], '{'), end: op(toks[e], '{') ? closing(toks, e) : e };
  };
  const subst = (toks, env) => toks.map((t) => {
    if (t.t === 'id' && env.has(t.v)) return env.get(t.v).map((x) => ({ ...x, line: t.line, col: t.col, file: t.file }));
    if (t.t === 'pragma' && env.size) return [pragmaSubst(t, env)];
    return [t];
  }).flat();
  const pragmaSubst = (t, env) => {
    const val = (s) => { const e = env.get(s); return e && e.length === 1 ? String(e[0].v) : s; };
    const text = t.v.text.replace(/\b\w+\b/g, (w) => (env.has(w) ? env.get(w).map((x) => x.v).join(' ') : w));
    const args = Object.fromEntries(Object.entries(t.v.args).map(([a, v]) => [a, typeof v === 'string' ? val(v) : v]));
    return { ...t, v: { ...t.v, args, text } };
  };
  /** `#pragma HLS if (cond) rest`: the pragma rest when cond holds, else nothing. */
  const pragmaIf = (t) => {
    const m = /^\s*HLS\s+if\s*\(/i.exec(t.v.text);
    if (!m) return [t];
    let d = 1, j = m[0].length;
    for (; j < t.v.text.length && d; j++) { if (t.v.text[j] === '(') d++; if (t.v.text[j] === ')') d--; }
    const cond = t.v.text.slice(m[0].length, j - 1);
    const toks = (cond.match(/\d+|\w+|==|!=|<=|>=|&&|\|\||<<|>>|[-+*/%<>!~&|^()?:]/g) || []).map((v) => ({ t: /^\d/.test(v) ? 'num' : /^\w/.test(v) ? 'id' : 'op', v }));
    const v = constTokens(toks);
    if (v === null) { report(t, `#pragma HLS if (${cond}): its condition is not a constant`); return []; }
    if (!v) return [];
    const p = readPragma(`HLS ${t.v.text.slice(j).trim()}`);
    return p ? [{ ...t, v: p }] : [];
  };
  const instance = (tpl, given, callArgs, before, at) => {
    if (deep) return null;   // (too deep: said once)
    const vals = [];
    for (let i = 0; i < tpl.params.length; i++) {
      const p = tpl.params[i];
      let a = given[i];
      if (!a && !p.type && p.def) a = p.def;
      if (!a && p.type && callArgs && tpl.primary?.kind === 'func') a = deduce(tpl, p.name, callArgs, before);
      if (!a && !p.type && callArgs && tpl.primary?.kind === 'func') a = deduceValue(tpl, p.name, callArgs, before);
      if (!a && p.type && p.def) a = p.def;
      if (!a) { report(at, `the template '${tpl.name}': its parameter '${p.name}' is not given (write ${tpl.name}<…>)`); return null; }
      if (p.type) vals.push({ type: a });
      else {
        const v = constTokens(a);
        if (v === null) { report(at, `the template '${tpl.name}': its parameter '${p.name}' is not a constant (${a.map((x) => x.v).join(' ')})`); return null; }
        vals.push({ value: v });
      }
    }
    const key = vals.map(mangle).join('_');
    if (!tpl.insts.has(key)) {
      const name = fresh(`${tpl.name}_${key}`);
      tpl.insts.set(key, name);
      // (a class's at once: its members named before they are used; a function's when the file is read)
      if (tpl.kind === 'struct') make({ tpl, key, vals, name, at });
      else work.push({ tpl, key, vals, name, at });
    }
    return tpl.insts.get(key);
  };
  /** A class's members: its static functions, constants and types named by it, its member templates registered. */
  const classBody = (name, toks, env, at, out, shown = name) => {
    const members = new Map();
    const parts = [];
    for (let k = 0; k < toks.length;) {
      if ((isId(toks[k], 'public') || isId(toks[k], 'private') || isId(toks[k], 'protected')) && op(toks[k + 1], ':')) { k += 2; continue; }
      if (isId(toks[k], 'template')) {
        const [params, j] = header(toks, k + 1);
        const d = declaration(toks, j);
        parts.push({ template: params, toks: toks.slice(j, d.end + 1), d: { ...d, nameAt: d.nameAt - j, end: d.end - j } });
        members.set(d.name, fresh(`${name}_${d.name}`));
        k = d.end + 1;
        continue;
      }
      const d = declaration(toks, k);
      if (d.kind === 'func' && d.defined && toks.slice(k, d.nameAt).some((t) => isId(t, 'static'))) {
        parts.push({ toks: toks.slice(k, d.end + 1), d: { ...d, nameAt: d.nameAt - k } });
        members.set(d.name, fresh(`${name}_${d.name}`));
        k = d.end + 1;
        continue;
      }
      let e = k;
      while (toks[e] && !op(toks[e], ';')) e++;
      const decl = toks.slice(k, e + 1);
      const eq = decl.findIndex((t) => op(t, '='));
      const nm = isId(decl[0], 'typedef') ? decl.at(-2) : decl[(eq < 0 ? decl.length - 1 : eq) - 1];
      if (!(isId(decl[0], 'typedef') || (decl.some((t) => isId(t, 'static')) && eq > 0))) {
        report(toks[k] || at, `the class '${shown}': only static members are supported yet (a data member or a method: a struct, #1590)`);
        return false;
      }
      parts.push({ toks: decl, plain: true });
      members.set(nm.v, fresh(`${name}_${nm.v}`));
      k = e + 1;
    }
    classes.set(name, members);
    const scope = new Map(members);
    for (const p of parts) {
      const renamed = rename(p.toks, scope);
      if (p.template) { register(p.template, renamed, { ...p.d, name: members.get(p.d.name) }, env, out, scope); continue; }
      const own = renamed.filter((t) => !isId(t, 'static'));
      out.push(...expand(own, env, scope));
    }
    return true;
  };
  /** The names of a class's members, inside it, its own (a member's after '.' or '->' left as it is). */
  const rename = (toks, scope) => toks.map((t, i) => (t.t === 'id' && scope.has(t.v) && !op(toks[i - 1], '.') && !op(toks[i - 1], '->') && !op(toks[i - 1], '::') ? { ...t, v: scope.get(t.v) } : t));
  /** A template's declaration: registered, and the place its instantiations go. */
  const register = (params, toks, d, env, out, scope) => {
    const body = subst(toks, env);
    if (!params.length) {
      // an explicit specialization: its arguments' instance
      const tpl = templates.get(d.name);
      if (!tpl) { report(toks[d.nameAt] || toks[0], `a specialization of '${d.name}', which is not a template`); return; }
      const vals = (d.args || []).map((a, i) => (tpl.params[i]?.type ? { type: subst(a, env) } : { value: constTokens(subst(a, env)) }));
      tpl.specs.set(vals.map(mangle).join('_'), { kind: d.kind, toks: body, d });
      tpl.at = place(out);
      return;
    }
    let tpl = templates.get(d.name);
    if (!tpl) { tpl = { name: d.name, params, kind: d.kind, primary: null, specs: new Map(), at: null, insts: new Map(), scope }; templates.set(d.name, tpl); }
    // (a declaration only: its instances' prototypes here, if no definition comes)
    if (d.kind === 'func' && !d.defined) { if (!tpl.proto) tpl.proto = { toks: body, d, at: place(out) }; return; }
    tpl.params = params;
    const paren = body.findIndex((t, i) => i > d.nameAt && op(t, '('));
    tpl.primary = { kind: d.kind, toks: body, d, paren };
    tpl.at = place(out);
  };
  const place = (out) => { const ph = { place: [] }; out.push(ph); return ph; };

  function expand(input, env, scope) {
    if (++depth > 64) { if (!deep) report(input[0], 'templates instantiated too deep (a template using itself with no end?)'); deep = true; depth--; return []; }
    const toks = input.slice();
    const out = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (isId(t, 'template') && op(toks[k + 1], '<')) {
        const [params, j] = header(toks, k + 1);
        const d = declaration(toks, j);
        register(params, toks.slice(j, d.end + 1), { ...d, nameAt: d.nameAt - j, end: d.end - j }, env, out, scope);
        k = d.end;
        continue;
      }
      if (isId(t, 'template') || isId(t, 'typename')) continue;   // (S::template f<…>, typename S::T)
      if (t.t === 'pragma') { out.push(...pragmaIf(env.size ? pragmaSubst(t, env) : t)); continue; }
      if (t.t === 'id' && env.has(t.v)) { toks.splice(k, 1, ...subst([t], env)); k--; continue; }
      // a class of static members: struct S { static int f(…) { … } };
      if ((isId(t, 'struct') || isId(t, 'class')) && isId(toks[k + 1]) && op(toks[k + 2], '{') && !op(toks[k - 1], '(') && !isId(toks[k - 1], 'enum')) {
        const d = declaration(toks, k);
        const inner = toks.slice(d.body[0] + 1, d.body[1]);
        if (onlyStatic(inner)) { classBody(d.name, inner, env, t, out); k = d.end; continue; }
      }
      if (t.t === 'id' && scope.has(t.v) && !op(toks[k - 1], '.') && !op(toks[k - 1], '->')) { toks[k] = { ...t, v: scope.get(t.v) }; k--; continue; }
      // S::m: a class's member
      if (t.t === 'id' && classes.has(t.v) && op(toks[k + 1], '::') && isId(toks[k + 2])) {
        const m = classes.get(t.v).get(toks[k + 2].v);
        if (!m) { report(toks[k + 2], `'${toks[k + 2].v}' is not a member of '${t.v}'`); k += 2; continue; }
        toks.splice(k, 3, { ...toks[k + 2], v: m });
        k--;
        continue;
      }
      const tpl = t.t === 'id' ? templates.get(t.v) : null;
      if (tpl && (op(toks[k + 1], '<') || (op(toks[k + 1], '(') && tpl.kind === 'func'))) {
        let given = [], j = k + 1;
        if (op(toks[k + 1], '<')) {
          const r = angleArgs(toks, k + 1);
          if (!r) { out.push(t); continue; }
          given = r[0].map((a) => expand(a, env, scope).filter((x) => !x.place));
          j = r[1];
        }
        const callArgs = op(toks[j], '(') && tpl.kind === 'func' ? splitTop(toks.slice(j + 1, closing(toks, j))).map((a) => subst(a, env)) : null;
        const name = instance(tpl, given, callArgs, flat(out), t);
        // (said: the use is 0 from here on, one error)
        if (!name) { out.push({ ...t, t: 'num', v: '0' }); k = callArgs ? closing(toks, j) : j - 1; continue; }
        toks.splice(k, j - k, { ...t, v: name });
        if (tpl.kind === 'func') { out.push(toks[k]); continue; }
        k--;
        continue;
      }
      out.push(t);
    }
    depth--;
    return out;
  }
  const onlyStatic = (inner) => {
    // (a member that is not static, a data member or a method, keeps the struct as it is: said by the C checks)
    for (let k = 0; k < inner.length;) {
      if (isId(inner[k], 'template')) { const [, j] = header(inner, k + 1); k = declaration(inner, j).end + 1; continue; }
      if ((isId(inner[k], 'public') || isId(inner[k], 'private') || isId(inner[k], 'protected')) && op(inner[k + 1], ':')) { k += 2; continue; }
      const d = declaration(inner, k);
      const head = inner.slice(k, d.kind === 'func' ? d.nameAt : d.end);
      if (!(isId(inner[k], 'typedef') || head.some((t) => isId(t, 'static')))) return false;
      k = d.end + 1;
    }
    return true;
  };
  const flat = (xs) => xs.flatMap((x) => (x.place ? flat(x.place) : [x]));

  const out = expand(input, new Map(), new Map());
  // the instantiations (theirs too, as they ask for them)
  for (let w = 0; w < work.length; w++) make(work[w]);
  return flat(out);

  function make({ tpl, key, vals, name, at }) {
    const env = new Map(tpl.params.map((p, i) => [p.name, vals[i].type ?? [{ t: 'num', v: String(vals[i].value) }]]));
    const spec = tpl.specs.get(key);
    const decl = spec || tpl.primary;
    if (!decl && tpl.proto) {
      // (its prototype: the call's function declared but not defined, said by the checks)
      const toks = tpl.proto.toks.slice();
      toks[tpl.proto.d.nameAt] = { ...toks[tpl.proto.d.nameAt], v: name };
      tpl.proto.at.place.push(...expand(toks, env, tpl.scope));
      return;
    }
    if (!decl || !tpl.at) { report(at, `the template '${tpl.name}' is declared but not defined`); return; }
    if (decl.kind === 'struct') {
      const toks = subst(decl.toks, spec ? new Map() : env);
      const open = toks.findIndex((x) => op(x, '{'));
      const inner = toks.slice(open + 1, closing(toks, open));
      if (!onlyStatic(inner)) {
        // (a class of data members and methods: a struct named by the instance, core/c-struct.js's; its own name, in
        // its constructors, the instance's)
        const own = inner.map((x, i) => (isId(x, tpl.name) && !op(inner[i + 1], '<') ? { ...x, v: name } : x));
        const t0 = toks[open];
        tpl.at.place.push(...expand([{ ...t0, t: 'id', v: 'struct' }, { ...t0, t: 'id', v: name }, { ...t0 }, ...own, { ...t0, v: '}' }, { ...t0, v: ';' }], spec ? new Map() : env, tpl.scope));
        return;
      }
      classBody(name, inner, spec ? new Map() : env, at, tpl.at.place, tpl.name);
      return;
    }
    const toks = decl.toks.slice();
    toks[decl.d.nameAt] = { ...toks[decl.d.nameAt], v: name };
    if (spec) {
      // (f<1>(…) { … }: its arguments dropped)
      const q = toks.findIndex((x, i) => i > decl.d.nameAt && op(x, '<'));
      if (q === decl.d.nameAt + 1) toks.splice(q, closing(toks, q) - q + 1);
    }
    tpl.at.place.push(...expand(toks, spec ? new Map() : env, tpl.scope));
  }
}
