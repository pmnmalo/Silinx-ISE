// Silinx - VHDL parser (recursive descent) producing the IR described in docs/IR.md.
//
//   import { parse } from './parser.js';
//   const { file, lang, units, errors } = parse(source, 'top.vhd');
//
// The parser never throws on user input: syntax errors are recorded in `errors`
// ({ file, line, col, message, severity }) and parsing resumes at the next `;`.
// All identifiers are lower-cased (VHDL is case-insensitive); string and
// character literal contents keep their case.
//
// Choices / extensions beyond docs/IR.md (all additive, never replacing a field):
//   * slice nodes also carry `dir` ('to'|'downto') of the written range.
//   * logic TypeSpecs of an unconstrained vector type (e.g. a function parameter
//     `x : std_logic_vector`) carry `unconstrained: true` (range is null).
//   * named TypeSpecs written with a constraint (`word_t(3 downto 0)`) carry `range`.
//   * instance items from `entity work.e(arch)` carry `arch`; conns whose formal is a
//     sub-element (`d(0) => x`) carry `formal` (the full formal expression).
//   * subprogram params carry `default` (Expr|null) and `class` when written.
//   * loop statements carry `label` when written.
//   * record types: `{ kind:'record', fields:[{name,type}] }` inside a type Decl, and
//     record element selection `r.f` -> `{ op:'field', base, name }` (a warning-free
//     best-effort extension; the elaborator may reject them).
//   * `rol`/`ror` are emitted as binary ops 'rol'/'ror' (no Verilog equivalent).
//   * non-std_logic character literals ('a') -> `{ op:'str', value:'a', char:true }`.
//   * generate_for whose range is `x'range` carries `range` and uses x'low/x'high.
//   * Module units carry `arch` (name of the merged architecture); labelled concurrent
//     assigns carry `label`; subprogram declarations without a body (package header
//     whose body is elsewhere) carry `declOnly: true`.
//   * std_logic characters in literals are accepted case-insensitively ('x' == 'X').
//   * subprograms written `pure` / `impure` carry `purity` ('pure' | 'impure'), and their body's
//     `end` endLoc; once a file reads without errors, its pure functions that use what is declared
//     outside them are reported (core/vhdl/purity.js, #185).
//   * a concurrent statement's label with the name of a declaration of its region (the
//     architecture with its entity, a block, a generate) is an error (core/vhdl/labels.js, #192);
//     an architecture of an entity of another file keeps its other labels in `labels` (checked
//     against the entity's names when the library is built).
// Waveforms: a multi-element waveform `a <= '1', '0' after 10 ns;` becomes one
// nonblocking assignment per element (each with its own delay) — inside a block in
// sequential code; a concurrent one becomes a process (sens 'all') with that block.

import { lex, tokenText } from './lexer.js';
import { purityErrors } from './purity.js';
import { declaredNames, interfaceNames } from './labels.js';
import { declarationMethods } from './parse-decls.js';
import { concurrentMethods } from './parse-concurrent.js';
import { sequentialMethods } from './parse-seq.js';
import { expressionMethods } from './parse-expr.js';
import { mapBits } from './nodes.js';
import { ParseError, STD_LIBS, block } from './parse-defs.js';
import { dedupe, mergePackageDecls } from './parse-helpers.js';

export { mapBits };

/**
 * Parse VHDL source text.
 * @param {string} source
 * @param {string} [file]
 * @returns {{ file: string, lang: 'vhdl', units: object[], errors: object[] }}
 */
export function parse(source, file = 'input') {
  const errors = [];
  let units = [];
  try {
    const { tokens, errors: lexErrors } = lex(String(source ?? ''));
    for (const e of lexErrors) errors.push({ file, ...e });
    const p = new Parser(tokens, file, errors);
    units = p.parseDesignFile();
    // a pure function that uses what is declared outside it (#185): once the file reads without errors
    if (!errors.some(e => e.severity === 'error')) {
      const pkgs = new Map(units.filter(u => u.kind === 'package').map(u => [u.name, u]));
      errors.push(...purityErrors(units, { file, text: String(source ?? ''), packages: n => pkgs.get(n) }));
    }
  } catch (e) {
    errors.push({ file, line: 1, col: 1, message: `internal parser error: ${e && e.message}`, severity: 'error' });
  }
  return { file, lang: 'vhdl', units, errors };
}

