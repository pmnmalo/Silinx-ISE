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
// Waveforms: a multi-element waveform `a <= '1', '0' after 10 ns;` becomes one
// nonblocking assignment per element (each with its own delay) — inside a block in
// sequential code; a concurrent one becomes a process (sens 'all') with that block.

import { lex } from './lexer.js';

class ParseError extends Error {}

// --- small IR helpers --------------------------------------------------------

const ref = (name) => ({ op: 'ref', name });
const int = (v) => ({ op: 'int', value: String(v) });
const bin = (o, a, b) => ({ op: 'binary', o, a, b });
const block = (stmts, loc) => ({ kind: 'block', label: null, decls: [], stmts, loc });
// One nonblocking assignment per waveform element. The first carries the delay mechanism
// (`mech`: 'transport' | { reject } | absent = inertial); the others only append (`waveCont`).
function waveAssigns(wave, target, mech, loc) {
  const out = [];
  wave.forEach((w, k) => {
    if (w.unaffected) return;
    const a = { kind: 'assign', target, value: w.value, nonblocking: true, delay: w.delay, loc };
    if (mech) a.mech = mech;
    if (k > 0) a.waveCont = true;
    out.push(a);
  });
  return out;
}

const LOGIC_CHARS = /^[01uxzwlhUXZWLH-]*$/;
/** Map a VHDL std_logic character string to IR bits (01xz). */
export function mapBits(s) {
  let out = '';
  for (const ch of s) {
    switch (ch.toUpperCase()) {
      case '0': case 'L': out += '0'; break;
      case '1': case 'H': out += '1'; break;
      case 'Z': out += 'z'; break;
      default: out += 'x';
    }
  }
  return out;
}

const SCALAR_LOGIC = new Set(['std_logic', 'std_ulogic', 'bit']);
const VECTOR_LOGIC = new Set(['std_logic_vector', 'std_ulogic_vector', 'bit_vector', 'unsigned', 'signed',
  'unresolved_unsigned', 'unresolved_signed', 'u_unsigned', 'u_signed']);
const INT_MAX = '2147483647';
const TIME_UNITS = { fs: ['fs', 1], ps: ['ps', 1], ns: ['ns', 1], us: ['us', 1], ms: ['ms', 1], sec: ['sec', 1], min: ['sec', 60], hr: ['sec', 3600] };
const SEVERITIES = new Set(['note', 'warning', 'error', 'failure']);
const DECL_KWS = new Set(['signal', 'constant', 'variable', 'shared', 'type', 'subtype', 'component',
  'function', 'procedure', 'pure', 'impure', 'attribute', 'alias', 'file', 'use', 'group', 'disconnect']);
const LOGICAL = { and: '&', or: '|', xor: '^', xnor: '~^', nand: 'nand', nor: 'nor' };
const UNARY_REDUCE = { and: '&', or: '|', xor: '^', nand: '~&', nor: '~|', xnor: '~^' };
const RELATIONAL = { '=': '==', '/=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=',
  '?=': '==', '?/=': '!=', '?<': '<', '?<=': '<=', '?>': '>', '?>=': '>=' };
