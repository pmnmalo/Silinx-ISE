// Names and scopes of one HDL source (VHDL or Verilog), from its tokens: every identifier of the
// file with the declaration it refers to, resolved through the scopes of the language the way the
// front ends see them (design units, processes, subprograms, blocks, loops, generate statements,
// record fields, port / generic maps). Comments and strings are not tokens, so they never count.
// Used to rename a name everywhere it means the same object (core/rename.js) and by the quick
// fixes of the editor (core/quickfix.js).
//
//   analyze(text, lang) -> { lang, tokens, occs, symbols, scopes, file, scopeAt(i) }
//     tokens: { k: 'id'|'kw'|'op'|'lit'|'eof', v, key, line, col, len, off, lt (the lexer's type) }
//     occs:   every identifier as written: { i (token index), line, col, len, name, key, sym, decl,
//             scope, ext } — sym: the symbol it refers to; null when it is not declared in this
//             file (a library name, a predefined attribute, a misspelt name…); a formal of a port
//             or generic map of a unit of another file has ext = { unit, key } instead
//     symbols: { key, name, kind, scope, occs, owner (the scope it opens: entity, module,
//              component, process…), type (VHDL: its type as written), vtype (Verilog: net, range,
//              signed as written), mode (direction of a port) }
//     scopes:  every construct, in source order: { kind, outer (lexical), parent (where names are
//              looked up next), syms, sym (the label / name of the construct), closer (the word
//              that ends it), tok (its first token), end (the token of its end) }
//
// Every construct that an `end …` closes is a scope (also `if`, `case`, `begin`): a scope without
// declarations is transparent, and the open scopes at a token tell what is not closed yet (the
// quick fix of a missing `end if` / `endcase` / `endmodule`).
//
// Isomorphic module (browser + Node).

import { lex } from './vhdl/lexer.js';
import { tokenize } from './verilog/lexer.js';
import { mountVhdlScopes } from './scopes-vhdl.js';
import { lineStarts, isKw, isOp } from './util.js';


class Scope {
  constructor(kind, outer, parent, tok, closer = null) {
    Object.assign(this, { kind, outer, parent, tok, closer, syms: new Map(), sym: null, end: null, imports: [] });
  }
}

/** Analyse a source: its identifiers, symbols and scopes. */
export function analyze(text, lang) {
  return lang === 'verilog' ? analyzeVerilog(text) : analyzeVhdl(text);
}

// ------------------------------------------------------------------ common bookkeeping
function makeCtx(text, tokens) {
  const ls = lineStarts(text);
  for (const t of tokens) t.off = ls[t.line - 1] + t.col - 1;
  const file = new Scope('file', null, null, 0);
  const fields = new Scope('fields', null, null, 0);   // record / struct fields, reached after '.'
  const occs = [], symbols = [], occAt = new Map(), tokScope = [], scopes = [];
  const ctx = {
    text, tokens, file, fields, occs, symbols, occAt, tokScope, scopes,
    declare(scope, i, kind, extra = {}) {
      const t = tokens[i];
      let s = scope.syms.get(t.key);
      // a package body completes its package: the same subprograms and constants
      if (!s && scope.merge) s = scope.parent.syms.get(t.key);
      if (!s) {
        s = { key: t.key, name: t.v, kind, scope, occs: [], ...extra };
        scope.syms.set(t.key, s);
        symbols.push(s);
      }
      ctx.occ(i, s, true, scope);
      return s;
    },
    occ(i, sym, decl, scope, ext = null) {
      const t = tokens[i];
      if (occAt.has(i)) return occAt.get(i);
      const o = { i, line: t.line, col: t.col, len: t.len, name: t.v, key: t.key, sym, decl, scope, ext, ref: !sym && !ext && scope !== null };
      occAt.set(i, o);
      occs.push(o);
      if (sym) sym.occs.push(o);
      return o;
    },
    // an identifier that is not resolved (a selected name, an attribute, a named association)
    loose(i) { return ctx.occ(i, null, false, null); },
    lookup(scope, key) {
      for (let s = scope; s; s = s.parent) {
        if (s.syms.has(key)) return s.syms.get(key);
        for (const im of s.imports) if (im.syms.has(key)) return im.syms.get(key);
      }
      return null;
    },
    finish() {
      for (const o of occs) {
        if (!o.ref) continue;
        const s = ctx.lookup(o.scope, o.key);
        if (s) { o.sym = s; s.occs.push(o); }
      }
      occs.sort((a, b) => a.i - b.i);
      for (const s of symbols) s.occs.sort((a, b) => a.i - b.i);
      return {
        tokens, occs, symbols, file, fields, scopes,
        occAt: i => occAt.get(i) || null,
        scopeAt: i => tokScope[Math.min(i, tokScope.length - 1)] || file,
        /** The symbol a name means at token i (null: not declared there). */
        lookupAt: (i, key) => ctx.lookup(tokScope[Math.min(i, tokScope.length - 1)] || file, key),
        /** The identifier occurrence at a 1-based line / column (on the name or just after it). */
        occAtPos(line, col) {
          let best = null;
          for (const o of occs) if (o.line === line && col >= o.col && col <= o.col + o.len) { best = o; if (col < o.col + o.len) break; }
          return best;
        },
        /** Index of the first token at or after a 1-based line / column. */
        tokenAtPos(line, col) {
          for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.line > line || (t.line === line && t.col + Math.max(t.len, 1) > col)) return i;
          }
          return tokens.length - 1;
        },
      };
    },
  };
  return ctx;
}