class Parser {
  constructor(tokens, file, errors) {
    this.t = tokens;
    this.i = 0;
    this.file = file;
    this.errors = errors;
    this.libraries = new Set(['work', 'ieee', 'std']);
    this.packageNames = new Set();   // packages known in this file / via use clauses
    this.stdUses = new Set();        // ieee / std packages of the next unit's context clause
    this.strMode = 0;                // >0 while parsing report/assert messages
    this.region = null;              // the declarative region being read: { names, labels } (#192)
    this.entities = new Map();       // the entities of this file
  }

  // --- token helpers ---------------------------------------------------------
  peek(k = 0) { return this.t[Math.min(this.i + k, this.t.length - 1)]; }
  next() { const tok = this.t[this.i]; if (this.i < this.t.length - 1) this.i++; return tok; }
  atEof() { return this.peek().type === 'eof'; }
  isKw(v, k = 0) { const tok = this.peek(k); return tok.type === 'kw' && tok.value === v; }
  isOp(v, k = 0) { const tok = this.peek(k); return tok.type === 'op' && tok.value === v; }
  isId(k = 0) { return this.peek(k).type === 'id'; }
  acceptKw(v) { if (this.isKw(v)) { this.next(); return true; } return false; }
  acceptOp(v) { if (this.isOp(v)) { this.next(); return true; } return false; }
  loc(tok = this.peek()) { return { line: tok.line, col: tok.col }; }
  describe(tok) {
    if (tok.type === 'eof') return 'end of file';
    if (tok.type === 'str') return `"${tok.value}"`;
    if (tok.type === 'char') return `'${tok.value}'`;
    if (tok.type === 'bitstr') return 'bit-string literal';
    return `'${tok.raw ?? tok.value}'`;
  }
  diag(message, tok = this.peek(), severity = 'error') {
    this.errors.push({ file: this.file, line: tok.line, col: tok.col, message, severity });
  }
  warn(message, tok = this.peek()) { this.diag(message, tok, 'warning'); }
  fail(message, tok = this.peek()) { this.diag(message, tok); throw new ParseError(message); }
  expectKw(v) {
    if (this.isKw(v)) return this.next();
    this.fail(`expected '${v}' but found ${this.describe(this.peek())}`);
  }
  expectOp(v) {
    if (this.isOp(v)) return this.next();
    // a ';' missing at the end of a line: reported after the last token of that line, and parsing
    // goes on as if it were there (no cascade of errors)
    if (v === ';' && this.atLineEnd()) {
      const prev = this.t[this.i - 1];
      const len = String(prev.raw ?? prev.value ?? '').length + (prev.type === 'str' || prev.type === 'char' ? 2 : 0);
      // (the token as written: 1.5e3, x"0F", "a""b")
      const written = tokenText(this.t, prev);
      const text = written === undefined ? this.describe(prev) : prev.type === 'str' || prev.type === 'char' ? written : `'${written}'`;
      this.diag(`expected ';' after ${text}`, { line: prev.line, col: prev.end ?? prev.col + len });
      return prev;
    }
    this.fail(`expected '${v}' but found ${this.describe(this.peek())}`);
  }
  /** Is the next token on a later line than the previous one (where a missing ';' is reported)? */
  atLineEnd() {
    return this.i > 0 && this.peek().line > this.t[this.i - 1].line;
  }
  /** After a procedure call's name / arguments: a later line that does not go on with an assignment (its ';' is missing)? */
  callEndsLine() {
    return this.atLineEnd() && !this.isOp('<=') && !this.isOp(':=');
  }
  /** Does a line that starts a declaration, `begin` or `end` come next (the ';' before it is missing)? */
  declEndsLine() {
    return this.atLineEnd() && (this.isDeclStart() || this.isKw('begin') || this.isKw('end'));
  }
  /**
   * After a subprogram specification that a line of declarations or `begin` follows: is it a body
   * whose `is` is missing (the first `end` that closes something is `end function`, `end procedure`
   * or `end <name>`), rather than a declaration whose ';' is missing? (Not when another subprogram
   * comes first: that `end` may be its own.)
   */
  bodyFollows(name) {
    const NESTED = new Set(['if', 'case', 'loop', 'generate', 'process', 'block', 'record', 'units', 'component', 'for', 'protected', 'postponed']);
    for (let k = this.i; k < this.t.length - 1; k++) {
      const tok = this.t[k], after = this.t[k + 1];
      if (tok.type === 'kw' && (tok.value === 'function' || tok.value === 'procedure') && !(this.t[k - 1].type === 'kw' && this.t[k - 1].value === 'end')) return false;
      if (tok.type !== 'kw' || tok.value !== 'end' || after.type === 'kw' && NESTED.has(after.value)) continue;
      return after.type === 'kw' ? after.value === 'function' || after.value === 'procedure' : after.value === name;
    }
    return false;
  }
  /**
   * Skip a declaration that is not analysed, up to its ';' (consumed). A line that
   * starts a declaration, `begin` or `end` ends it too: its ';' is missing (reported by expectOp).
   */
  skipDecl() {
    this.next();   // its first word
    let depth = 0;
    while (!this.atEof() && !(depth === 0 && this.isOp(';'))) {
      if (depth === 0 && this.declEndsLine()) break;
      if (this.isOp('(')) depth++;
      else if (this.isOp(')')) depth--;
      this.next();
    }
    this.expectOp(';');
  }
  expectId(what = 'identifier') {
    if (this.isId()) return this.next().value;
    this.fail(`expected ${what} but found ${this.describe(this.peek())}`);
  }
  /** Skip to just after the next ';' (error recovery). Always makes progress. */
  sync() {
    const start = this.i;
    while (!this.atEof()) {
      const tok = this.next();
      if (tok.type === 'op' && tok.value === ';') return;
    }
    if (this.i === start && !this.atEof()) this.next();
  }
  /** Run fn; on ParseError resynchronise and return `fallback`. */
  guard(fn, fallback = null) {
    const start = this.i;
    try { return fn(); } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      if (this.i === start || !this.isOp(';', -1)) this.sync();
      return fallback;
    }
  }
  /** Optional trailing `end` designators: `[kw...] [name] ;` */
  endOf(...kws) {
    for (const k of kws) this.acceptKw(k);
    if (this.isId() || this.peek().type === 'str') this.next();
    this.expectOp(';');
  }

  // --- design file -----------------------------------------------------------
  parseDesignFile() {
    const raw = [];     // parsed units in order
    let uses = [];      // context clause for the next unit
    while (!this.atEof()) {
      const before = this.i;
      const tok = this.peek();
      try {
        if (this.isKw('library')) {
          this.next();
          do { this.libraries.add(this.expectId('library name')); } while (this.acceptOp(','));
          this.expectOp(';');
        } else if (this.isKw('use')) {
          uses.push(...this.parseUseClause());
        } else if (this.isKw('context')) {
          this.parseContext();
        } else if (this.isKw('entity')) {
          raw.push(this.stdFlags(this.parseEntity(uses))); uses = [];
        } else if (this.isKw('architecture')) {
          raw.push(this.stdFlags(this.parseArchitecture(uses))); uses = [];
        } else if (this.isKw('package')) {
          const u = this.stdFlags(this.parsePackage(uses)); uses = [];
          if (u) raw.push(u);
        } else if (this.isKw('configuration')) {
          this.skipConfiguration(); uses = [];
        } else {
          this.fail(`unexpected ${this.describe(tok)} at design-unit level`);
        }
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.recoverUnit();
      }
      if (this.i === before) this.next();
    }
    return this.assembleUnits(raw);
  }

  /** Skip forward to the start of the next design unit / context item. */
  recoverUnit() {
    while (!this.atEof()) {
      const tok = this.peek();
      if (tok.type === 'kw' && ['entity', 'architecture', 'package', 'configuration', 'library'].includes(tok.value) &&
          !(this.isKw('end', -1))) {
        // `entity` also appears inside an architecture (`u: entity work.x`); only stop when
        // it starts a line-level unit (previous token is ';' or nothing).
        if (this.i === 0 || this.isOp(';', -1)) return;
      }
      this.next();
    }
  }

  parseUseClause() {
    this.expectKw('use');
    const out = [];
    do {
      const parts = [this.expectId('library name')];
      while (this.acceptOp('.')) {
        if (this.acceptKw('all')) { parts.push('all'); break; }
        if (this.isId()) parts.push(this.next().value);
        else if (this.peek().type === 'str') parts.push(this.next().value);
        else this.fail('expected name after \'.\'');
      }
      if (parts.length >= 2) {
        const [lib, pkg] = parts;
        if (pkg !== 'all') {
          this.packageNames.add(pkg);
          if (!STD_LIBS.has(lib)) out.push(pkg);
          else {
            this.stdUses.add(pkg.toLowerCase());
            // ieee.math_real: its VHDL part is a package compiled with the design (core/vhdl/math-real.js)
            if (pkg.toLowerCase() === 'math_real') out.push('math_real');
          }
        }
      }
    } while (this.acceptOp(','));
    this.expectOp(';');
    return out;
  }

  parseContext() {
    // context reference `context lib.ctx;` or declaration `context c is ... end context c;`
    this.expectKw('context');
    if (this.isId() && this.isKw('is', 1)) {
      while (!this.atEof() && !this.isKw('end')) this.next();
      this.expectKw('end');
      this.endOf('context');
      return;
    }
    while (!this.atEof() && !this.isOp(';')) this.next();
    this.expectOp(';');
  }

  skipConfiguration() {
    const tok = this.expectKw('configuration');
    let depth = 0;
    while (!this.atEof()) {
      if (this.isKw('for')) { depth++; this.next(); continue; }
      if (this.isKw('end')) {
        if (this.isKw('for', 1)) { depth--; this.next(); this.next(); continue; }
        if (depth <= 0) { this.next(); this.endOf('configuration'); return; }
      }
      this.next();
    }
    this.fail('unterminated configuration declaration', tok);
  }

  // --- entity / architecture / package --------------------------------------
  parseEntity(uses) {
    const tok = this.expectKw('entity');
    const name = this.expectId('entity name');
    this.expectKw('is');
    const ent = { kind: 'entity', name, loc: this.loc(tok), params: [], ports: [], decls: [], uses: [...uses] };
    if (this.isKw('generic')) {
      this.next();
      this.guard(() => { ent.params = this.parseGenericList(); this.expectOp(';'); });
    }
    if (this.isKw('port')) {
      this.next();
      this.guard(() => { ent.ports = this.parsePortList(); this.expectOp(';'); });
    }
    ent.decls = this.parseDeclarativePart(ent.uses);
    if (this.acceptKw('begin')) {
      // entity statements (passive processes / asserts): parsed and ignored.
      const items = this.parseConcurrentItems([]);
      if (items.length) this.warn('entity statement part is ignored', tok);
    }
    this.expectKw('end');
    this.endOf('entity');
    this.entities.set(name, ent);
    return ent;
  }

  parseGenericList() {
    this.expectOp('(');
    const params = [];
    for (;;) {
      this.guardList(() => {
        if (this.isKw('type') || this.isKw('function') || this.isKw('procedure') || this.isKw('package')) {
          this.warn('generic types / subprograms / packages are not supported');
          while (!this.atEof() && !this.isOp(';') && !this.isOp(')')) this.next();
          return;
        }
        const tok = this.peek();
        this.acceptKw('constant');
        const names = this.parseIdList();
        this.expectOp(':');
        this.acceptKw('in');
        const type = this.parseSubtypeIndication();
        const def = this.acceptOp(':=') ? this.parseExpression() : null;
        for (const nm of names) params.push({ name: nm, type, default: def, local: false, loc: this.loc(tok) });
      });
      if (this.acceptOp(';')) continue;
      break;
    }
    this.expectOp(')');
    return params;
  }

  parsePortList() {
    this.expectOp('(');
    const ports = [];
    for (;;) {
      this.guardList(() => {
        const tok = this.peek();
        this.acceptKw('signal');
        const names = this.parseIdList();
        this.expectOp(':');
        let dir = 'in';
        if (this.acceptKw('in')) dir = 'in';
        else if (this.acceptKw('out')) dir = 'out';
        else if (this.acceptKw('inout')) dir = 'inout';
        else if (this.acceptKw('buffer')) dir = 'out';
        else if (this.acceptKw('linkage')) dir = 'inout';
        const type = this.parseSubtypeIndication();
        this.acceptKw('bus');
        const def = this.acceptOp(':=') ? this.parseExpression() : null;
        for (const nm of names) ports.push({ name: nm, dir, type, default: def, loc: this.loc(tok) });
      });
      if (this.acceptOp(';')) continue;
      break;
    }
    this.expectOp(')');
    return ports;
  }

  /** Error recovery inside an interface list: skip to ';' or ')' (not consumed). */
  guardList(fn) {
    try { fn(); } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      let depth = 0;
      while (!this.atEof()) {
        if (this.isOp('(')) depth++;
        else if (this.isOp(')')) { if (depth === 0) return; depth--; }
        else if (this.isOp(';') && depth === 0) return;
        this.next();
      }
    }
  }

  parseIdList() {
    const names = [this.expectId()];
    while (this.acceptOp(',')) names.push(this.expectId());
    return names;
  }

  parseArchitecture(uses) {
    const tok = this.expectKw('architecture');
    const name = this.expectId('architecture name');
    this.expectKw('of');
    const entity = this.expectId('entity name');
    this.expectKw('is');
    const arch = { kind: 'architecture', name, entity, loc: this.loc(tok), uses: [...uses], decls: [], items: [] };
    this.inRegion((region) => {
      this.components = [];
      arch.decls = this.parseDeclarativePart(arch.uses);
      if (this.components.length) arch.components = this.components;
      const names = declaredNames(arch.decls);   // (before the declarations of its blocks join them)
      this.expectKw('begin');
      arch.items = this.parseConcurrentItems(arch.decls);
      this.expectKw('end');
      this.endOf('architecture');
      // its entity's ports, generics and declarations: of this file, else when the library is built
      const ent = this.entities.get(entity);
      if (ent) names.push(...interfaceNames(ent), ...declaredNames(ent.decls));
      const errors = this.checkLabels(region, names);
      if (!ent) arch.labels = region.labels.filter(l => !errors.some(e => [l, l.at].some(p => e.line === p.line && e.col === p.col)));
    });
    return arch;
  }

  parsePackage(uses) {
    const tok = this.expectKw('package');
    const isBody = this.acceptKw('body');
    const name = this.expectId('package name');
    this.packageNames.add(name);
    this.expectKw('is');
    if (this.isKw('new')) {
      this.warn('package instantiation is not supported');
      this.sync();
      return null;
    }
    if (this.isKw('generic')) {
      this.warn('package generics are not supported');
      this.next();
      this.guard(() => { this.parseGenericList(); this.expectOp(';'); });
    }
    const pkgUses = [...uses];
    const decls = this.parseDeclarativePart(pkgUses);
    this.expectKw('end');
    if (this.acceptKw('package')) this.acceptKw('body');
    this.endOf();
    return { kind: isBody ? 'package_body' : 'package', name, loc: this.loc(tok), decls, uses: pkgUses };
  }

  /** Unit u uses std_logic_signed / std_logic_unsigned (std_logic_vector arithmetic). */
  stdFlags(u) {
    if (u && this.stdUses.has('std_logic_signed')) u.slvArith = 'signed';
    else if (u && this.stdUses.has('std_logic_unsigned')) u.slvArith = 'unsigned';
    this.stdUses = new Set();
    return u;
  }

  /** Merge entity+architecture and package+body into IR units (source order kept). */
  assembleUnits(raw) {
    const out = [];
    const modules = new Map();
    const packages = new Map();
    const entityNames = new Set(raw.filter((u) => u.kind === 'entity').map((u) => u.name));
    for (const u of raw) {
      if (u.kind === 'entity') {
        const m = {
          kind: 'module', name: u.name, lang: 'vhdl', file: this.file, loc: u.loc,
          params: u.params, ports: u.ports, decls: [...u.decls], items: [], uses: dedupe(u.uses),
          entityOnly: true,
        };
        if (u.slvArith) m.slvArith = u.slvArith;
        modules.set(u.name, { m, entityDecls: u.decls });
        out.push(m);
      } else if (u.kind === 'package' || u.kind === 'package_body') {
        let pk = packages.get(u.name);
        if (!pk) {
          pk = { kind: 'package', name: u.name, lang: 'vhdl', file: this.file, loc: u.loc, decls: [], uses: [] };
          packages.set(u.name, pk);
          out.push(pk);
        }
        pk.uses = dedupe([...pk.uses, ...u.uses]);
        if (u.slvArith) pk.slvArith = u.slvArith;
        if (u.kind === 'package') pk.loc = u.loc;
        mergePackageDecls(pk.decls, u.decls);
      } else if (u.kind === 'architecture' && !entityNames.has(u.entity)) {
        out.push({ kind: 'architecture', name: u.name, entity: u.entity, lang: 'vhdl', file: this.file,
          loc: u.loc, decls: u.decls, items: u.items, uses: dedupe(u.uses), ...(u.slvArith ? { slvArith: u.slvArith } : {}),
          ...(u.labels?.length ? { labels: u.labels } : {}), ...(u.components ? { components: u.components } : {}) });
      }
    }
    // merge architectures into their entity (last one wins)
    for (const u of raw) {
      if (u.kind !== 'architecture' || !modules.has(u.entity)) continue;
      const { m, entityDecls } = modules.get(u.entity);
      m.decls = [...entityDecls, ...u.decls];
      if (u.components) m.components = u.components; else delete m.components;
      m.items = u.items;
      m.uses = dedupe([...m.uses, ...u.uses]);
      m.arch = u.name;
      if (u.slvArith) m.slvArith = u.slvArith;
      delete m.entityOnly;
    }
    return out;
  }
}
// the declarations, the concurrent and sequential statements, the expressions (parse-decls.js, parse-concurrent.js,
// parse-seq.js, parse-expr.js, #405)
Object.assign(Parser.prototype, declarationMethods, concurrentMethods, sequentialMethods, expressionMethods);