const SHIFT = { sll: '<<', srl: '>>', sla: '<<<', sra: '>>>', rol: 'rol', ror: 'ror' };
const MULOP = { '*': '*', '/': '/', mod: 'mod', rem: 'rem' };
const STD_LIBS = new Set(['ieee', 'std']);

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
    const prev = this.i > 0 ? this.t[this.i - 1] : null;
    if (v === ';' && prev && this.peek().line > prev.line) {
      const len = String(prev.raw ?? prev.value ?? '').length + (prev.type === 'str' || prev.type === 'char' ? 2 : 0);
      this.diag(`expected ';' after ${this.describe(prev)}`, { line: prev.line, col: prev.col + len });
      return prev;
    }
    this.fail(`expected '${v}' but found ${this.describe(this.peek())}`);
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
          else this.stdUses.add(pkg.toLowerCase());
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
        this.acceptKw('constant');
        const names = this.parseIdList();
        this.expectOp(':');
        this.acceptKw('in');
        const type = this.parseSubtypeIndication();
        const def = this.acceptOp(':=') ? this.parseExpression() : null;
        for (const nm of names) params.push({ name: nm, type, default: def, local: false });
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
    arch.decls = this.parseDeclarativePart(arch.uses);
    this.expectKw('begin');
    arch.items = this.parseConcurrentItems(arch.decls);
    this.expectKw('end');
    this.endOf('architecture');
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
          loc: u.loc, decls: u.decls, items: u.items, uses: dedupe(u.uses), ...(u.slvArith ? { slvArith: u.slvArith } : {}) });
      }
    }
    // merge architectures into their entity (last one wins)
    for (const u of raw) {
      if (u.kind !== 'architecture' || !modules.has(u.entity)) continue;
      const { m, entityDecls } = modules.get(u.entity);
      m.decls = [...entityDecls, ...u.decls];
      m.items = u.items;
      m.uses = dedupe([...m.uses, ...u.uses]);
      m.arch = u.name;
      if (u.slvArith) m.slvArith = u.slvArith;
      delete m.entityOnly;
    }
    return out;
  }

  // --- declarations -----------------------------------------------------------
  /** Parse declarative items until `begin` / `end` (not consumed). */
  parseDeclarativePart(uses) {
    const decls = [];
    while (!this.atEof() && !this.isKw('begin') && !this.isKw('end')) {
      const before = this.i;
      const ds = this.guard(() => this.parseDeclItem(uses), []);
      if (ds) decls.push(...ds);
      if (this.i === before) { this.diag(`unexpected ${this.describe(this.peek())} in declarative part`); this.next(); }
    }
    return decls;
  }

  isDeclStart() {
    const tok = this.peek();
    if (tok.type !== 'kw') return false;
    if (DECL_KWS.has(tok.value)) return true;
    if (tok.value === 'for' && this.isId(1) || tok.value === 'for' && this.isKw('all', 1)) {
      // configuration specification `for u1 : comp use ...;` vs. for-generate (`lbl: for`)
      return true;
    }
    return false;
  }

  /** @returns {object[]} decls produced (possibly empty) */
  parseDeclItem(uses) {
    const tok = this.peek();
    if (tok.type !== 'kw') this.fail(`unexpected ${this.describe(tok)} in declarative part`);
    switch (tok.value) {
      case 'signal': {
        this.next();
        const names = this.parseIdList();
        this.expectOp(':');
        const type = this.parseSubtypeIndication();
        if (this.acceptKw('register') || this.acceptKw('bus')) { /* guarded signal kinds */ }
        const init = this.acceptOp(':=') ? this.parseExpression() : null;
        this.expectOp(';');
        return names.map((name) => ({ kind: 'signal', name, type, init, net: 'signal', loc: this.loc(tok) }));
      }
      case 'shared':
      case 'variable': {
        this.next();
        if (tok.value === 'shared') this.expectKw('variable');
        const names = this.parseIdList();
        this.expectOp(':');
        const type = this.parseSubtypeIndication();
        const init = this.acceptOp(':=') ? this.parseExpression() : null;
        this.expectOp(';');
        return names.map((name) => ({ kind: 'signal', name, type, init, net: 'variable', loc: this.loc(tok) }));
      }
      case 'constant': {
        this.next();
        const names = this.parseIdList();
        this.expectOp(':');
        const type = this.parseSubtypeIndication();
        const value = this.acceptOp(':=') ? this.parseExpression() : null; // deferred constant: null
        this.expectOp(';');
        return names.map((name) => ({ kind: 'const', name, type, value, loc: this.loc(tok) }));
      }
      case 'type': return [this.parseTypeDecl()];
      case 'subtype': {
        this.next();
        const name = this.expectId('subtype name');
        this.expectKw('is');
        const type = this.parseSubtypeIndication();
        this.expectOp(';');
        return [{ kind: 'type', name, type, loc: this.loc(tok) }];
      }
      case 'component': {
        this.next();
        this.expectId('component name');
        this.acceptKw('is');
        if (this.acceptKw('generic')) this.guard(() => { this.parseGenericList(); this.expectOp(';'); });
        if (this.acceptKw('port')) this.guard(() => { this.parsePortList(); this.expectOp(';'); });
        this.expectKw('end');
        this.endOf('component');
        return [];
      }
      case 'pure': case 'impure': case 'function': case 'procedure': {
        const f = this.parseSubprogram(uses);
        return f ? [f] : [];
      }
      case 'attribute': case 'disconnect': case 'group': {
        this.sync();
        return [];
      }
      case 'alias': {
        // object alias: `alias name [: subtype] is object_name;` -> { kind:'alias', name, type, target }
        const tok = this.next();
        const name = this.expectId('alias name');
        let type = null;
        if (this.acceptOp(':')) type = this.parseSubtypeIndication();
        this.expectKw('is');
        const target = this.parseExpression();
        let signature = false;
        if (this.isOp('[')) {
          // subprogram alias: `alias name is subprogram_name [signature];` (the signature only
          // selects among overloads, which are not distinguished here) -> { kind:'subalias', ... }
          signature = true;
          let depth = 0;
          do {
            if (this.isOp('[')) depth++;
            else if (this.isOp(']')) depth--;
            this.next();
          } while (depth > 0 && this.peek().type !== 'eof');
        }
        if (!this.isOp(';') || (signature && target.op !== 'ref')) {
          this.warn('unsupported alias declaration (ignored)', tok);
          this.sync();
          return [];
        }
        this.expectOp(';');
        if (signature) return [{ kind: 'subalias', name, target: target.name, loc: this.loc(tok) }];
        return [{ kind: 'alias', name, type, target, loc: this.loc(tok) }];
      }
      case 'file': {
        this.warn('file declarations are not supported and are ignored');
        this.sync();
        return [];
      }
      case 'use': {
        uses.push(...this.parseUseClause());
        return [];
      }
      case 'for': {
        // configuration specification - ignored
        this.sync();
        if (this.isKw('end') && this.isKw('for', 1)) { this.next(); this.next(); this.expectOp(';'); }
        return [];
      }
      default:
        this.fail(`unexpected ${this.describe(tok)} in declarative part`);
    }
    return [];
  }

  parseTypeDecl() {
    const tok = this.expectKw('type');
    const name = this.expectId('type name');
    if (this.acceptOp(';')) return { kind: 'type', name, type: { kind: 'named', name }, loc: this.loc(tok) }; // incomplete
    this.expectKw('is');
    let type;
    if (this.isOp('(')) {
      // enumeration
      this.next();
      const values = [];
      do {
        const t = this.next();
        if (t.type === 'id') values.push(t.value);
        else if (t.type === 'char') values.push(`'${t.value}'`);
        else this.fail(`expected enumeration literal but found ${this.describe(t)}`, t);
      } while (this.acceptOp(','));
      this.expectOp(')');
      type = { kind: 'enum', values };
    } else if (this.acceptKw('array')) {
      this.expectOp('(');
      const ranges = [];
      do { ranges.push(this.parseIndexSubtype()); } while (this.acceptOp(','));
      this.expectOp(')');
      this.expectKw('of');
      let elem = this.parseSubtypeIndication();
      for (let k = ranges.length - 1; k >= 0; k--) elem = { kind: 'array', range: ranges[k], elem };
      type = elem;
    } else if (this.acceptKw('range')) {
      const r = this.parseRange();
      if (this.acceptKw('units')) {
        // physical type: skip the units body
        while (!this.atEof() && !this.isKw('end')) this.next();
        this.expectKw('end'); this.expectKw('units'); if (this.isId()) this.next();
        type = { kind: 'time' };
      } else if (isRealRange(r)) type = { kind: 'real' };
      else type = { kind: 'integer', range: r };
    } else if (this.acceptKw('record')) {
      const fields = [];
      while (!this.atEof() && !this.isKw('end')) {
        this.guard(() => {
          const names = this.parseIdList();
          this.expectOp(':');
          const ft = this.parseSubtypeIndication();
          this.expectOp(';');
          for (const nm of names) fields.push({ name: nm, type: ft });
        });
      }
      this.expectKw('end'); this.expectKw('record'); if (this.isId()) this.next();
      type = { kind: 'record', fields };
    } else if (this.isKw('access') || this.isKw('file') || this.isKw('protected')) {
      this.warn(`${this.peek().value} types are not supported`);
      if (this.isKw('protected')) {
        while (!this.atEof() && !(this.isKw('end') && this.isKw('protected', 1))) this.next();
        this.next(); this.next(); if (this.isId()) this.next();
      } else {
        while (!this.atEof() && !this.isOp(';')) this.next();
      }
      type = { kind: 'named', name };
    } else {
      this.fail(`unsupported type definition ${this.describe(this.peek())}`);
    }
    this.expectOp(';');
    return { kind: 'type', name, type, loc: this.loc(tok) };
  }

  /** Array index: `0 to 7`, `natural range <>`, `t_enum`, `integer range 0 to 3`. */
  parseIndexSubtype() {
    if (this.isId() && this.isKw('range', 1) && this.isOp('<>', 2)) {
      this.next(); this.next(); this.next();
      return null;
    }
    return this.parseRange();
  }

  /**
   * Subtype indication: [resolution] type_mark [constraint].
   * @returns TypeSpec
   */
  parseSubtypeIndication() {
    if (this.isOp('(')) {
      // VHDL-2008 element resolution `(resolved) std_ulogic_vector` - skip
      let depth = 0;
      do { if (this.isOp('(')) depth++; else if (this.isOp(')')) depth--; this.next(); } while (depth > 0 && !this.atEof());
    }
    let name = this.expectId('type name');
    while (this.acceptOp('.')) name = this.expectId('type name');
    if (this.isId()) {
      // `resolved std_ulogic` : first name is a resolution function
      name = this.next().value;
      while (this.acceptOp('.')) name = this.expectId('type name');
    }
    let range = null, hasRange = false;
    if (this.isOp('(')) {
      this.next();
      const ranges = [];
      do {
        if (this.acceptKw('open')) ranges.push(null);
        else ranges.push(this.parseRange());
      } while (this.acceptOp(','));
      this.expectOp(')');
      // 2008 element constraint `(open)(7 downto 0)` - take the last one for vectors
      while (this.isOp('(')) {
        this.next();
        ranges.push(this.parseRange());
        this.expectOp(')');
      }
      range = ranges[0] ?? null;
      hasRange = true;
    } else if (this.isKw('range')) {
      this.next();
      if (this.acceptOp('<>')) range = null;
      else range = this.parseRange();
      hasRange = true;
    }
    return makeType(name, range, hasRange);
  }

  /**
   * Discrete range: `a to b`, `a downto b`, `x'range`, `x'reverse_range`,
   * `type range a to b`, or a type mark (-> {of: ref}).
   */
  parseRange() {
    const e = this.parseExpression();
    if (this.isKw('to') || this.isKw('downto')) {
      const dir = this.next().value;
      const right = this.parseExpression();
      return { left: e, right, dir };
    }
    if (e.op === 'attr' && (e.attr === 'range' || e.attr === 'reverse_range') && e.args.length === 0) {
      return { of: e.prefix, reverse: e.attr === 'reverse_range' };
    }
    if (this.isKw('range') && e.op === 'ref') {
      this.next();
      if (this.acceptOp('<>')) return null;
      return this.parseRange();
    }
    return { of: e, reverse: false };
  }

  parseSubprogram(uses) {
    const tok = this.peek();
    this.acceptKw('pure') || this.acceptKw('impure');
    const isFunc = this.isKw('function');
    if (!this.acceptKw('function')) this.expectKw('procedure');
    let name;
    if (this.peek().type === 'str') name = `"${this.next().value.toLowerCase()}"`;
    else name = this.expectId('subprogram name');
    let params = [];
    if (this.isOp('(')) params = this.parseParamList();
    let returnType = null;
    if (isFunc) {
      this.expectKw('return');
      returnType = this.parseSubtypeIndication();
    }
    if (this.acceptOp(';')) {
      return { kind: 'function', name, params, returnType, decls: [], body: [], retVar: undefined, loc: this.loc(tok), declOnly: true };
    }
    this.expectKw('is');
    if (this.isKw('new')) { this.warn('subprogram instantiation is not supported'); this.sync(); return null; }
    const decls = this.parseDeclarativePart(uses);
    this.expectKw('begin');
    const body = this.parseSeqStmts();
    this.expectKw('end');
    this.acceptKw('function') || this.acceptKw('procedure');
    if (this.isId() || this.peek().type === 'str') this.next();
    this.expectOp(';');
    return { kind: 'function', name, params, returnType, decls, body, retVar: undefined, loc: this.loc(tok) };
  }

  parseParamList() {
    this.expectOp('(');
    const params = [];
    for (;;) {
      this.guardList(() => {
        let cls;
        if (this.isKw('constant') || this.isKw('signal') || this.isKw('variable') || this.isKw('file')) cls = this.next().value;
        const names = this.parseIdList();
        this.expectOp(':');
        let dir = 'in';
        if (this.acceptKw('in')) dir = 'in';
        else if (this.acceptKw('out')) dir = 'out';
        else if (this.acceptKw('inout')) dir = 'inout';
        else if (this.acceptKw('buffer')) dir = 'out';
        const type = this.parseSubtypeIndication();
        this.acceptKw('bus');
        const def = this.acceptOp(':=') ? this.parseExpression() : null;
        for (const nm of names) {
          const p = { name: nm, type, dir, default: def };
          if (cls) p.class = cls;
          params.push(p);
        }
      });
      if (this.acceptOp(';')) continue;
      break;
    }
    this.expectOp(')');
    return params;
  }

  // --- concurrent statements -------------------------------------------------
  /**
   * Parse concurrent statements until `end` / `elsif` / `else` / `when` (not consumed).
   * Declarations found in flattened blocks are appended to `decls`.
   */
  parseConcurrentItems(decls) {
    const items = [];
    while (!this.atEof() && !this.isKw('end') && !this.isKw('elsif') && !this.isKw('else') && !this.isKw('when')) {
      const before = this.i;
      const res = this.guard(() => this.parseConcurrent(decls), null);
      if (res) items.push(...res);
      if (this.i === before) { this.diag(`unexpected ${this.describe(this.peek())} in concurrent statement part`); this.next(); }
    }
    return items;
  }

  /** @returns {object[]} items */
  parseConcurrent(decls) {
    const start = this.peek();
    let label = null;
    if (this.isId() && this.isOp(':', 1)) { label = this.next().value; this.next(); }
    const tok = this.peek();
    const loc = this.loc(label ? start : tok);
    if (tok.type === 'kw') {
      switch (tok.value) {
        case 'process': return [this.parseProcess(label, loc)];
        case 'postponed':
          this.next();
          if (this.isKw('process')) return [this.parseProcess(label, loc)];
          if (this.isKw('assert')) return [this.parseConcurrentAssert(label, loc)];
          return this.parseConcurrentAssignOrCall(label, loc);
        case 'for': return [this.parseForGenerate(label, loc)];
        case 'if': return [this.parseIfGenerate(label, loc)];
        case 'case': return [this.parseCaseGenerate(label, loc)];
        case 'block': return this.parseBlock(decls);
        case 'assert': return [this.parseConcurrentAssert(label, loc)];
        case 'with': return [this.parseSelectedAssign(label, loc)];
        case 'entity': case 'component': case 'configuration':
          return this.parseInstance(label, loc);
        default:
          if (this.isDeclStart()) {
            this.fail(`declaration ${this.describe(tok)} not allowed in statement part`);
          }
          this.fail(`unexpected ${this.describe(tok)} in concurrent statement part`);
      }
    }
    if (label && this.isId()) {
      // component instantiation: `u1: comp [generic map(..)] port map(..);`
      let k = 1;
      while (this.isOp('.', k) && this.peek(k + 1).type === 'id') k += 2;
      if (this.isKw('port', k) || this.isKw('generic', k) || this.isOp(';', k)) return this.parseInstance(label, loc);
    }
    return this.parseConcurrentAssignOrCall(label, loc);
  }

  parseProcess(label, loc) {
    this.expectKw('process');
    let sens = null;
    if (this.acceptOp('(')) {
      if (this.acceptKw('all')) sens = 'all';
      else {
        sens = [];
        do { sens.push({ edge: 'any', expr: this.parseName() }); } while (this.acceptOp(','));
      }
      this.expectOp(')');
    }
    this.acceptKw('is');
    const uses = [];
    const decls = this.parseDeclarativePart(uses);
    this.expectKw('begin');
    const body = this.parseSeqStmts();
    this.expectKw('end');
    this.acceptKw('postponed');
    this.expectKw('process');
    if (this.isId()) this.next();
    this.expectOp(';');
    return { kind: 'process', label, sens, initial: false, decls, body, loc };
  }

  parseConcurrentAssert(label, loc) {
    const a = this.parseAssertStmt();
    return { kind: 'process', label, sens: 'all', initial: false, decls: [], body: [a], loc };
  }

  /** Body of a generate: `[decls begin] items end generate [label];` (end not consumed). */
  parseGenerateBody() {
    const decls = [];
    if (this.isDeclStart() || this.isKw('begin')) {
      decls.push(...this.parseDeclarativePart([]));
      this.expectKw('begin');
    }
    const items = this.parseConcurrentItems(decls);
    return { decls, items };
  }

  /** 2008 alternative terminator `end [alt_label];` before elsif / else / when. */
  acceptAltEnd() {
    if (this.isKw('end') && !this.isKw('generate', 1)) {
      this.next();
      if (this.isId()) this.next();
      this.expectOp(';');
    }
  }

  parseForGenerate(label, loc) {
    this.expectKw('for');
    const v = this.expectId('generate parameter');
    this.expectKw('in');
    const range = this.parseRange();
    this.expectKw('generate');
    const { decls, items } = this.parseGenerateBody();
    this.acceptAltEnd();
    this.expectKw('end');
    this.expectKw('generate');
    if (this.isId()) this.next();
    this.expectOp(';');
    const g = { kind: 'generate_for', label, var: v, ...forRangeParts(v, range), decls, items, loc };
    if (!range || range.of) g.range = range;
    return g;
  }

  /**
   * if-generate with VHDL-2008 elsif/else alternatives. `elsif` chains become a nested
   * generate_if in `else`; only the outermost call consumes `end generate [label];`.
   */
  parseIfGenerate(label, loc, nested = false) {
    if (!this.acceptKw('if')) this.expectKw('elsif');
    if (this.isId() && this.isOp(':', 1)) { this.next(); this.next(); } // alternative label
    const cond = this.parseExpression();
    this.expectKw('generate');
    const body = this.parseGenerateBody();
    this.acceptAltEnd();
    const g = { kind: 'generate_if', label, cond, then: body.items, else: [], decls: body.decls, loc };
    if (this.isKw('elsif')) {
      g.else = [this.parseIfGenerate(label, this.loc(), true)];
    } else if (this.acceptKw('else')) {
      if (this.isId() && this.isOp(':', 1)) { this.next(); this.next(); }
      this.expectKw('generate');
      const eb = this.parseGenerateBody();
      this.acceptAltEnd();
      g.else = [...eb.decls.map((d) => ({ kind: 'decl', decl: d })), ...eb.items];
    }
    if (!nested) {
      this.expectKw('end');
      this.expectKw('generate');
      if (this.isId()) this.next();
      this.expectOp(';');
    }
    return g;
  }

  /**
   * VHDL-2008 case-generate: `case e generate when c1 | c2 => ... when others => ... end generate;`
   * becomes a chain of if-generates on `e = c1 or e = c2` (ranges: `lo <= e and e <= hi`).
   */
  parseCaseGenerate(label, loc) {
    this.expectKw('case');
    const sel = this.parseExpression();
    this.expectKw('generate');
    const alts = [];
    while (this.acceptKw('when')) {
      if (this.isId() && this.isOp(':', 1)) { this.next(); this.next(); }   // alternative label
      const choices = [];
      do { choices.push(this.acceptKw('others') ? 'others' : this.parseChoice()); } while (this.acceptOp('|'));
      this.expectOp('=>');
      const body = this.parseGenerateBody();
      this.acceptAltEnd();
      alts.push({ choices, body });
    }
    this.expectKw('end');
    this.expectKw('generate');
    if (this.isId()) this.next();
    this.expectOp(';');
    const test = (c) => {
      if (!c.range) return bin('==', sel, c);
      if (c.range.of) return bin('&', bin('>=', sel, { op: 'attr', prefix: c.range.of, attr: 'low', args: [] }), bin('<=', sel, { op: 'attr', prefix: c.range.of, attr: 'high', args: [] }));
      const [lo, hi] = c.range.dir === 'downto' ? [c.range.right, c.range.left] : [c.range.left, c.range.right];
      return bin('&', bin('>=', sel, lo), bin('<=', sel, hi));
    };
    let rest = [];
    for (let k = alts.length - 1; k >= 0; k--) {
      const { choices, body } = alts[k];
      if (choices.includes('others')) { rest = [...body.decls.map((d) => ({ kind: 'decl', decl: d })), ...body.items]; continue; }
      const cond = choices.map(test).reduce((x, y) => bin('|', x, y));
      rest = [{ kind: 'generate_if', label, cond, then: body.items, else: rest, decls: body.decls, loc }];
    }
    return rest.length === 1 && rest[0].kind === 'generate_if' ? rest[0] : { kind: 'generate_if', label, cond: { op: 'ref', name: 'true' }, then: rest, else: [], decls: [], loc };
  }

  skipGenerate() {
    let depth = 0;
    while (!this.atEof()) {
      if (this.isKw('generate')) depth++;
      if (this.isKw('end') && this.isKw('generate', 1)) {
        depth--;
        if (depth <= 0) { this.next(); this.next(); if (this.isId()) this.next(); this.expectOp(';'); return; }
      }
      this.next();
    }
  }

  /** Block statement: flattened into the enclosing region. */
  parseBlock(decls) {
    this.expectKw('block');
    if (this.acceptOp('(')) { this.parseExpression(); this.expectOp(')'); }
    this.acceptKw('is');
    if (this.isKw('generic') || this.isKw('port')) {
      this.warn('block generics/ports are not supported');
      while (!this.atEof() && !this.isKw('begin') && !this.isDeclStart()) this.next();
    }
    decls.push(...this.parseDeclarativePart([]));
    this.expectKw('begin');
    const items = this.parseConcurrentItems(decls);
    this.expectKw('end');
    this.expectKw('block');
    if (this.isId()) this.next();
    this.expectOp(';');
    return items;
  }

  parseInstance(label, loc) {
    let module;
    let arch;
    if (this.acceptKw('entity')) {
      module = this.expectId('entity name');
      while (this.acceptOp('.')) module = this.expectId('entity name');
      if (this.acceptOp('(')) { arch = this.expectId('architecture name'); this.expectOp(')'); }
    } else if (this.acceptKw('configuration')) {
      module = this.expectId('configuration name');
      while (this.acceptOp('.')) module = this.expectId();
      this.warn('configuration instantiation: configuration name used as module name');
    } else {
      this.acceptKw('component');
      module = this.expectId('component name');
      while (this.acceptOp('.')) module = this.expectId('component name');
    }
    let params = [], conns = [];
    if (this.acceptKw('generic')) {
      this.expectKw('map');
      params = this.parseAssocList().map((a) => ({ name: a.port, value: a.expr }));
    }
    if (this.acceptKw('port')) {
      this.expectKw('map');
      conns = this.parseAssocList();
    }
    this.expectOp(';');
    const inst = { kind: 'instance', name: label, module, params, conns, loc };
    if (arch) inst.arch = arch;
    return [inst];
  }

  /** Association list for port/generic maps -> [{port, expr}] */
  parseAssocList() {
    this.expectOp('(');
    const out = [];
    do {
      const tok = this.peek();
      let formal = null;
      let actual;
      if (this.acceptKw('open')) actual = null;
      else {
        const e = this.parseExpression();
        if (this.acceptOp('=>')) {
          formal = e;
          if (this.acceptKw('open')) actual = null;
          else actual = this.parseExpression();
        } else actual = e;
      }
      const c = { port: null, expr: actual };
      if (formal) {
        if (formal.op === 'ref') c.port = formal.name;
        else if (formal.op === 'apply') { c.port = formal.name; c.formal = formal; }
        else if (formal.op === 'slice' || formal.op === 'index') { c.port = baseName(formal); c.formal = formal; }
        else this.diag('unsupported formal in association', tok);
      }
      out.push(c);
    } while (this.acceptOp(','));
    this.expectOp(')');
    return out;
  }

  /** Concurrent signal assignment (simple / conditional) or concurrent procedure call. */
  parseConcurrentAssignOrCall(label, loc) {
    const tok = this.peek();
    const target = this.parseTarget();
    if (this.acceptOp(';')) {
      const call = this.makeCall(target, tok);
      return [{ kind: 'process', label, sens: 'all', initial: false, decls: [], body: [call], loc }];
    }
    if (!this.isOp('<=')) this.fail(`expected '<=' but found ${this.describe(this.peek())}`);
    this.next();
    this.acceptKw('guarded');
    const mech = this.parseDelayMechanism();
    const branches = this.parseConditionalWaveforms();
    this.expectOp(';');
    if (branches.length === 1 && branches[0].wave.length > 1) {
      // multi-element waveform -> process with one assignment per element
      const stmts = waveAssigns(branches[0].wave, target, mech, loc);
      return [{ kind: 'process', label, sens: 'all', initial: false, decls: [], body: [block(stmts, loc)], loc }];
    }
    const { value, delay } = this.foldConditional(branches, target, tok);
    const a = { kind: 'assign', target, value, delay, loc };
    if (mech) a.mech = mech;
    if (label) a.label = label;
    return [a];
  }

  /** Fold [{wave, cond}] (when/else chain) into a single cond expression. */
  foldConditional(branches, target, tok) {
    let delay = null;
    for (const b of branches) {
      if (b.wave.length > 1) this.warn('multi-element waveform in conditional assignment: only the first element is used', tok);
      if (delay === null && b.wave[0].delay) delay = b.wave[0].delay;
    }
    const valOf = (b) => (b.wave[0].unaffected ? target : b.wave[0].value);
    let value = valOf(branches[branches.length - 1]);
    if (branches[branches.length - 1].cond) {
      // last branch has a condition: else keeps the old value
      value = { op: 'cond', cond: branches[branches.length - 1].cond, then: value, else: target };
    }
    for (let k = branches.length - 2; k >= 0; k--) {
      value = { op: 'cond', cond: branches[k].cond, then: valOf(branches[k]), else: value };
    }
    return { value, delay };
  }

  /** `transport` | `[reject t] inertial` -> 'transport' | { reject: expr } | null (inertial). */
  parseDelayMechanism() {
    if (this.acceptKw('transport')) return 'transport';
    if (this.acceptKw('reject')) { const reject = this.parseExpression(); this.expectKw('inertial'); return { reject }; }
    this.acceptKw('inertial');
    return null;
  }

  /** waveform { when cond else waveform } [when cond] */
  parseConditionalWaveforms() {
    const branches = [];
    for (;;) {
      const wave = this.parseWaveform();
      if (this.acceptKw('when')) {
        const cond = this.parseExpression();
        branches.push({ wave, cond });
        if (this.acceptKw('else')) continue;
        break;
      }
      branches.push({ wave, cond: null });
      break;
    }
    return branches;
  }

  /** waveform ::= element {, element} | unaffected; element ::= expr [after time] */
  parseWaveform() {
    if (this.acceptKw('unaffected')) return [{ unaffected: true, value: null, delay: null }];
    const out = [];
    do {
      if (this.acceptKw('null')) { out.push({ unaffected: true, value: null, delay: null }); if (this.acceptKw('after')) this.parseExpression(); continue; }
      const value = this.parseExpression();
      const delay = this.acceptKw('after') ? this.parseExpression() : null;
      out.push({ value, delay });
    } while (this.acceptOp(','));
    return out;
  }

  /** `with sel select [?] target <= [mech] wave when choices {, wave when choices};` -> case. */
  parseSelectedCase() {
    const tok = this.expectKw('with');
    const sel = this.parseExpression();
    this.expectKw('select');
    const matching = this.acceptOp('?');
    const target = this.parseTarget();
    let nonblocking = true;
    if (this.acceptOp(':=')) nonblocking = false;
    else this.expectOp('<=');
    this.acceptKw('guarded');
    const mech = nonblocking ? this.parseDelayMechanism() : null;
    const items = [];
    let def = null;
    const loc = this.loc(tok);
    do {
      const sloc = this.loc();
      let value, delay = null, unaffected = false;
      if (this.acceptKw('unaffected')) unaffected = true;
      else {
        value = this.parseExpression();
        if (this.acceptKw('after')) delay = this.parseExpression();
      }
      this.expectKw('when');
      const choices = this.parseChoices();
      const asg = { kind: 'assign', target, value, nonblocking, delay, loc: sloc };
      if (mech) asg.mech = mech;
      const body = unaffected ? block([], sloc) : block([asg], sloc);
      const real = choices.filter((c) => c !== 'others');
      if (choices.includes('others')) def = body;
      if (real.length) items.push({ choices: real, body });
    } while (this.acceptOp(','));
    this.expectOp(';');
    return { kind: 'case', expr: sel, variant: matching ? 'casex' : 'case', items, default: def, loc };
  }

  parseSelectedAssign(label, loc) {
    const c = this.parseSelectedCase();
    return { kind: 'process', label, sens: 'all', initial: false, decls: [], body: [c], loc };
  }

  /** Choices separated by '|': expr, range, or 'others'. */
  parseChoices() {
    const out = [];
    do {
      if (this.acceptKw('others')) out.push('others');
      else out.push(this.parseChoice());
    } while (this.acceptOp('|'));
    return out;
  }

  parseChoice() {
    const e = this.parseExpression();
    if (this.isKw('to') || this.isKw('downto')) {
      const dir = this.next().value;
      return { range: { left: e, right: this.parseExpression(), dir } };
    }
    if (e.op === 'attr' && (e.attr === 'range' || e.attr === 'reverse_range') && e.args.length === 0) {
      return { range: { of: e.prefix, reverse: e.attr === 'reverse_range' } };
    }
    if (this.isKw('range') && e.op === 'ref') { this.next(); return { range: this.parseRange() }; }
    return e;
  }

  // --- sequential statements -------------------------------------------------
  /** Statements until end / elsif / else / when (not consumed). */
  parseSeqStmts() {
    const out = [];
    while (!this.atEof() && !this.isKw('end') && !this.isKw('elsif') && !this.isKw('else') && !this.isKw('when')) {
      const before = this.i;
      const s = this.guard(() => this.parseSeqStmt(), null);
      if (s) out.push(s);
      if (this.i === before) { this.diag(`unexpected ${this.describe(this.peek())} in sequential statement`); this.next(); }
    }
    return out;
  }

  parseSeqStmt() {
    let label = null;
    if (this.isId() && this.isOp(':', 1)) { label = this.next().value; this.next(); }
    const tok = this.peek();
    const loc = this.loc(tok);
    if (tok.type === 'kw') {
      switch (tok.value) {
        case 'if': return this.parseIf(loc);
        case 'case': return this.parseCase(loc);
        case 'for': case 'while': case 'loop': return this.parseLoop(label, loc);
        case 'exit': case 'next': {
          this.next();
          const target = this.isId() ? this.next().value : null;   // loop label
          const cond = this.acceptKw('when') ? this.parseExpression() : null;
          this.expectOp(';');
          return target ? { kind: tok.value, cond, loc, label: target } : { kind: tok.value, cond, loc };
        }
        case 'wait': return this.parseWait(loc);
        case 'report': {
          this.next();
          const message = this.parseMessage();
          const severity = this.acceptKw('severity') ? this.parseSeverity() : 'note';
          this.expectOp(';');
          return { kind: 'report', message, severity, loc };
        }
        case 'assert': return this.parseAssertStmt();
        case 'return': {
          this.next();
          const value = this.isOp(';') ? null : this.parseExpression();
          if (value && this.isKw('when')) {
            // 2008 `return x when c;` -> if c then return x
            this.next();
            const cond = this.parseExpression();
            this.expectOp(';');
            return { kind: 'if', cond, then: block([{ kind: 'return', value, loc }], loc), else: null, loc };
          }
          this.expectOp(';');
          return { kind: 'return', value, loc };
        }
        case 'null': this.next(); this.expectOp(';'); return { kind: 'null', loc };
        case 'with': return this.parseSelectedCase();
        case 'block': this.fail('block statements are not allowed in sequential code');
        default: this.fail(`unexpected ${this.describe(tok)} in sequential statement`);
      }
    }
    // assignment or procedure call
    const target = this.parseTarget();
    if (this.acceptOp(';')) return this.makeCall(target, tok);
    if (this.acceptOp('<=')) {
      if (this.isId() && (this.peek().value === 'force' || this.peek().value === 'release')) {
        this.warn('force/release are not supported; treated as a plain assignment');
        this.next();
        if (this.isKw('in') || this.isKw('out')) this.next();
      }
      const mech = this.parseDelayMechanism();
      const branches = this.parseConditionalWaveforms();
      this.expectOp(';');
      if (branches.length === 1 && !branches[0].cond) {
        const stmts = waveAssigns(branches[0].wave, target, mech, loc);
        if (stmts.length === 0) return { kind: 'null', loc };
        if (stmts.length === 1) return stmts[0];
        return block(stmts, loc);
      }
      const { value, delay } = this.foldConditional(branches, target, tok);
      const a = { kind: 'assign', target, value, nonblocking: true, delay, loc };
      if (mech) a.mech = mech;
      return a;
    }
    if (this.acceptOp(':=')) {
      let value = this.parseExpression();
      if (this.isKw('when')) {
        // 2008 conditional variable assignment
        const branches = [{ wave: [{ value }], cond: null }];
        while (this.acceptKw('when')) {
          branches[branches.length - 1].cond = this.parseExpression();
          if (!this.acceptKw('else')) break;
          branches.push({ wave: [{ value: this.parseExpression() }], cond: null });
        }
        value = this.foldConditional(branches, target, tok).value;
      }
      this.expectOp(';');
      return { kind: 'assign', target, value, nonblocking: false, delay: null, loc };
    }
    this.fail(`expected '<=', ':=' or ';' but found ${this.describe(this.peek())}`);
  }

  /** Assignment target: a name, or an aggregate (not supported). */
  parseTarget() {
    if (this.isOp('(')) {
      const tok = this.peek();
      const agg = this.parsePrimary();
      this.diag('aggregate assignment targets are not supported', tok);
      return agg;
    }
    if (!this.isId()) this.fail(`expected a name but found ${this.describe(this.peek())}`);
    return this.parseName();
  }

  /** Name used as a statement -> procedure call. std.env.finish -> 'finish'. */
  makeCall(target, tok) {
    const loc = this.loc(tok);
    if (target.op === 'ref') return { kind: 'call', name: target.name, args: [], loc };
    if (target.op === 'apply') return { kind: 'call', name: target.name, args: target.args, loc };
    this.fail('invalid procedure call', tok);
  }

  /** if / elsif / else; elsif chains nest in `else`, only the outermost consumes `end if;`. */
  parseIf(loc, nested = false) {
    if (!this.acceptKw('if')) this.expectKw('elsif');
    const cond = this.parseExpression();
    this.expectKw('then');
    const tloc = this.loc();
    const then = block(this.parseSeqStmts(), tloc);
    let els = null;
    if (this.isKw('elsif')) els = this.parseIf(this.loc(), true);
    else if (this.acceptKw('else')) { const eloc = this.loc(); els = block(this.parseSeqStmts(), eloc); }
    if (!nested) {
      this.expectKw('end');
      this.expectKw('if');
      if (this.isId()) this.next();
      this.expectOp(';');
    }
    return { kind: 'if', cond, then, else: els, loc };
  }

  parseCase(loc) {
    this.expectKw('case');
    const matching = this.acceptOp('?');
    const expr = this.parseExpression();
    this.expectKw('is');
    const items = [];
    let def = null;
    while (this.isKw('when')) {
      this.next();
      const choices = this.guard(() => this.parseChoices(), []);
      this.expectOp('=>');
      const bloc = this.loc();
      const body = block(this.parseSeqStmts(), bloc);
      const real = choices.filter((c) => c !== 'others');
      if (choices.includes('others')) def = body;
      if (real.length) items.push({ choices: real, body });
    }
    this.expectKw('end');
    this.expectKw('case');
    this.acceptOp('?');
    if (this.isId()) this.next();
    this.expectOp(';');
    return { kind: 'case', expr, variant: matching ? 'casex' : 'case', items, default: def, loc };
  }

  parseLoop(label, loc) {
    let head = null;
    if (this.acceptKw('for')) {
      const v = this.expectId('loop parameter');
      this.expectKw('in');
      const range = this.parseRange();
      head = { kind: 'forrange', var: v, range };
    } else if (this.acceptKw('while')) {
      head = { kind: 'while', cond: this.parseExpression() };
    }
    this.expectKw('loop');
    const bloc = this.loc();
    const body = block(this.parseSeqStmts(), bloc);
    this.expectKw('end');
    this.expectKw('loop');
    if (this.isId()) this.next();
    this.expectOp(';');
    const s = head ? { ...head, body, loc } : { kind: 'forever', body, loc };
    if (label) s.label = label;
    return s;
  }

  parseWait(loc) {
    this.expectKw('wait');
    const w = { kind: 'wait', on: null, until: null, for: null, level: false, loc };
    if (this.acceptKw('on')) {
      w.on = [];
      do { w.on.push(this.parseName()); } while (this.acceptOp(','));
    }
    if (this.acceptKw('until')) w.until = this.parseExpression();
    if (this.acceptKw('for')) w.for = this.parseExpression();
    this.expectOp(';');
    return w;
  }

  parseAssertStmt() {
    const tok = this.expectKw('assert');
    const cond = this.parseExpression();
    const message = this.acceptKw('report') ? this.parseMessage() : null;
    const severity = this.acceptKw('severity') ? this.parseSeverity() : 'error';
    this.expectOp(';');
    return { kind: 'assert', cond, message, severity, loc: this.loc(tok) };
  }

  /** report/assert message: strings stay strings. */
  parseMessage() {
    this.strMode++;
    try { return this.parseExpression(); } finally { this.strMode--; }
  }

  parseSeverity() {
    const tok = this.peek();
    const e = this.parseExpression();
    if (e.op === 'ref' && SEVERITIES.has(e.name)) return e.name;
    this.warn('non-constant severity level; using \'error\'', tok);
    return 'error';
  }

  // --- expressions ------------------------------------------------------------
  parseExpression() {
    if (this.isOp('??')) this.next(); // 2008 condition operator: no-op
    let left = this.parseRelation();
    for (;;) {
      const tok = this.peek();
      if (tok.type === 'kw' && LOGICAL[tok.value]) {
        this.next();
        left = bin(LOGICAL[tok.value], left, this.parseRelation());
      } else return left;
    }
  }

  parseRelation() {
    const left = this.parseShift();
    const tok = this.peek();
    if (tok.type === 'op' && RELATIONAL[tok.value]) {
      this.next();
      return bin(RELATIONAL[tok.value], left, this.parseShift());
    }
    return left;
  }

  parseShift() {
    const left = this.parseSimple();
    const tok = this.peek();
    if (tok.type === 'kw' && SHIFT[tok.value]) {
      this.next();
      return bin(SHIFT[tok.value], left, this.parseSimple());
    }
    return left;
  }

  parseSimple() {
    let left;
    if (this.isOp('+') || this.isOp('-')) {
      const o = this.next().value;
      left = { op: 'unary', o, a: this.parseTerm() };
    } else left = this.parseTerm();
    for (;;) {
      if (this.isOp('+') || this.isOp('-')) {
        const o = this.next().value;
        left = bin(o, left, this.parseTerm());
      } else if (this.isOp('&')) {
        this.next();
        const right = this.parseTerm();
        if (left.op === 'concat') left.parts.push(right);
        else left = { op: 'concat', parts: [left, right] };
      } else return left;
    }
  }

  parseTerm() {
    let left = this.parseFactor();
    for (;;) {
      const tok = this.peek();
      const o = (tok.type === 'op' || tok.type === 'kw') ? MULOP[tok.value] : undefined;
      if (o && (tok.type === 'kw' || tok.value === '*' || tok.value === '/')) {
        this.next();
        left = bin(o, left, this.parseFactor());
      } else return left;
    }
  }

  parseFactor() {
    const tok = this.peek();
    if (tok.type === 'kw') {
      if (tok.value === 'not') { this.next(); return { op: 'unary', o: '~', a: this.parsePrimary() }; }
      if (tok.value === 'abs') { this.next(); return { op: 'unary', o: 'abs', a: this.parsePrimary() }; }
      if (UNARY_REDUCE[tok.value]) { this.next(); return { op: 'unary', o: UNARY_REDUCE[tok.value], a: this.parsePrimary() }; }
    }
    const base = this.parsePrimary();
    if (this.acceptOp('**')) return bin('**', base, this.parsePrimary());
    return base;
  }

  parsePrimary() {
    const tok = this.peek();
    switch (tok.type) {
      case 'int': {
        this.next();
        return this.maybePhys({ op: 'int', value: tok.value }, Number(tok.value));
      }
      case 'real': {
        this.next();
        return this.maybePhys({ op: 'real', value: tok.value }, tok.value);
      }
      case 'char': {
        this.next();
        if (LOGIC_CHARS.test(tok.value)) {
          // ch (not enumerable): the character as written, for when a CHARACTER is expected
          return Object.defineProperty({ op: 'lit', bits: mapBits(tok.value), signed: false, sized: true, scalar: true }, 'ch', { value: tok.value });
        }
        return { op: 'str', value: tok.value, char: true };
      }
      case 'str': {
        this.next();
        if (!this.strMode && tok.value.length > 0 && LOGIC_CHARS.test(tok.value)) {
          // text: the literal as written when the bits lose it (e.g. "hw"), for when a string is expected
          const lit = { op: 'lit', bits: mapBits(tok.value), signed: false, sized: true };
          if (/[^01]/.test(tok.value)) lit.text = tok.value;
          return lit;
        }
        return { op: 'str', value: tok.value };
      }
      case 'bitstr': {
        this.next();
        return { op: 'lit', bits: mapBits(tok.value), signed: false, sized: true };
      }
      case 'id':
        return this.parseName();
      case 'op':
        if (tok.value === '(') return this.parseParenOrAggregate();
        break;
      case 'kw':
        if (tok.value === 'null') { this.next(); return { op: 'ref', name: 'null' }; }
        if (tok.value === 'new') this.fail('allocators (new) are not supported');
        break;
      default:
        break;
    }
    this.fail(`expected expression but found ${this.describe(tok)}`);
  }

  /** `10 ns` -> phys */
  maybePhys(lit, num) {
    const tok = this.peek();
    if (tok.type === 'id' && Object.prototype.hasOwnProperty.call(TIME_UNITS, tok.value)) {
      this.next();
      const [unit, mul] = TIME_UNITS[tok.value];
      return { op: 'phys', value: num * mul, unit };
    }
    return lit;
  }

  parseParenOrAggregate() {
    this.expectOp('(');
    const items = [];
    do {
      if (this.acceptKw('others')) {
        this.expectOp('=>');
        items.push({ choices: ['others'], value: this.parseExpression() });
        continue;
      }
      const first = this.parseChoice();
      const choices = [first];
      while (this.acceptOp('|')) choices.push(this.isKw('others') ? (this.next(), 'others') : this.parseChoice());
      if (this.acceptOp('=>')) {
        items.push({ choices, value: this.parseExpression() });
      } else {
        if (choices.length > 1 || first.range) this.fail('expected \'=>\' in aggregate');
        items.push({ choices: null, value: first });
      }
    } while (this.acceptOp(','));
    this.expectOp(')');
    if (items.length === 1 && items[0].choices === null) return items[0].value; // parenthesised expr
    return { op: 'aggregate', items };
  }

  /**
   * Name: identifier followed by selections `.x`, calls/indexes `(...)`,
   * attributes `'attr[(args)]` and qualifications `'(expr)`.
   */
  parseName() {
    if (!this.isId()) this.fail(`expected a name but found ${this.describe(this.peek())}`);
    const first = this.next();
    let e = ref(first.value);
    // Drop library / package prefixes: work.pkg.c -> c ; ieee.numeric_std.f -> f ; std.env.finish -> finish.
    // level 2: prefix is a library (next segment is a package), 1: prefix is a package, 0: not droppable.
    let level = this.libraries.has(first.value) ? 2 : this.packageNames.has(first.value) ? 1 : 0;
    for (;;) {
      if (this.isOp('.')) {
        this.next();
        let field;
        if (this.isId()) field = this.next().value;
        else if (this.acceptKw('all')) { continue; }
        else if (this.peek().type === 'str') field = `"${this.next().value.toLowerCase()}"`;
        else if (this.peek().type === 'char') field = `'${this.next().value}'`;
        else this.fail(`expected name after '.' but found ${this.describe(this.peek())}`);
        if (level > 0 && e.op === 'ref') {
          e = ref(field);
          level--;
        } else {
          e = { op: 'field', base: e, name: field };
          level = 0;
        }
        continue;
      }
      if (this.isOp('(')) {
        level = 0;
        e = this.parseCallSuffix(e);
        continue;
      }
      if (this.isOp("'")) {
        // attribute or qualified expression
        if (this.peek(1).type === 'op' && this.peek(1).value === '(') {
          this.next();
          const inner = this.parseParenOrAggregate();
          const type = e.op === 'ref' ? e.name : baseName(e);
          e = { op: 'qualified', type, expr: inner };
          continue;
        }
        const at = this.peek(1);
        if (at.type === 'id' || at.type === 'kw') {
          this.next(); this.next();
          const attr = at.value;
          let args = [];
          if (this.isOp('(') && attr !== 'event' && attr !== 'last_value' && attr !== 'active') {
            this.next();
            args = [];
            do { args.push(this.parseExpression()); } while (this.acceptOp(','));
            this.expectOp(')');
          }
          e = { op: 'attr', prefix: e, attr, args };
          level = 0;
          continue;
        }
        this.fail('expected attribute name after \'');
      }
      return e;
    }
  }

  /** `(args)` after a name: index / slice / call. */
  parseCallSuffix(base) {
    this.expectOp('(');
    const args = [];
    let range = null;
    do {
      if (this.isId() && this.isOp('=>', 1)) {
        const named = this.next().value;
        this.next();
        const value = this.acceptKw('open') ? null : this.parseExpression();
        args.push({ named, value });
        continue;
      }
      if (this.acceptKw('open')) { args.push(null); continue; }
      const e = this.parseExpression();
      if (this.isKw('to') || this.isKw('downto')) {
        const dir = this.next().value;
        range = { left: e, right: this.parseExpression(), dir };
        args.push(range);
        continue;
      }
      args.push(e);
    } while (this.acceptOp(','));
    this.expectOp(')');
    if (range) {
      if (args.length !== 1) this.fail('a slice takes exactly one range');
      return { op: 'slice', base, left: range.left, right: range.right, dir: range.dir };
    }
    if (base.op === 'ref') return { op: 'apply', name: base.name, args };
    // chained: mem(i)(3), r.f(2)
    if (args.length !== 1 || (args[0] && args[0].named)) this.diag('multiple indices on a chained name are not supported');
    return { op: 'index', base, index: args[0] && args[0].named ? args[0].value : args[0] };
  }
}