// Index of the ')' / ']' / '}' that closes the bracket at i.
function matching(tokens, i) {
  const open = tokens[i].v, close = { '(': ')', '[': ']', '{': '}' }[open];
  let d = 0;
  for (let j = i; j < tokens.length; j++) {
    if (isOp(tokens[j], open)) d++;
    else if (isOp(tokens[j], close) && --d === 0) return j;
  }
  return tokens.length - 1;
}

// ------------------------------------------------------------------ VHDL
const VHDL_END_WORDS = new Set(['if', 'case', 'loop', 'process', 'generate', 'entity', 'architecture', 'package', 'body',
  'component', 'record', 'units', 'function', 'procedure', 'block', 'for', 'protected', 'configuration', 'postponed', 'context']);
const VHDL_STMT_AFTER = new Set(['begin', 'then', 'else', 'loop', 'generate', 'is']);

function vhdlTokens(text) {
  const { tokens } = lex(text);
  return tokens.map(t => {
    if (t.type === 'id' && !t.extended) { const v = String(t.raw ?? t.value); return { k: 'id', v, key: v.toLowerCase(), line: t.line, col: t.col, len: v.length }; }
    const k = t.type === 'kw' ? 'kw' : t.type === 'op' ? 'op' : t.type === 'eof' ? 'eof' : 'lit';
    return { k, v: k === 'kw' ? String(t.value).toLowerCase() : t.value, key: null, line: t.line, col: t.col, len: k === 'kw' ? String(t.value).length : 0, num: t.type === 'int' || t.type === 'real', lt: t.type };
  });
}

