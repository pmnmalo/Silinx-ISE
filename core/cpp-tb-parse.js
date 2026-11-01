// Silinx HLS C++ (#2234): the parser of a test bench's library C++ (core/cpp-tb.js takes it out of the source): classes
// with std::string and std::map members and the functions over them, as a tree core/cpp-tb-run.js runs. Only what
// the C simulation can run with no static types: no base classes, no templates of its own, no division. What it does
// not read is reported, at its token. Isomorphic ES module.
//
//   parseClass(tokens, program, report)      a class's members and methods into program.classes
//   parseFunction(tokens, program, report)   a function with its body (free or Class::m) into the program
import { closing } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const WORDS = new Set(['void', 'bool', 'char', 'short', 'int', 'long', 'unsigned', 'signed', 'float', 'double', 'size_t', 'string', 'map', 'vector', 'ifstream', 'const', 'std']);
const BINARY = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '%']];

class Unread extends Error { constructor(tok, message) { super(message); this.tok = tok; } }

/** A cursor over tokens, with the program's class names (a declaration starts with a type). */
class Reader {
  constructor(toks, program) { this.toks = toks; this.k = 0; this.program = program; }
  get t() { return this.toks[this.k]; }
  at(v, d = 0) { const x = this.toks[this.k + d]; return !!x && (x.t === 'op' || x.t === 'id') && x.v === v; }
  eat(v) { if (this.at(v)) { this.k++; return true; } return false; }
  need(v) { if (!this.eat(v)) throw new Unread(this.t ?? this.toks.at(-1), `'${v}' expected, not '${this.t?.v ?? 'the end'}'`); }
  name() { if (!isId(this.t)) throw new Unread(this.t ?? this.toks.at(-1), `a name expected, not '${this.t?.v ?? 'the end'}'`); return this.toks[this.k++].v; }
  isType(d = 0) {
    const x = this.toks[this.k + d];
    return isId(x) && (WORDS.has(x.v) || this.program.classes.has(x.v) || this.program.classNames?.has(x.v));
  }
  /** A type: { name, args: [types], ptr, ref } (its qualifiers dropped, a nested name its last part). */
  type() {
    let name = '';
    const args = [];
    for (;;) {
      if (this.eat('const') || this.eat('std')) { this.eat('::'); continue; }
      if (!isId(this.t)) break;
      const w = this.t.v;
      if (name && !['unsigned', 'signed', 'long', 'short', 'int', 'char', 'double'].includes(w) && !this.at('::', -1)) break;
      name = this.at('::', -1) || !name ? w : `${name} ${w}`;
      this.k++;
      if (this.at('<') && (w === 'map' || w === 'vector')) {
        this.k++;
        do args.push(this.type()); while (this.eat(','));
        if (this.eat('>>')) throw new Unread(this.t, 'a map or vector of a map or vector: not supported');
        this.need('>');
      }
      if (this.eat('::')) continue;
      if (this.at('const')) this.k++;
    }
    if (!name) throw new Unread(this.t ?? this.toks.at(-1), 'a type expected');
    let ptr = 0, ref = false;
    for (;;) {
      if (this.eat('*')) ptr++;
      else if (this.eat('&')) ref = true;
      else if (!this.eat('const')) break;
    }
    return { name, args, ptr, ref };
  }
}

/** Parameters: [{ name, type, def }]. */
function params(r) {
  const out = [];
  r.need('(');
  if (r.eat(')')) return out;
  if (r.at('void') && r.at(')', 1)) { r.k += 2; return out; }
  do {
    const type = r.type();
    const name = isId(r.t) ? r.name() : '';
    if (r.eat('[') ) { r.need(']'); type.ptr++; }
    const def = r.eat('=') ? expr(r, 1) : null;
    out.push({ name, type, def });
  } while (r.eat(','));
  r.need(')');
  return out;
}