// --- helpers ------------------------------------------------------------------

function dedupe(a) { return [...new Set(a)]; }

function baseName(e) {
  while (e && (e.op === 'index' || e.op === 'slice' || e.op === 'field')) e = e.base;
  if (!e) return null;
  return e.op === 'apply' || e.op === 'ref' ? e.name : null;
}

function isRealRange(r) {
  return r && !r.of && (r.left.op === 'real' || r.right.op === 'real' ||
    (r.left.op === 'unary' && r.left.a.op === 'real'));
}

/** Map a VHDL type mark (+ optional constraint) to an IR TypeSpec. */
function makeType(name, range, hasRange) {
  if (SCALAR_LOGIC.has(name)) return { kind: 'logic', range: null, signed: false };
  if (VECTOR_LOGIC.has(name)) {
    const t = { kind: 'logic', range: hasRange ? range : null, signed: name.endsWith('signed') && !name.endsWith('unsigned') };
    if (!hasRange || !range) t.unconstrained = true;
    // the non-numeric array types (std_logic_vector / bit_vector) keep their type mark: their
    // arithmetic depends on the use clauses (std_logic_unsigned / std_logic_signed)
    if (!name.endsWith('signed')) t.mark = name === 'bit_vector' ? 'bit_vector' : 'std_logic_vector';
    return t;
  }
  switch (name) {
    case 'integer': return { kind: 'integer', range: hasRange ? range : null };
    case 'natural': return { kind: 'integer', range: hasRange ? range : { left: int(0), right: int(INT_MAX), dir: 'to' } };
    case 'positive': return { kind: 'integer', range: hasRange ? range : { left: int(1), right: int(INT_MAX), dir: 'to' } };
    case 'boolean': return { kind: 'boolean' };
    case 'time': case 'delay_length': return { kind: 'time' };
    case 'string': return { kind: 'string' };
    case 'real': return { kind: 'real' };
    default: {
      const t = { kind: 'named', name };
      if (hasRange && range) t.range = range;
      return t;
    }
  }
}