function analyzeVhdl(text) {
  const tokens = vhdlTokens(text);
  const C = makeCtx(text, tokens);
  const { file, fields } = C;
  let cur = file;
  const parens = [];         // { mode: 'plain'|'list'|'assoc'|'enum', … }
  let pendingParen = null;   // what the next '(' opens
  let decl = null;           // signal / variable / constant / file declaration: { kind, state, depth, syms }
  let pendingLabel = null;   // a label waiting for the construct it names
  let inst = null;           // an instance statement: { unit: { scope, key } }
  let uses = [];             // packages of this file named by use clauses, for the next design unit
  // a scope opened, a design unit's scope, a declaration's type (scopes-vhdl.js)
  const { open, unitScope, typeOf } = mountVhdlScopes({
    text, tokens, C, Scope, cur: () => cur, setCur: (v) => { cur = v; }, pendingLabel: () => pendingLabel,
    setPendingLabel: (v) => { pendingLabel = v; }, uses: () => uses, setUses: (v) => { uses = v; }
  });

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    C.tokScope[i] = cur;
    if (t.k === 'eof') break;
    const p = tokens[i - 1], n = tokens[i + 1];
    const top = parens[parens.length - 1];
    const elemStart = top?.elemStart;
    if (top) top.elemStart = false;

    if (t.k === 'op') {
      switch (t.v) {
        case '(':
          parens.push(pendingParen ? { ...pendingParen, elemStart: true, state: 'names', syms: [] } : { mode: 'plain', elemStart: true });
          pendingParen = null;
          break;
        case ')':
          if (top?.mode === 'list') typeOf(top, i);
          parens.pop();
          if (decl && parens.length < decl.depth) decl = null;
          break;
        case ',':
          if (top) top.elemStart = true;
          break;
        case ';':
          if (top?.mode === 'list') { typeOf(top, i); top.state = 'names'; top.elemStart = true; break; }
          if (parens.length) break;
          if (decl) { typeOf(decl, i); decl = null; }
          inst = null; pendingParen = null; pendingLabel = null;
          if (cur.specOnly) { cur.end = i; cur = cur.outer; }
          break;
        case ':':
          if (top?.mode === 'list' && top.state === 'names') { top.state = 'type'; top.typeStart = i + 1; }
          else if (decl && decl.state === 'names' && parens.length === decl.depth) { decl.state = 'type'; decl.typeStart = i + 1; }
          break;
        case ':=':
          if (top?.mode === 'list' && top.state === 'type' && top.typeEnd == null) top.typeEnd = i;
          else if (decl && decl.state === 'type' && parens.length === decl.depth && decl.typeEnd == null) decl.typeEnd = i;
          break;
      }
      continue;
    }

    if (t.k === 'kw') {
      const afterEnd = isKw(p, 'end');
      switch (t.v) {
        case 'end': {
          const s = cur;
          if (s !== file) { s.end = i; cur = s.outer; }
          let j = i + 1;
          while (tokens[j].k === 'kw' && VHDL_END_WORDS.has(tokens[j].v)) C.tokScope[j++] = cur;
          if (tokens[j].k === 'id') {
            C.tokScope[j] = cur;
            if (s.sym && tokens[j].key === s.sym.key) C.occ(j, s.sym, false, cur);
            else C.occ(j, null, false, cur);
            i = j;
          } else i = j - 1;
          pendingLabel = null; decl = null;
          continue;
        }
        case 'entity':
          if (isOp(p, ':')) {
            // u1 : entity work.X(arch) port map (…)
            let j = i + 1;
            if (n?.k === 'id' && isOp(tokens[i + 2], '.') && tokens[i + 3]?.k === 'id') { C.loose(i + 1); j = i + 3; }
            if (tokens[j]?.k === 'id') {
              const u = file.syms.get(tokens[j].key);
              const unit = u && u.kind === 'entity' ? u : null;
              C.occ(j, unit, false, unit ? cur : null);
              inst = { unit: { scope: unit?.owner || null, key: tokens[j].key } };
              for (let k = i + 1; k <= j; k++) C.tokScope[k] = cur;
              i = j;
            }
          } else if (!afterEnd && n?.k === 'id' && isKw(tokens[i + 2], 'is')) {
            const s = C.declare(file, i + 1, 'entity');
            open('entity', i, { sym: s, parent: file });
            unitScope();
            C.tokScope[i + 1] = cur;
            i++;
          }
          continue;
        case 'architecture':
          if (!afterEnd && n?.k === 'id' && isKw(tokens[i + 2], 'of') && tokens[i + 3]?.k === 'id') {
            const a = C.declare(file, i + 1, 'architecture');
            const e = file.syms.get(tokens[i + 3].key);
            const ent = e && e.kind === 'entity' ? e : null;
            C.occ(i + 3, ent, false, ent ? file : null);
            open('architecture', i, { sym: a, parent: ent?.owner || file });
            unitScope();
            for (let k = i + 1; k <= i + 3; k++) C.tokScope[k] = cur;
            i += 3;
          }
          continue;
        case 'package': {
          if (afterEnd) continue;
          const body = isKw(n, 'body');
          const ni = body ? i + 2 : i + 1;
          if (tokens[ni]?.k !== 'id') continue;
          if (isKw(tokens[ni + 1], 'is') && isKw(tokens[ni + 2], 'new')) { C.declare(file, ni, 'package'); i = ni; continue; }
          if (body) {
            const pk = file.syms.get(tokens[ni].key);
            const pkg = pk && pk.kind === 'package' ? pk : null;
            C.occ(ni, pkg, false, pkg ? file : null);
            // (the package keeps its own scope as owner: the one `use work.p.all` makes visible)
            open('package', i, { sym: null, parent: pkg?.owner || file, extra: { merge: !!pkg?.owner, body: true } });
            cur.sym = pkg;
          } else open('package', i, { sym: C.declare(file, ni, 'package'), parent: file });
          unitScope();
          for (let k = i + 1; k <= ni; k++) C.tokScope[k] = cur;
          i = ni;
          continue;
        }
        case 'configuration':
          if (!afterEnd && n?.k === 'id' && isKw(tokens[i + 2], 'of')) {
            const c = C.declare(file, i + 1, 'configuration');
            if (tokens[i + 3]?.k === 'id') { const e = file.syms.get(tokens[i + 3].key); C.occ(i + 3, e?.kind === 'entity' ? e : null, false, e ? file : null); }
            open('configuration', i, { sym: c, parent: file });
            i += 3;
          }
          continue;
        case 'component':
          if (isOp(p, ':')) {
            if (n?.k === 'id') {
              const c = C.lookup(cur, n.key);
              C.occ(i + 1, null, false, cur);
              inst = { unit: { scope: c?.kind === 'component' ? c.owner : null, key: n.key } };
              C.tokScope[i + 1] = cur;
              i++;
            }
          } else if (!afterEnd && n?.k === 'id') {
            const c = C.declare(cur, i + 1, 'component');
            open('component', i, { sym: c });
            C.tokScope[i + 1] = cur;
            i++;
          }
          continue;
        case 'process': case 'block': case 'protected': case 'units': case 'case':
          if (!afterEnd) open(t.v, i);
          continue;
        case 'record':
          if (!afterEnd) open('record', i, { sym: null });
          continue;
        case 'if':
          if (!afterEnd) open('if', i);
          continue;
        case 'function': case 'procedure': {
          if (afterEnd) continue;
          const named = n?.k === 'id';
          const fsym = named ? C.declare(cur, i + 1, t.v) : null;
          // a declaration only (`function f (…) return t;`) or the body (`… is … begin … end`)?
          let spec = true;
          for (let j = i + 1, d = 0; j < tokens.length && tokens[j].k !== 'eof'; j++) {
            if (isOp(tokens[j], '(')) d++;
            else if (isOp(tokens[j], ')')) d--;
            else if (d === 0 && isOp(tokens[j], ';')) break;
            else if (d === 0 && isKw(tokens[j], 'is')) { spec = isKw(tokens[j + 1], 'new'); break; }
          }
          const s = open('subprogram', i, { sym: fsym, closer: t.v, extra: { specOnly: spec } });
          if (named) { C.tokScope[i + 1] = s; i++; }
          if (isOp(tokens[i + 1], '(')) pendingParen = { mode: 'list', listKind: 'param', declScope: s };
          continue;
        }
        case 'for':
          if (isKw(p, 'wait')) continue;
          if (n?.k === 'id' && isKw(tokens[i + 2], 'in')) {
            const s = open('for', i, { extra: { started: false } });
            C.declare(s, i + 1, 'loopvar');
            C.tokScope[i + 1] = s;
            i++;
          } else if (cur.kind === 'configuration' || cur.kind === 'for-config') open('for-config', i, { closer: 'for' });
          continue;
        case 'while':
          open('loop', i, { extra: { started: false } });
          continue;
        case 'loop':
          if (afterEnd) continue;
          if ((cur.kind === 'for' || cur.kind === 'loop') && cur.started === false) { cur.started = true; cur.closer = 'loop'; }
          else open('loop', i);
          continue;
        case 'generate':
          if (cur.kind === 'for' && cur.started === false) { cur.started = true; cur.closer = 'generate'; }
          else if (cur.kind === 'if' || cur.kind === 'case') cur.closer = 'generate';
          continue;
        case 'port': case 'generic':
          if (isOp(n, '(')) pendingParen = { mode: 'list', listKind: t.v, declScope: cur };
          continue;
        case 'map':
          if (isOp(n, '(')) pendingParen = { mode: 'assoc', unit: inst?.unit || null };
          continue;
        case 'signal': case 'variable': case 'constant': case 'file':
          if (top?.mode === 'list') continue;   // the class of an interface item
          decl = { kind: t.v === 'constant' ? 'constant' : t.v, state: 'names', depth: parens.length, syms: [] };
          continue;
        case 'alias':
          if (n?.k === 'id') { C.declare(cur, i + 1, 'alias'); C.tokScope[i + 1] = cur; i++; }
          continue;
        case 'type': case 'subtype':
          if (n?.k === 'id') {
            C.declare(cur, i + 1, t.v);
            C.tokScope[i + 1] = cur;
            if (isKw(tokens[i + 2], 'is') && isOp(tokens[i + 3], '(')) pendingParen = { mode: 'enum', declScope: cur };
            i++;
          }
          continue;
        case 'attribute':
          if (n?.k === 'id' && isOp(tokens[i + 2], ':')) { C.declare(cur, i + 1, 'attribute'); C.tokScope[i + 1] = cur; i++; }
          continue;
        case 'use':
          // use work.pkg.all: the package's declarations are visible in the next design unit
          for (let j = i + 1; j < tokens.length && !isOp(tokens[j], ';') && tokens[j].k !== 'eof'; j++) {
            if (tokens[j].k === 'id' && isOp(tokens[j - 1], '.') && tokens[j - 2]?.key === 'work') {
              const pk = file.syms.get(tokens[j].key);
              if (pk?.kind === 'package' && pk.owner) uses.push(pk.owner);
            }
          }
          continue;
        default:
          continue;
      }
    }

    if (t.k !== 'id') continue;

    // names declared by an interface list (ports, generics, parameters), an enumeration, a declaration
    if (top?.mode === 'list' && top.state === 'names') {
      top.syms.push(C.declare(top.declScope, i, top.listKind === 'param' ? 'argument' : top.listKind));
      continue;
    }
    if (top?.mode === 'enum') { C.declare(top.declScope, i, 'enum'); continue; }
    if (decl && decl.state === 'names' && parens.length === decl.depth) { decl.syms.push(C.declare(decl.scope || cur, i, decl.kind)); continue; }
    if (cur.kind === 'record' && !parens.length && (isKw(p, 'record') || isOp(p, ';', ','))) {
      decl = decl || { kind: 'field', state: 'names', depth: 0, syms: [], scope: fields };
      decl.syms.push(C.declare(fields, i, 'field'));
      continue;
    }
    // selected names: work.X, a record field, a library path; attributes after a tick
    if (isOp(p, '.')) {
      const pre = tokens[i - 2];
      if (pre?.key === 'work') { const s = file.syms.get(t.key); C.occ(i, s || null, false, s ? file : null); }
      // work.pkg.X: a declaration of a package of this file (#2558)
      else if (isOp(tokens[i - 3], '.') && tokens[i - 4]?.key === 'work' && file.syms.get(pre?.key)?.kind === 'package' && file.syms.get(pre.key).owner?.syms.has(t.key)) {
        const pk = file.syms.get(pre.key).owner;
        C.occ(i, pk.syms.get(t.key), false, pk);
      } else if (fields.syms.has(t.key)) C.occ(i, fields.syms.get(t.key), false, fields);
      else C.loose(i);
      continue;
    }
    // (a unit after a number, 10 ns, is not a name of the design either)
    if (isOp(p, "'") || p?.num) { C.loose(i); continue; }
    // formals of a port / generic map: the ports of the unit instantiated
    if (top && elemStart && (isOp(n, '=>') || (isOp(n, '(') && isOp(tokens[matching(tokens, i + 1) + 1], '=>')))) {
      if (top.mode === 'assoc') {
        const u = top.unit;
        const s = u?.scope?.syms.get(t.key);
        if (s) C.occ(i, s, false, u.scope);
        else C.occ(i, null, false, null, u ? { unit: u.key, key: t.key } : null);
      } else if (fields.syms.has(t.key)) C.occ(i, fields.syms.get(t.key), false, fields);   // record aggregate
      else C.loose(i);   // named association of a subprogram call
      continue;
    }
    // a label: `name :` at the start of a statement
    const stmtStart = !p || isOp(p, ';', '=>') || (p.k === 'kw' && VHDL_STMT_AFTER.has(p.v));
    if (stmtStart && !parens.length && !decl && isOp(n, ':')) {
      const nx = tokens[i + 2];
      const isInst = isKw(nx, 'entity', 'component', 'configuration') || (nx?.k === 'id' && isKw(tokens[i + 3], 'port', 'generic'));
      const s = C.declare(cur, i, isInst ? 'instance' : 'label');
      if (isInst) inst = { unit: undefined };
      else pendingLabel = s;
      C.tokScope[i + 1] = cur;
      i++;
      continue;
    }
    // the unit of a component instantiation: `u1 : X port map …`
    if (inst && inst.unit === undefined && isOp(p, ':')) {
      const s = C.lookup(cur, t.key);
      const unit = s && (s.kind === 'component' || s.kind === 'entity') ? s : null;
      C.occ(i, null, false, cur);
      inst.unit = { scope: unit?.owner || null, key: t.key };
      continue;
    }
    C.occ(i, null, false, cur);
  }
  return { lang: 'vhdl', ...C.finish() };
}

