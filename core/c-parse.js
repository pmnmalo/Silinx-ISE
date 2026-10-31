// Silinx HLS (docs/c-to-hdl.md, #1524): the parser of a C source into its syntax tree.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   parse(source, file) -> { file, items, pragmas, includes, errors }
//   parseExpression(text) -> Expr | null
// The parser never throws on its input: an error is recorded and the parser skips to the next ';' or '}'.
// Every node has loc { line, col }. The tree:
//   items:  Func | Var (a global) | Typedef
//   Func    { kind: 'func', name, ret: Type, params: [{ name, type, loc }], body: Block | null, static, loc }
//   Var     { kind: 'var', name, type, init: Expr | { kind: 'init', items: [Expr | init] } | null, static, const, loc }
//   Typedef { kind: 'typedef', name, type, loc }
//   Type    { kind: 'int', name, signed, bits | null, widthExpr?, ap?: true } | { kind: 'void' } |
//           { kind: 'float', name } (refused by the checks) | { kind: 'array', of, size: Expr | null } |
//           { kind: 'ptr', to } | { kind: 'struct', name } (refused) ; const / volatile flags on it
//   Stmt    block { items } | decl { vars } | expr { e } | if { cond, then, else } | for { init, cond, step, body } |
//           while { cond, body } | do { body, cond } | switch { e, body } | case { value } | default |
//           break | continue | return { e } | goto { label } | label { name, stmt } | empty | pragma { pragma }
//   Expr    num { value: BigInt, text, unsigned, long } | chr { value } | str { value } | id { name } |
//           unary { op, e } (- + ! ~ & * ++ --, prefix) | postfix { op, e } | binary { op, l, r } |
//           assign { op, l, r } | cond { c, a, b } | call { callee: Expr, args } | index { e, i } |
//           member { e, name, arrow } | cast { type, e } | sizeof { type | e } | comma { l, r }
import { lex, numText } from './c-lex.js';
import { cppTree } from './cpp-tree.js';
import { isCpp } from './cpp-lex.js';

// the type names of C and of stdint.h, as Silinx HLS knows them (docs/c-to-hdl.md: widths, signedness)
export const STDINT = {
  int8_t: [8, true], int16_t: [16, true], int32_t: [32, true], int64_t: [64, true],
  uint8_t: [8, false], uint16_t: [16, false], uint32_t: [32, false], uint64_t: [64, false],
  size_t: [64, false],
};
const BASE = new Set(['void', 'char', 'short', 'int', 'long', 'signed', 'unsigned', 'bool', '_Bool', 'float', 'double']);
const QUAL = new Set(['const', 'volatile', 'static', 'extern', 'inline', 'register', 'auto']);
const KEYWORDS = new Set([...BASE, ...QUAL, 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'return', 'goto', 'typedef', 'struct', 'union', 'enum', 'sizeof']);

// binary operators by precedence, lowest first (C)
const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);