/** generate_for init/cond/step from a range. */
function forRangeParts(v, range) {
  const vr = ref(v);
  if (range && !range.of) {
    const down = range.dir === 'downto';
    return {
      init: range.left,
      cond: bin(down ? '>=' : '<=', vr, range.right),
      step: bin(down ? '-' : '+', vr, int(1)),
    };
  }
  const of = range ? range.of : ref('?');
  const rev = range && range.reverse;
  return {
    init: { op: 'attr', prefix: of, attr: rev ? 'high' : 'low', args: [] },
    cond: bin(rev ? '>=' : '<=', vr, { op: 'attr', prefix: of, attr: rev ? 'low' : 'high', args: [] }),
    step: bin(rev ? '-' : '+', vr, int(1)),
  };
}

/** Merge package-body decls into package decls (bodies replace declarations, deferred constants get values). */
function mergePackageDecls(into, decls) {
  for (const d of decls) {
    const idx = into.findIndex((x) => x.name === d.name && x.kind === d.kind &&
      (d.kind !== 'function' || (x.declOnly && sameParams(x, d))));
    if (idx >= 0 && d.kind === 'function') {
      if (d.declOnly) continue;
      into[idx] = d;
    } else if (idx >= 0 && d.kind === 'const' && into[idx].value === null) {
      into[idx] = { ...into[idx], value: d.value, type: into[idx].type || d.type };
    } else {
      into.push(d);
    }
  }
}

function sameParams(a, b) {
  if (a.params.length !== b.params.length) return false;
  return a.params.every((p, k) => p.name === b.params[k].name);
}