// ------------------------------------------------------------------ Verilog
const V_CLOSER = { end: 'block', endmodule: 'module', endcase: 'case', endfunction: 'function', endtask: 'task', endgenerate: 'generate',
  join: 'fork', join_any: 'fork', join_none: 'fork', endspecify: 'specify', endpackage: 'package' };
const V_OPEN_CLOSER = { block: 'end', module: 'endmodule', case: 'endcase', function: 'endfunction', task: 'endtask', generate: 'endgenerate', fork: 'join', specify: 'endspecify', package: 'endpackage' };
const V_DECL = new Set(['input', 'output', 'inout', 'wire', 'reg', 'logic', 'integer', 'real', 'realtime', 'time', 'genvar', 'parameter', 'localparam',
  'tri', 'tri0', 'tri1', 'wand', 'wor', 'triand', 'trior', 'supply0', 'supply1', 'event']);
const V_SV_TYPES = new Set(['bit', 'byte', 'int', 'shortint', 'longint', 'shortreal', 'string']);
const V_NET_WORDS = new Set(['wire', 'reg', 'logic', 'integer', 'real', 'realtime', 'time', 'tri', 'tri0', 'tri1', 'wand', 'wor', 'triand', 'trior', 'supply0', 'supply1', 'event', ...V_SV_TYPES]);
const V_STMT_AFTER = new Set(['begin', 'end', 'endcase', 'endfunction', 'endtask', 'endgenerate', 'endmodule', 'generate', 'else', 'fork', 'join']);