/** The token tools of the parser: the position (S.p), the token tests, the errors and the recovery. */
function tokenTools(toks, file, errors) {
  const S = { p: 0 };

  const at = (v) => toks[S.p].v === v && (toks[S.p].t === 'op' || toks[S.p].t === 'id');
  // (sim: a statement only the C simulation compiles, #ifndef __SYNTHESIS__, core/c-lex.js, #1897)
  const loc = (t = toks[S.p]) => (t.sim ? { line: t.line, col: t.col, sim: true } : { line: t.line, col: t.col });
  class Stop extends Error {}
  const fail = (message, t = toks[S.p]) => { errors.push({ file, line: t.line, col: t.col, message, severity: 'error' }); throw new Stop(); };
  const expect = (v, what) => {
    if (!at(v)) fail(`'${v}' expected${what ? ` ${what}` : ''}${toks[S.p].t === 'eof' ? ' before the end of the file' : `, not '${show(toks[S.p])}'`}`);
    return toks[S.p++];
  };
  const show = (t) => (t.t === 'pragma' ? '#pragma' : t.t === 'str' ? `"${t.v}"` : String(t.v));
  // skip to the end of the statement or block where the error was
  const recover = () => {
    let depth = 0;
    while (toks[S.p].t !== 'eof') {
      const v = toks[S.p].t === 'op' ? toks[S.p].v : null;
      if (v === '{') depth++;
      if (v === '}') { if (!depth) { return; } depth--; if (!depth) { S.p++; return; } }
      if (v === ';' && !depth) { S.p++; return; }
      S.p++;
    }
  };

  return { toks, S, at, loc, fail, expect, show, recover, Stop };
}
/** The types, declarators and expressions of the parser. */
function exprParser(T, typedefs, cpp = false) {
  const { toks, S, at, loc, fail, expect, show } = T;
  // ---------------------------------------------------------- types
  const startsType = () => {
    const t = toks[S.p];
    if (t.t !== 'id') return false;
    return BASE.has(t.v) || QUAL.has(t.v) || typedefs.has(t.v) || t.v === 'ap_int' || t.v === 'ap_uint' || t.v === 'ap_fixed' || t.v === 'ap_ufixed' || t.v === 'struct' || t.v === 'union' || t.v === 'enum'
      || (cpp && t.v === 'stream' && toks[S.p + 1]?.v === '<');
  };
  // (a template's '>': a '>>' closing two of them gives its first half, C++11)
  const closeAngle = (what) => {
    if (at('>')) { S.p++; return; }
    if (at('>>')) { toks[S.p] = { ...toks[S.p], v: '>' }; return; }
    expect('>', what);
  };
  /** The declaration specifiers: { type, static, typedef } */
  function specifiers() {
    const t0 = toks[S.p];
    let isStatic = false, isTypedef = false, isConst = false, isVolatile = false;
    const words = [];
    let type = null;
    for (;;) {
      const t = toks[S.p];
      if (t.t !== 'id') break;
      if (t.v === 'static') { isStatic = true; S.p++; continue; }
      if (t.v === 'typedef') { isTypedef = true; S.p++; continue; }
      if (t.v === 'const') { isConst = true; S.p++; continue; }
      if (t.v === 'volatile') { isVolatile = true; S.p++; continue; }
      if (QUAL.has(t.v)) { S.p++; continue; }
      if (BASE.has(t.v)) { words.push(t.v); S.p++; continue; }
      // ap_fixed<W, I, Q, O, N> / ap_ufixed (core/c-fixed.js)
      if (!type && !words.length && (t.v === 'ap_fixed' || t.v === 'ap_ufixed')) {
        S.p++;
        expect('<', `after ${t.v}`);
        const w = ternary(true);
        expect(',', `after the width of ${t.v}`);
        const i = ternary(true);
        const mode = () => { if (at(',')) { S.p++; return toks[S.p].t === 'id' ? toks[S.p++].v : null; } return undefined; };
        const q = mode(), o = q === undefined ? undefined : mode();
        let n = null;
        if (o !== undefined && at(',')) { S.p++; n = ternary(true); }
        closeAngle(`after the parameters of ${t.v}`);
        type = { kind: 'int', name: t.v, signed: t.v === 'ap_fixed', bits: null, widthExpr: w, intExpr: i, q: q ?? 'AP_TRN', o: o ?? 'AP_WRAP', nExpr: n, ap: true, fixed: true };
        continue;
      }
      if (!type && !words.length && (t.v === 'ap_int' || t.v === 'ap_uint')) {
        S.p++;
        expect('<', `after ${t.v}`);
        const w = ternary(true);
        closeAngle(`after the width of ${t.v}`);
        type = { kind: 'int', name: t.v, signed: t.v === 'ap_int', bits: null, widthExpr: w, ap: true };
        continue;
      }
      if (!type && !words.length && (t.v === 'struct' || t.v === 'union' || t.v === 'enum')) {
        S.p++;
        const name = toks[S.p].t === 'id' ? toks[S.p++].v : '';
        if (at('{')) { let d = 0; do { if (at('{')) d++; if (at('}')) d--; S.p++; } while (d && toks[S.p].t !== 'eof'); }
        type = { kind: 'struct', name: `${t.v} ${name}`.trim() };
        continue;
      }
      if (!type && !words.length && typedefs.has(t.v)) { type = { ...typedefs.get(t.v) }; S.p++; continue; }
      // (C++: hls::stream<T> (its qualifier gone, core/cpp-lex.js), a FIFO, #1590)
      if (cpp && !type && !words.length && t.v === 'stream' && toks[S.p + 1]?.v === '<') {
        S.p += 2;
        const inner = declarator(specifiers().type, true).type;
        let depth = null;
        if (at(',')) { S.p++; depth = ternary(true); }
        closeAngle('after the type of the stream');
        type = { kind: 'stream', of: inner, name: 'hls::stream', depth };
        continue;
      }
      break;
    }
    if (!type) {
      if (!words.length) fail(`a type expected, not '${show(toks[S.p])}'`, toks[S.p]);
      type = baseType(words, t0);
    } else if (words.length) fail(`'${words.join(' ')}' cannot be added to ${type.name}`, t0);
    if (isConst) type.const = true;
    if (isVolatile) type.volatile = true;
    return { type, static: isStatic, typedef: isTypedef };
  }
  function baseType(words, t) {
    const n = (w) => words.filter((x) => x === w).length;
    const unsigned = n('unsigned') > 0;
    if (unsigned && n('signed')) fail("'signed' and 'unsigned' together", t);
    if (n('void')) return { kind: 'void', name: 'void' };
    if (n('float') || n('double')) return { kind: 'float', name: words.join(' ') };
    if (n('bool') || n('_Bool')) return { kind: 'int', name: 'bool', bits: 1, signed: false };
    if (n('char')) return { kind: 'int', name: words.join(' '), bits: 8, signed: !unsigned };
    if (n('short')) return { kind: 'int', name: words.join(' '), bits: 16, signed: !unsigned };
    if (n('long')) return { kind: 'int', name: words.join(' '), bits: 64, signed: !unsigned };
    return { kind: 'int', name: words.join(' '), bits: 32, signed: !unsigned };
  }
  /** A declarator: pointers, the name (null for an abstract one), arrays, function parameters. */
  function declarator(base, abstract = false) {
    let type = base;
    while (at('*')) {
      S.p++;
      type = { kind: 'ptr', to: type };
      while (at('const') || at('volatile') || at('restrict')) { if (toks[S.p].v === 'const') type.const = true; S.p++; }
    }
    // (C++: a reference, a pointer whose uses core/cpp-tree.js makes *x, #1590)
    if (cpp && at('&&')) fail('an rvalue reference (&&) is not supported');
    if (cpp && at('&')) { S.p++; type = { kind: 'ptr', to: type, ref: true }; }
    let name = null, nameTok = toks[S.p];
    if (at('(') && toks[S.p + 1]?.v === '*') fail('function pointers are not supported (Silinx HLS, as Vitis HLS: no function pointers)');
    if (toks[S.p].t === 'id' && !KEYWORDS.has(toks[S.p].v)) { nameTok = toks[S.p]; name = toks[S.p++].v; }
    else if (!abstract) fail(`a name expected, not '${show(toks[S.p])}'`);
    let params = null;
    if (at('(')) {
      S.p++;
      params = [];
      if (at('void') && toks[S.p + 1]?.v === ')') S.p++;
      while (!at(')')) {
        const pl = loc();
        const s = specifiers();
        const d = declarator(s.type, true);
        params.push({ name: d.name, type: d.type, loc: pl });
        if (!at(')')) expect(',', 'between parameters');
      }
      S.p++;
    }
    const dims = [];
    while (at('[')) {
      S.p++;
      dims.push(at(']') ? null : ternary());
      expect(']');
    }
    for (let k = dims.length - 1; k >= 0; k--) type = { kind: 'array', of: type, size: dims[k] };
    return { name, type, params, loc: loc(nameTok) };
  }

  // ---------------------------------------------------------- expressions
  function primary() {
    const t = toks[S.p];
    if (t.t === 'num') {
      S.p++;
      // (a hexadecimal constant's e / f are digits, 0xFFFF, #1757: not an exponent nor a float suffix)
      if (!/^0[xX]/.test(t.v) && /[.eE]|[fF]$/.test(t.v)) return { kind: 'float', text: t.v, loc: loc(t) };
      let value;
      try { value = BigInt(numText(t.v)); } catch { fail(`'${t.v}' is not a number`, t); }
      return { kind: 'num', value, text: t.v, unsigned: /[uU]/.test(t.v), long: /[lL]/.test(t.v), loc: loc(t) };
    }
    if (t.t === 'chr') { S.p++; return { kind: 'chr', value: BigInt(t.v), loc: loc(t) }; }
    if (t.t === 'str') { S.p++; let v = t.v; while (toks[S.p].t === 'str') v += toks[S.p++].v; return { kind: 'str', value: v, loc: loc(t) }; }
    if (t.t === 'id' && !KEYWORDS.has(t.v)) {
      S.p++;
      // ap_int<W>(x) / ap_uint<W>(x): a conversion, as a cast
      if ((t.v === 'ap_int' || t.v === 'ap_uint' || t.v === 'ap_fixed' || t.v === 'ap_ufixed') && at('<')) {
        S.p--;
        const s = specifiers();
        expect('(', `after ${t.v}<…>`);
        const e = assignment();
        expect(')');
        return { kind: 'cast', type: s.type, e, loc: loc(t) };
      }
      // (C++: T(x) of a type's name, a cast)
      if (cpp && typedefs.has(t.v) && at('(')) {
        S.p++;
        const e = assignment();
        expect(')');
        return { kind: 'cast', type: { ...typedefs.get(t.v) }, e, loc: loc(t) };
      }
      return { kind: 'id', name: t.v, loc: loc(t) };
    }
    if (at('(')) {
      S.p++;
      const e = expression();
      expect(')');
      return e;
    }
    if (t.t === 'eof') fail('an expression expected before the end of the file');
    fail(`an expression expected, not '${show(t)}'`);
  }
  function postfix() {
    let e = primary();
    for (;;) {
      const t = toks[S.p];
      if (at('(')) {
        S.p++;
        const args = [];
        while (!at(')')) { args.push(assignment()); if (!at(')')) expect(',', 'between arguments'); }
        S.p++;
        e = { kind: 'call', callee: e, args, loc: e.loc };
      } else if (at('[')) {
        S.p++;
        const i = expression();
        expect(']');
        e = { kind: 'index', e, i, loc: loc(t) };
      } else if (at('.') || at('->')) {
        S.p++;
        const n = toks[S.p];
        if (n.t !== 'id') fail(`a member name expected after '${t.v}'`);
        S.p++;
        e = { kind: 'member', e, name: n.v, arrow: t.v === '->', loc: loc(n) };
      } else if (at('++') || at('--')) {
        S.p++;
        e = { kind: 'postfix', op: t.v, e, loc: loc(t) };
      } else return e;
    }
  }
  function unary() {
    const t = toks[S.p];
    if (t.t === 'op' && ['-', '+', '!', '~', '&', '*', '++', '--'].includes(t.v)) { S.p++; return { kind: 'unary', op: t.v, e: unary(), loc: loc(t) }; }
    if (at('sizeof')) {
      S.p++;
      if (at('(') && (() => { S.p++; const s = startsType(); S.p--; return s; })()) {
        S.p++;
        const s = specifiers();
        const d = declarator(s.type, true);
        expect(')');
        return { kind: 'sizeof', type: d.type, loc: loc(t) };
      }
      return { kind: 'sizeof', e: unary(), loc: loc(t) };
    }
    if (at('(')) {
      S.p++;
      if (startsType()) {
        const from = S.p;
        const s = specifiers();
        // ((T(x) << 2): a parenthesized expression starting with C++'s cast T(x), not a C cast)
        if (cpp && at('(')) { S.p = from - 1; return postfix(); }
        const d = declarator(s.type, true);
        expect(')', 'after the type of a cast');
        return { kind: 'cast', type: d.type, e: unary(), loc: loc(t) };
      }
      S.p--;
    }
    return postfix();
  }
  // (noGt: inside ap_int<…>, where '>' closes the width)
  function binary(lv, noGt) {
    if (lv === LEVELS.length) return unary();
    let l = binary(lv + 1, noGt);
    while (toks[S.p].t === 'op' && LEVELS[lv].includes(toks[S.p].v) && !(noGt && (toks[S.p].v === '>' || toks[S.p].v === '>>'))) {
      const t = toks[S.p++];
      l = { kind: 'binary', op: t.v, l, r: binary(lv + 1, noGt), loc: loc(t) };
    }
    return l;
  }
  function ternary(noGt = false) {
    const c = binary(0, noGt);
    if (!at('?')) return c;
    const t = toks[S.p++];
    const a = expression();
    expect(':', "in a '? :' expression");
    return { kind: 'cond', c, a, b: ternary(noGt), loc: loc(t) };
  }
  function assignment() {
    const l = ternary();
    if (toks[S.p].t === 'op' && ASSIGN.has(toks[S.p].v)) {
      const t = toks[S.p++];
      return { kind: 'assign', op: t.v, l, r: assignment(), loc: loc(t) };
    }
    return l;
  }
  function expression() {
    let e = assignment();
    while (at(',')) { const t = toks[S.p++]; e = { kind: 'comma', l: e, r: assignment(), loc: loc(t) }; }
    return e;
  }
  function initializer() {
    if (!at('{')) return assignment();
    const l = loc();
    S.p++;
    const items = [];
    while (!at('}')) { items.push(initializer()); if (!at('}')) expect(',', 'between initial values'); }
    S.p++;
    return { kind: 'init', items, loc: l };
  }

  return { startsType, specifiers, declarator, ternary, assignment, expression, initializer };
}
/** The declarations and statements of the parser. */
function stmtParser(T, E, typedefs) {
  const { toks, S, at, loc, fail, expect, Stop, recover } = T;
  const { startsType, specifiers, declarator, ternary, expression, initializer } = E;
  // ---------------------------------------------------------- declarations and statements
  /** The declarations after the specifiers: Var[] (or Func with its body / Typedef). */
  function declarations(s, top) {
    const out = [];
    for (;;) {
      const d = declarator(s.type);
      if (s.typedef) {
        typedefs.set(d.name, { ...d.type, name: d.name });
        out.push({ kind: 'typedef', name: d.name, type: d.type, loc: d.loc });
      } else if (d.params) {
        const fn = { kind: 'func', name: d.name, ret: d.type, params: d.params, body: null, static: s.static, loc: d.loc };
        if (at('{')) {
          if (!top) fail('a function cannot be defined inside a function');
          fn.body = block();
          out.push(fn);
          return out;
        }
        out.push(fn);
      } else {
        const v = { kind: 'var', name: d.name, type: d.type, init: null, static: s.static, const: !!s.type.const, loc: d.loc };
        if (at('=')) { S.p++; v.init = initializer(); }
        out.push(v);
      }
      if (at(',')) { S.p++; continue; }
      expect(';', 'after a declaration');
      return out;
    }
  }
  function block() {
    const l = loc();
    expect('{');
    const items = [];
    while (!at('}') && toks[S.p].t !== 'eof') {
      const before = S.p;
      try { items.push(statement()); } catch (e) { if (!(e instanceof Stop)) throw e; recover(); if (S.p === before) S.p++; }
    }
    expect('}', 'to close the block');
    return { kind: 'block', items, loc: l };
  }
  function statement() {
    const t = toks[S.p];
    const l = loc(t);
    if (t.t === 'pragma') { S.p++; return { kind: 'pragma', pragma: t.v, loc: l }; }
    if (at('{')) return block();
    if (at(';')) { S.p++; return { kind: 'empty', loc: l }; }
    if (startsType()) {
      const s = specifiers();
      return { kind: 'decl', vars: declarations(s, false), loc: l };
    }
    if (t.t === 'id') switch (t.v) {
      case 'if': {
        S.p++; expect('(', "after 'if'"); const cond = expression(); expect(')');
        const then = statement();
        let els = null;
        if (at('else')) { S.p++; els = statement(); }
        return { kind: 'if', cond, then, else: els, loc: l };
      }
      case 'for': {
        S.p++; expect('(', "after 'for'");
        let init = null;
        if (at(';')) S.p++;
        else if (startsType()) { const s = specifiers(); init = { kind: 'decl', vars: declarations(s, false), loc: loc() }; }
        else { init = { kind: 'expr', e: expression(), loc: loc() }; expect(';', "in 'for'"); }
        const cond = at(';') ? null : expression();
        expect(';', "in 'for'");
        const step = at(')') ? null : expression();
        expect(')', "to close 'for'");
        return { kind: 'for', init, cond, step, body: statement(), loc: l };
      }
      case 'while': { S.p++; expect('(', "after 'while'"); const cond = expression(); expect(')'); return { kind: 'while', cond, body: statement(), loc: l }; }
      case 'do': {
        S.p++; const body = statement();
        expect('while', "after the body of 'do'"); expect('('); const cond = expression(); expect(')'); expect(';');
        return { kind: 'do', body, cond, loc: l };
      }
      case 'switch': { S.p++; expect('(', "after 'switch'"); const e = expression(); expect(')'); return { kind: 'switch', e, body: statement(), loc: l }; }
      case 'case': { S.p++; const value = ternary(); expect(':', "after 'case'"); return { kind: 'case', value, loc: l }; }
      case 'default': { S.p++; expect(':', "after 'default'"); return { kind: 'default', loc: l }; }
      case 'break': case 'continue': { S.p++; expect(';'); return { kind: t.v, loc: l }; }
      case 'return': { S.p++; const e = at(';') ? null : expression(); expect(';', "after 'return'"); return { kind: 'return', e, loc: l }; }
      case 'goto': { S.p++; const n = toks[S.p++]; expect(';'); return { kind: 'goto', label: n.v, loc: l }; }
      default:
        if (toks[S.p + 1]?.v === ':' && toks[S.p + 1].t === 'op' && !KEYWORDS.has(t.v)) { S.p += 2; return { kind: 'label', name: t.v, stmt: statement(), loc: l }; }
    }
    const e = expression();
    expect(';', 'after the statement');
    return { kind: 'expr', e, loc: l };
  }

  return { declarations, block, statement };
}
/** The expression of a text (a pragma's value: `c_dim * c_dim`, #1921), or null when it is not one expression. */
export function parseExpression(text) {
  const lx = lex(text, 'pragma.c', { cpp: false });
  const T = tokenTools(lx.tokens, 'pragma.c', []);
  try {
    const e = exprParser(T, new Map(), false).expression();
    return lx.errors.length || T.toks[T.S.p].t !== 'eof' ? null : e;
  } catch (e) {
    if (e instanceof T.Stop) return null;
    throw e;
  }
}
export function parse(source, file = 'input.c', opts = {}) {
  const lx = lex(source, file, opts);
  const errors = [...lx.errors];
  const typedefs = new Map(Object.entries(STDINT).map(([n, [bits, signed]]) => [n, { kind: 'int', name: n, bits, signed }]));
  typedefs.set('FILE', { kind: 'struct', name: 'FILE' });   // (stdio's, for the test bench's files, #1598)
  const T = tokenTools(lx.tokens, file, errors);
  const { toks, S, at, loc, recover, Stop } = T;
  const cpp = opts.cpp ?? isCpp(file);
  const E = exprParser(T, typedefs, cpp);
  const { specifiers } = E;
  const { declarations } = stmtParser(T, E, typedefs);
  // ---------------------------------------------------------- the file
  const items = [];
  const filePragmas = [];
  while (toks[S.p].t !== 'eof') {
    const before = S.p;
    try {
      if (toks[S.p].t === 'pragma') { filePragmas.push({ ...toks[S.p].v, loc: loc() }); S.p++; continue; }
      if (at(';')) { S.p++; continue; }
      const s = specifiers();
      if (at(';')) { S.p++; continue; }   // (a struct / enum declared alone)
      items.push(...declarations(s, true));
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      recover();
      if (at('}')) S.p++;
      if (S.p === before) S.p++;
    }
  }
  const ast = { file, items, pragmas: filePragmas, includes: lx.includes, errors, structArgs: lx.structArgs || new Map(), firs: lx.firs || new Map(), ffts: lx.ffts || new Map(), apFloats: lx.apFloats || [] };
  if (cpp) cppTree(ast, (n, message) => errors.push({ file, line: n?.loc?.line || 1, col: n?.loc?.col || 1, message, severity: 'error' }), lx.streams);
  return ast;
}