// ------------------------------------------------------------------ expressions
function expr(r, level = 0) {
  if (level === 0) {
    const a = expr(r, 1);
    const o = ['=', '+='].find((v) => r.at(v));
    if (o) { const tok = r.toks[r.k++]; return { kind: 'assign', op: o, a, b: expr(r, 0), tok }; }
    return a;
  }
  if (level === 1) {
    const c = binary(r, 0);
    if (!r.at('?')) return c;
    const tok = r.toks[r.k++];
    const a = expr(r, 0);
    r.need(':');
    return { kind: 'cond', c, a, b: expr(r, 1), tok };
  }
  throw new Error(`expr level ${level}`);
}
function binary(r, p) {
  if (p === BINARY.length) return unary(r);
  let a = binary(r, p + 1);
  while (BINARY[p].some((v) => op(r.t, v))) {
    const tok = r.toks[r.k++];
    a = { kind: 'bin', op: tok.v, a, b: binary(r, p + 1), tok };
  }
  if (op(r.t, '/')) throw new Unread(r.t, 'a division in a test bench\'s class: not supported');
  return a;
}
function unary(r) {
  const tok = r.t;
  for (const v of ['!', '-', '*', '&']) if (r.at(v)) { r.k++; return { kind: 'un', op: v, a: unary(r), tok }; }
  if (r.at('++') || r.at('--')) { r.k++; return { kind: 'inc', op: tok.v, pre: true, a: unary(r), tok }; }
  if (r.eat('new')) { const type = r.type(); return { kind: 'new', type, args: r.at('(') ? callArgs(r) : [], tok }; }
  // (a cast: (size_t)i, (T *)p)
  if (r.at('(') && r.isType(1)) {
    r.k++;
    const type = r.type();
    r.need(')');
    return { kind: 'cast', type, a: unary(r), tok };
  }
  return postfix(r);
}
function callArgs(r) {
  r.need('(');
  const out = [];
  if (r.eat(')')) return out;
  do out.push(expr(r, 1)); while (r.eat(','));
  r.need(')');
  return out;
}
function postfix(r) {
  let a = primary(r);
  for (;;) {
    const tok = r.t;
    if (r.at('.') || r.at('->')) {
      r.k++;
      const name = r.name();
      a = r.at('(') ? { kind: 'method', obj: a, name, args: callArgs(r), tok } : { kind: 'field', obj: a, name, tok };
    } else if (r.eat('[')) { const i = expr(r, 0); r.need(']'); a = { kind: 'index', a, i, tok }; }
    else if (r.at('++') || r.at('--')) { r.k++; a = { kind: 'inc', op: tok.v, pre: false, a, tok }; }
    else return a;
  }
}
function primary(r) {
  const tok = r.t;
  if (!tok) throw new Unread(r.toks.at(-1), 'an expression expected');
  if (r.eat('(')) { const a = expr(r, 0); r.need(')'); return a; }
  if (tok.t === 'num') { r.k++; return { kind: 'num', value: Number(String(tok.v).replace(/[uUlLfF]+$/, '')), tok }; }
  if (tok.t === 'str') { r.k++; return { kind: 'str', value: tok.v, tok }; }
  if (r.eat('std')) { r.need('::'); return primary(r); }
  if (r.at('this')) { r.k++; return { kind: 'this', tok }; }
  if (r.at('NULL')) { r.k++; return { kind: 'num', value: 0, tok }; }
  if (isId(tok)) {
    const name = r.name();
    return r.at('(') ? { kind: 'call', name, args: callArgs(r), tok } : { kind: 'id', name, tok };
  }
  throw new Unread(tok, `'${tok.v}' in a test bench's class: not supported`);
}

// ------------------------------------------------------------------ statements
function statement(r) {
  const tok = r.t;
  if (!tok) throw new Unread(r.toks.at(-1), 'a statement expected');
  if (r.at('{')) return block(r);
  if (r.eat(';')) return { kind: 'block', items: [], tok };
  if (r.eat('if')) {
    r.need('(');
    const c = expr(r, 0);
    r.need(')');
    const a = statement(r);
    return { kind: 'if', c, a, b: r.eat('else') ? statement(r) : null, tok };
  }
  if (r.eat('while')) { r.need('('); const c = expr(r, 0); r.need(')'); return { kind: 'for', init: null, c, step: null, body: statement(r), tok }; }
  if (r.eat('for')) {
    r.need('(');
    const init = r.at(';') ? null : isDecl(r) ? declaration(r) : { kind: 'expr', e: expr(r, 0), tok };
    if (!init || init.kind === 'expr') r.need(';');
    const c = r.at(';') ? null : expr(r, 0);
    r.need(';');
    const step = r.at(')') ? null : expr(r, 0);
    r.need(')');
    return { kind: 'for', init, c, step, body: statement(r), tok };
  }
  if (r.eat('return')) { const e = r.at(';') ? null : expr(r, 0); r.need(';'); return { kind: 'return', e, tok }; }
  if (r.eat('break')) { r.need(';'); return { kind: 'break', tok }; }
  if (r.eat('continue')) { r.need(';'); return { kind: 'continue', tok }; }
  if (r.eat('delete')) { const e = expr(r, 1); r.need(';'); return { kind: 'delete', e, tok }; }
  if (isDecl(r)) return declaration(r);
  const e = expr(r, 0);
  r.need(';');
  return { kind: 'expr', e, tok };
}
/** A declaration starts here: a type then a name (a type then '(' is a value: string("x")). */
function isDecl(r) {
  if (!r.isType()) return false;
  const k = r.k;
  try { r.type(); return isId(r.t); } catch { return false; } finally { r.k = k; }
}
function declaration(r) {
  const tok = r.t;
  const type = r.type();
  const items = [];
  do {
    const name = r.name();
    let init = null, args = null;
    if (r.eat('=')) init = expr(r, 1);
    else if (r.at('(')) args = callArgs(r);
    items.push({ name, init, args });
  } while (r.eat(','));
  r.need(';');
  return { kind: 'decl', type, items, tok };
}
function block(r) {
  const tok = r.t;
  r.need('{');
  const items = [];
  while (!r.at('}')) {
    if (!r.t) throw new Unread(r.toks.at(-1), `'}' expected`);
    if (r.t.t === 'pragma') { r.k++; continue; }
    items.push(statement(r));
  }
  r.k++;
  return { kind: 'block', items, tok };
}