function verilogTokens(text) {
  const errors = [];
  const { tokens } = tokenize(text, 'scopes', errors);
  const ls = lineStarts(text);
  const out = [];
  for (const t of tokens) {
    const k = t.t === 'id' ? 'id' : t.t === 'kw' ? 'kw' : t.t === 'op' ? 'op' : t.t === 'eof' ? 'eof' : 'lit';
    const v = typeof t.v === 'string' ? t.v : String(t.v ?? '');
    // the columns after a macro use on the same line may be a little off: find the name near
    // there; the tokens of a macro's body are not in the text: they are not names to change
    let col = t.col;
    if (k === 'id' && !text.startsWith(v, ls[t.line - 1] + col - 1)) {
      const lineText = text.slice(ls[t.line - 1], ls[t.line] ?? text.length);
      col = null;
      for (const d of [1, -1, 2, -2, 3, -3, 4, -4]) {
        const at = t.col - 1 + d;
        if (at >= 0 && lineText.startsWith(v, at) && !/[\w$]/.test(lineText[at - 1] || '') && !/[\w$]/.test(lineText[at + v.length] || '')) { col = at + 1; break; }
      }
    }
    out.push({ k: col ? k : 'lit', v, key: k === 'id' && col ? v : null, line: t.line, col: col || t.col, len: k === 'id' || k === 'kw' ? v.length : 0, lt: t.t, size: t.size });
  }
  return out;
}

function analyzeVerilog(text) {
  const tokens = verilogTokens(text);
  const C = makeCtx(text, tokens);
  const { file, fields } = C;
  let cur = file;
  const stack = [];        // open brackets: { ch, mode: 'plain'|'assoc'|'enum'|'struct', unit, elemStart }
  let decl = null;         // { kind, depth, expectName, init, scope, net, range, signed, dir, kwRun }
  let inst = null;         // { unit: { scope, key }, depth }
  let header = null;      // the module whose header (#(…) (…) ;) is being read
  const skip = new Set();  // tokens already handled by a look-ahead
  const typedefName = new Set();
  const typeNames = new Set();
  let afterBrace = null;   // an enum / struct without typedef: the names after '}' are declared
  const open = (kind, tok, sym = null) => {
    const s = new Scope(kind, cur, cur, tok, V_OPEN_CLOSER[kind]);
    C.scopes.push(s);
    if (sym) { s.sym = sym; sym.owner = s; }
    cur = s;
    return s;
  };
  const declKind = w => (w === 'input' || w === 'output' || w === 'inout' ? 'port' : w === 'parameter' || w === 'localparam' ? 'parameter' : w === 'genvar' ? 'genvar' : 'signal');
  const startDecl = (w, t) => {
    const depth = stack.length;
    if (decl && decl.depth === depth && decl.expectName && decl.kwRun) {
      // output reg [3:0] q: one declaration, several words
      if (V_NET_WORDS.has(w)) decl.net = w;
      if (w === 'input' || w === 'output' || w === 'inout') { decl.dir = w; decl.kind = 'port'; }
      if (w === 'parameter' || w === 'localparam') decl.kind = 'parameter';
      return;
    }
    decl = { kind: declKind(w), depth, expectName: true, init: false, scope: decl?.depth === depth && decl.scope ? decl.scope : cur, net: V_NET_WORDS.has(w) ? w : null,
      range: '', signed: false, dir: declKind(w) === 'port' ? w : null, kwRun: true, fields: stack[stack.length - 1]?.mode === 'struct' };
    void t;
  };
  const stmtStart = i => {
    const p = tokens[i - 1];
    if (!p || isOp(p, ';', ')') || (p.k === 'kw' && V_STMT_AFTER.has(p.v))) return true;
    // begin : name  item
    return p.k === 'id' && isOp(tokens[i - 2], ':') && isKw(tokens[i - 3], 'begin', 'fork', 'end');
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    C.tokScope[i] = cur;
    if (t.k === 'eof') break;
    if (skip.has(i)) continue;
    const p = tokens[i - 1], n = tokens[i + 1];
    const top = stack[stack.length - 1];
    const elemStart = top?.elemStart;
    if (top) top.elemStart = false;
    const depth = stack.length;

    if (t.k === 'op') {
      switch (t.v) {
        case '(': case '[': case '{': {
          let fr = { ch: t.v, mode: 'plain', elemStart: true };
          if (t.v === '(' && header && depth === 0) {
            // #( parameters ) and ( ports ) of the module header
            stack.push(fr);
            decl = { kind: isOp(p, '#') ? 'parameter' : 'port', depth: stack.length, expectName: true, init: false, scope: cur, net: null, range: '', signed: false, dir: null, kwRun: false };
            continue;
          }
          if (t.v === '(' && inst && depth === inst.depth) fr = { ...fr, mode: 'assoc', unit: inst.unit };
          if (t.v === '{' && afterBrace?.at === i) fr = { ...fr, mode: afterBrace.kind };
          if (t.v === '(' && cur.kind !== 'file' && cur.paramsAt === i) {
            stack.push(fr);
            decl = { kind: 'port', depth: stack.length, expectName: true, init: false, scope: cur, net: null, range: '', signed: false, dir: null, kwRun: false };
            continue;
          }
          if (t.v === '[' && decl && decl.expectName && depth === decl.depth) fr.rangeStart = t.off;
          stack.push(fr);
          continue;
        }
        case ')': case ']': case '}': {
          const fr = stack.pop();
          if (fr?.rangeStart != null && decl && decl.depth === stack.length) decl.range = text.slice(fr.rangeStart, t.off + 1);
          if (decl && stack.length < decl.depth) decl = null;
          if (t.v === '}' && fr && (fr.mode === 'enum' || fr.mode === 'struct') && afterBrace && !afterBrace.typedef) {
            decl = { kind: 'signal', depth: stack.length, expectName: true, init: false, scope: cur, net: null, range: '', signed: false, kwRun: false };
            afterBrace = null;
          }
          continue;
        }
        case ',':
          if (top) top.elemStart = true;
          if (decl && depth === decl.depth) { decl.expectName = true; decl.init = false; decl.kwRun = false; }
          continue;
        case ';':
          if (decl && depth <= decl.depth) decl = null;
          if (inst && depth <= inst.depth) inst = null;
          if (header && depth === 0) header = null;
          if (top?.mode === 'struct') top.elemStart = true;
          continue;
        case '=':
          if (decl && depth === decl.depth) { decl.init = true; decl.expectName = false; }
          continue;
        default:
          continue;
      }
    }

    const w = t.v;
    if (t.k === 'kw' || (t.k === 'id' && (w in V_CLOSER || w === 'package' || w === 'typedef' || w === 'enum' || w === 'struct' || w === 'union' || w === 'import'))) {
      if (w in V_CLOSER) {
        const want = V_CLOSER[w];
        let s = cur;
        while (s !== file && s.kind !== want) s = s.outer;
        if (s !== file) {
          for (let x = cur; ; x = x.outer) { x.end = i; if (x === s) break; }
          cur = s.outer;
          if (isOp(n, ':') && tokens[i + 2]?.k === 'id') {
            C.tokScope[i + 1] = C.tokScope[i + 2] = cur;
            const nm = tokens[i + 2];
            C.occ(i + 2, s.sym && s.sym.key === nm.key ? s.sym : null, false, s.sym && s.sym.key === nm.key ? cur : null);
            i += 2;
          }
        }
        decl = null; inst = null;
        continue;
      }
      switch (w) {
        case 'module': case 'macromodule':
          if (n?.k === 'id') {
            const s = C.declare(file, i + 1, 'module');
            open('module', i, s);
            C.tokScope[i + 1] = cur;
            header = cur;
            i++;
          }
          continue;
        case 'package':
          if (n?.k === 'id' && stmtStart(i)) { open('package', i, C.declare(file, i + 1, 'package')); C.tokScope[i + 1] = cur; i++; }
          continue;
        case 'import':
          if (n?.k === 'id') {
            const pk = file.syms.get(n.key);
            C.occ(i + 1, pk?.kind === 'package' ? pk : null, false, pk ? file : null);
            if (pk?.owner) cur.imports.push(pk.owner);
            i++;
          }
          continue;
        case 'function': case 'task': {
          // the name is the last identifier before '(' or ';' (after the return type and range)
          let nameAt = -1;
          for (let j = i + 1, d = 0; j < tokens.length && tokens[j].k !== 'eof'; j++) {
            const x = tokens[j];
            if (isOp(x, '[')) d++;
            else if (isOp(x, ']')) d--;
            else if (d === 0 && isOp(x, '(', ';')) break;
            else if (d === 0 && x.k === 'id') nameAt = j;
          }
          const sym = nameAt > 0 ? C.declare(cur, nameAt, w) : null;
          const s = open(w, i, sym);
          if (nameAt > 0) { skip.add(nameAt); C.tokScope[nameAt] = s; if (isOp(tokens[nameAt + 1], '(')) s.paramsAt = nameAt + 1; }
          continue;
        }
        case 'begin': case 'fork': {
          let sym = null;
          if (isOp(n, ':') && tokens[i + 2]?.k === 'id') { sym = C.declare(cur, i + 2, 'label'); C.tokScope[i + 1] = C.tokScope[i + 2] = cur; }
          open(w === 'begin' ? 'block' : 'fork', i, sym);
          if (sym) i += 2;
          continue;
        }
        case 'case': case 'casex': case 'casez':
          open('case', i);
          continue;
        case 'generate': case 'specify':
          open(w, i);
          continue;
        case 'typedef': {
          // the type's name: the last identifier before the ';' that ends the typedef
          for (let j = i + 1, d = 0, last = -1; j < tokens.length && tokens[j].k !== 'eof'; j++) {
            const x = tokens[j];
            if (isOp(x, '(', '[', '{')) d++;
            else if (isOp(x, ')', ']', '}')) d--;
            else if (d === 0 && x.k === 'id') last = j;
            else if (d === 0 && isOp(x, ';')) { if (last > 0) { typedefName.add(last); typeNames.add(tokens[last].key); } break; }
          }
          if (tokens[i + 1]?.v === 'enum' || tokens[i + 1]?.v === 'struct' || tokens[i + 1]?.v === 'union') afterBrace = { typedef: true };
          continue;
        }
        case 'enum': case 'struct': case 'union': {
          let j = i + 1;
          while (j < tokens.length && !isOp(tokens[j], '{', ';') && tokens[j].k !== 'eof') j++;
          if (isOp(tokens[j], '{')) afterBrace = { at: j, kind: w === 'enum' ? 'enum' : 'struct', typedef: !!afterBrace?.typedef };
          continue;
        }
        default:
          if (V_DECL.has(w) || ((w === 'signed' || w === 'unsigned') && decl)) {
            if (w === 'signed' && decl) { decl.signed = true; continue; }
            if (w === 'unsigned') continue;
            startDecl(w, t);
          }
          continue;
      }
    }

    if (t.k !== 'id') continue;

    if (typedefName.has(i)) { C.declare(cur, i, 'type'); continue; }
    if (top?.mode === 'enum' && elemStart) { C.declare(cur, i, 'enum'); continue; }
    // SystemVerilog types used like keywords: int i; bit [3:0] b;
    if (V_SV_TYPES.has(w) && (tokens[i + 1]?.k === 'id' || isOp(n, '[') || isKw(n, 'signed', 'unsigned'))) { startDecl(w, t); continue; }
    // pkg::x: a declaration of a package of this file (#2558); another scope's name is not resolved here
    if (isOp(p, '::')) {
      const pk = file.syms.get(tokens[i - 2]?.key);
      const s = pk?.kind === 'package' ? pk.owner?.syms.get(t.key) : null;
      if (s) C.occ(i, s, false, pk.owner);
      else C.loose(i);
      continue;
    }
    // after '.': the formal of a named connection, a hierarchical name or a struct field
    if (isOp(p, '.')) {
      if (top?.mode === 'assoc' && !(tokens[i - 2]?.k === 'id')) {
        const u = top.unit;
        const s = u?.scope?.syms.get(t.key);
        if (s) C.occ(i, s, false, u.scope);
        else C.occ(i, null, false, null, u ? { unit: u.key, key: t.key } : null);
      } else if (fields.syms.has(t.key)) C.occ(i, fields.syms.get(t.key), false, fields);
      else C.loose(i);
      continue;
    }
    // a name being declared
    if (decl && depth === decl.depth && decl.expectName && !decl.init) {
      if (tokens[i + 1]?.k === 'id') { C.occ(i, null, false, cur); continue; }   // a type name: state_t s
      const kind = decl.kind === 'port' && decl.scope.kind !== 'module' ? 'argument' : decl.kind;
      const s = C.declare(decl.fields ? fields : decl.scope, i, decl.fields ? 'field' : kind);
      if (!decl.fields && kind !== 'parameter' && kind !== 'genvar' && kind !== 'argument') {
        s.vtype = s.vtype || {};
        if (decl.net && !s.vtype.net) s.vtype.net = decl.net;
        if (decl.dir) s.mode = decl.dir;
        if (decl.range && !s.vtype.range) s.vtype.range = decl.range;
        if (decl.signed) s.vtype.signed = true;
      }
      decl.expectName = false; decl.kwRun = false;
      continue;
    }
    if (inst && depth === inst.depth) { C.declare(cur, i, 'instance'); continue; }
    if (stmtStart(i) && !decl) {
      const n2 = tokens[i + 2];
      let isInst = isOp(n, '#') || (n?.k === 'id' && isOp(n2, '('));
      let isTyped = n?.k === 'id' && isOp(n2, ';', ',', '=');
      if (n?.k === 'id' && isOp(n2, '[')) { const m = matching(tokens, i + 2); isInst = isOp(tokens[m + 1], '('); isTyped = !isInst; }
      if (typeNames.has(t.key) && n?.k === 'id') { isInst = false; isTyped = true; }
      if (isInst) {
        const m = file.syms.get(t.key);
        const mod = m && m.kind === 'module' ? m : null;
        C.occ(i, mod, false, mod ? file : null);
        inst = { unit: { scope: mod?.owner || null, key: t.key }, depth };
        continue;
      }
      if (isTyped) {
        C.occ(i, null, false, cur);
        decl = { kind: 'signal', depth, expectName: true, init: false, scope: cur, net: null, range: '', signed: false, kwRun: false };
        continue;
      }
    }
    C.occ(i, null, false, cur);
  }
  return { lang: 'verilog', ...C.finish() };
}

/** The scopes open at token i, innermost first (the constructs not closed yet). */
export function openScopes(a, i) {
  const out = [];
  for (let s = a.scopeAt(i); s && s.kind !== 'file'; s = s.outer) out.push(s);
  return out;
}

/** The symbols visible at token i (innermost first, without the ones they hide). */
export function visibleSymbols(a, i) {
  const out = [], seen = new Set();
  for (let s = a.scopeAt(i); s; s = s.parent) {
    for (const scope of [s, ...s.imports]) {
      for (const sym of scope.syms.values()) if (!seen.has(sym.key)) { seen.add(sym.key); out.push(sym); }
    }
  }
  return out;
}