// ------------------------------------------------------------------ the program
const guarded = (report, f) => { try { return f(); } catch (e) { if (!(e instanceof Unread)) throw e; report(e.tok, `a test bench's class: ${e.message}`); return null; } };
const addMethod = (cls, fn) => { if (!cls.methods.has(fn.name)) cls.methods.set(fn.name, []); const all = cls.methods.get(fn.name); const k = all.findIndex((f) => !f.body && f.params.length === fn.params.length); if (k >= 0) { fn.params = all[k].params.map((p, i) => ({ ...p, name: fn.params[i].name })); all[k] = fn; } else all.push(fn); };

/** The members of class X { … } (toks from `class`): nested classes too. */
export function parseClass(toks, program, report) {
  guarded(report, () => {
    const r = new Reader(toks, program);
    r.k = 1;
    const name = r.name();
    if (r.at(':')) throw new Unread(r.t, `the class '${name}': a base class is not supported`);
    const cls = program.classes.get(name) ?? { name, fields: [], methods: new Map() };
    program.classes.set(name, cls);
    r.need('{');
    while (!r.at('}')) {
      if (!r.t) throw new Unread(toks.at(-1), `'}' expected`);
      if ((r.at('public') || r.at('private') || r.at('protected')) && r.at(':', 1)) { r.k += 2; continue; }
      if (r.at('class') || r.at('struct')) {
        let e = r.k;
        while (toks[e] && !op(toks[e], '{')) e++;
        const c = closing(toks, e);
        parseClass(toks.slice(r.k, c + 1), program, report);
        r.k = c + 1;
        r.need(';');
        continue;
      }
      member(r, cls);
    }
  });
}
function member(r, cls) {
  r.eat('virtual');
  r.eat('inline');
  // a destructor, a constructor, a method, a field
  if (r.at('~')) { r.k++; r.name(); method(r, cls, '~', { name: 'void', args: [], ptr: 0, ref: false }); return; }
  if (r.at(cls.name) && r.at('(', 1)) { r.k++; method(r, cls, cls.name, null); return; }
  const type = r.type();
  if (r.eat('operator')) { const o = r.t.v; r.k++; method(r, cls, `operator${o}`, type); return; }
  const name = r.name();
  if (r.at('(')) { method(r, cls, name, type); return; }
  cls.fields.push({ name, type });
  while (r.eat(',')) cls.fields.push({ name: r.name(), type });
  r.need(';');
}
function method(r, cls, name, ret) {
  const ps = params(r);
  r.eat('const');
  if (r.at(':')) throw new Unread(r.t, `the class '${cls.name}': a constructor's initializer list is not supported`);
  const body = r.at('{') ? block(r) : null;
  if (!body) r.need(';');
  else r.eat(';');
  addMethod(cls, { name, ret, params: ps, body });
}

/** A function with its body: `Ret Class::m(…) { … }`, `Class::Class(…)`, `Class::~Class()`, `Ret f(…) { … }`. */
export function parseFunction(toks, program, report) {
  guarded(report, () => {
    const n = toks.findIndex((t) => op(t, '('));
    let name = toks[n - 1]?.v, cls = null;
    const dtor = op(toks[n - 2], '~');
    const q = dtor ? n - 3 : n - 2;
    if (op(toks[q], '::')) cls = toks[q - 1].v;
    const r = new Reader(toks, program);
    const ret = (cls && (dtor || name === cls)) ? null : new Reader(toks.slice(0, cls ? q - 1 : n - 1), program).type();
    r.k = n;
    const ps = params(r);
    r.eat('const');
    if (r.at(':')) throw new Unread(r.t, `'${name}': a constructor's initializer list is not supported`);
    const body = block(r);
    const fn = { name: dtor ? '~' : name, ret: ret ?? { name: 'void', args: [], ptr: 0, ref: false }, params: ps, body };
    if (cls) {
      if (!program.classes.has(cls)) throw new Unread(toks[0], `'${cls}::${name}': the class is not declared before it`);
      addMethod(program.classes.get(cls), fn);
    } else if (!program.functions.has(name) || !program.functions.get(name).body) program.functions.set(name, fn);
  });
}
/** A free function's declaration (its default arguments). */
export function parseDeclaration(toks, program, report) {
  guarded(report, () => {
    const n = toks.findIndex((t) => op(t, '('));
    if (n < 1) throw new Unread(toks[0], 'a declaration of a test bench\'s string or map: only inside a class or as a function');
    const name = toks[n - 1].v;
    const r = new Reader(toks, program);
    const ret = new Reader(toks.slice(0, n - 1), program).type();
    r.k = n;
    if (!program.functions.has(name)) program.functions.set(name, { name, ret, params: params(r), body: null });
  });
}
