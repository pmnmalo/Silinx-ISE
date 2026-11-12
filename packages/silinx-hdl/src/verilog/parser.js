// Verilog-2001 (+ a few SystemVerilog conveniences) recursive-descent parser producing the Silinx IR.
// See docs/IR.md.
import { tokenize, tokenText } from './lexer.js';
import { ATOMS, GATES, PORT_NETS, SYS_NOARG, Sync, TYPEWORDS, WIRED, lit1 } from './parser-defs.js';
import { itemMethods } from './parser-items.js';
import { stmtMethods } from './parser-stmts.js';
import { exprMethods } from './parser-exprs.js';
import { assertMethods } from './parser-assert.js';
import { nestingMethods } from './parser-nesting.js';
import { genChain } from '../util.js';

// opts.include(name): the text of a project file for `include (null when there is none)
export function parse(source, file = 'input', opts = {}) {
  const errors = [];
  const { tokens, timescale } = tokenize(source, file, errors, { include: opts.include });
  const p = new Parser(tokens, file, errors, timescale);
  // (typedef names of other files: a package's types, so that `w_t x;` reads as a declaration)
  for (const n of opts.typeNames || []) p.typeNames.add(n);
  const units = p.parseFile();
  return { file, lang: 'verilog', units, errors };
}

class Parser {
  constructor(tokens, file, errors, timescale) {
    this.toks = tokens; this.i = 0; this.file = file; this.errors = errors; this.timescale = timescale;
    this.typeNames = new Set();   // typedef names (a declaration may start with one)
    this.genScopes = [];          // generate scopes: the count of their generate constructs
    this.blockDepth = 0;          // inside generate blocks (their declarations are their own)
    this.portNames = new Map();
    this.nesting = 0;             // how deep the expression being read nests (#3395)
    this.stmtNesting = 0;         // how deep the statement being read nests, and its error reported (#3490)
    this.stmtTooDeep = false;
  }
  isWord(v, t = this.tok) { return t.t === 'id' && t.v === v; }
  // does a declaration start here with a data type (not an instance of a module: `bit u1 (…)`)
  isTypeStart() {
    const t = this.tok;
    if (t.t !== 'id') return false;
    if (t.v === 'struct' || t.v === 'enum' || t.v === 'union') return this.peek().t === 'id' || this.is('{', this.peek());
    // p::type_t name / p::type_t [7:0] name
    if (this.is('::', this.peek()) && this.peek(2).t === 'id') { const a = this.peek(3); return a.t === 'id' || this.is('[', a); }
    if (!TYPEWORDS.has(t.v) && !this.typeNames.has(t.v)) return false;
    const p = this.peek();
    if (p.t === 'id') return !this.is('(', this.peek(2));
    return this.is('[', p) || this.is('signed', p) || this.is('unsigned', p);
  }

  // the declarations at the start of a block: its variables, parameters, types
  blockDecls() {
    const decls = [];
    decls.inits = [];
    for (;;) {
      this.skipQualifiers();
      const life = this.lifetime();
      if (this.isAny('reg', 'integer', 'logic', 'real', 'time') || this.isTypeStart()) this.localVars(decls, life);
      else if (this.isAny('parameter', 'localparam')) {
        this.next();
        const { type } = this.paramType();
        do { const loc = this.loc(); const n = this.ident(); this.expect('='); decls.push({ kind: 'const', name: n, type, value: this.expr(), loc }); } while (this.accept(','));
        this.expect(';');
      } else if (this.isWord('typedef')) this.typedef(decls);
      else break;
    }
    for (const d of decls) if (d.kind === 'signal') d.net = 'variable';
    return decls;
  }
  // the index of the ']' closing the '[' at token k (-1: none)
  closeBracket(k) {
    for (let d = 0; k < this.toks.length; k++) {
      const t = this.toks[k];
      if (t.t === 'eof') return -1;
      if (this.is('[', t)) d++;
      else if (this.is(']', t) && --d === 0) return k;
    }
    return -1;
  }
  get tok() { return this.toks[this.i]; }
  peek(k = 1) { return this.toks[Math.min(this.i + k, this.toks.length - 1)]; }
  loc(t = this.tok) { return { line: t.line, col: t.col }; }
  is(v, t = this.tok) { return (t.t === 'op' || t.t === 'kw') && t.v === v; }
  isAny(...vs) { return vs.some(v => this.is(v)); }
  next() { const t = this.tok; if (t.t !== 'eof') this.i++; return t; }
  accept(v) { if (this.is(v)) { return this.next(); } return null; }
  error(msg, t = this.tok, sev = 'error') {
    this.errors.push({ file: this.file, line: t.line, col: t.col, message: msg, severity: sev });
  }
  expect(v) {
    if (this.is(v)) return this.next();
    // a ';' missing at the end of a line: reported after the last token of that line, and parsing
    // goes on as if it were there (no cascade of errors)
    const prev = this.i > 0 ? this.toks[this.i - 1] : null;
    if (v === ';' && prev && this.tok.line > prev.line) {
      // (the token as written: 4'd1, 1.5e3, "text")
      const written = tokenText(this.toks, prev);
      const text = written === undefined ? `'${prev.v ?? prev.t}'` : prev.t === 'str' ? written : `'${written}'`;
      this.error(`expected ';' after ${text}`, { line: prev.line, col: prev.end ?? prev.col + String(prev.v ?? '').length });
      return prev;
    }
    this.error(`expected '${v}' but found '${this.tok.v || this.tok.t}'`);
    throw new Sync();
  }
  ident() {
    const t = this.tok;
    if (t.t === 'id') { this.next(); return t.v; }
    // (Yosys: an identifier may start with $, e.g. its cells $__SHREG_DFF_P_ or a wire $tmp)
    if (t.t === 'sys' && !SYS_NOARG.has(t.v)) { this.next(); return t.v; }
    this.error(`expected identifier but found '${t.v || t.t}'`);
    throw new Sync();
  }
  // skip to after the next ';' (or stop before one of the stop keywords)
  sync(stops = []) {
    while (this.tok.t !== 'eof') {
      if (this.is(';')) { this.next(); return; }
      if (stops.some(s => this.is(s))) return;
      this.next();
    }
  }

  parseFile() {
    const units = [];
    // the compilation unit's own declarations (SystemVerilog): typedefs, functions, tasks,
    // parameters outside any module; every module of the file sees them
    const unitDecls = [], unitItems = [], unitUses = [];
    while (this.tok.t !== 'eof') {
      if (this.is('module') || this.is('macromodule')) {
        try { units.push(this.module()); }
        catch (e) {
          if (!(e instanceof Sync)) throw e;
          while (this.tok.t !== 'eof' && !this.is('endmodule')) this.next();
          this.accept('endmodule');
        }
      } else if (this.isAny('function', 'task', 'localparam', 'parameter') || this.isWord('typedef')) {
        this.cur = { params: [] };
        this.moduleItem(unitItems, unitDecls, false);
      } else if (this.isWord('package')) {
        try { units.push(this.packageUnit()); }
        catch (e) {
          if (!(e instanceof Sync)) throw e;
          while (this.tok.t !== 'eof' && !this.isWord('endpackage')) this.next();
          this.next();
        }
      } else if (this.isWord('import')) {
        // an import in the compilation unit: every module after it sees the package's names
        try { this.importDecl(unitUses); } catch (e) { if (!(e instanceof Sync)) throw e; this.sync(); }
      } else {
        this.error(`unexpected '${this.tok.v}' outside module`);
        this.next();
      }
    }
    if (unitDecls.length) for (const u of units) if (u.kind === 'module') u.decls = [...unitDecls, ...u.decls];
    if (unitUses.length) for (const u of units) u.uses = [...new Set([...unitUses, ...(u.uses || [])])];
    return units;
  }

  // SystemVerilog package: package p; parameters, typedefs, functions, tasks; endpackage
  packageUnit() {
    const start = this.next();
    const name = this.ident();
    this.expect(';');
    const pkg = { kind: 'package', name, lang: 'verilog', file: this.file, loc: this.loc(start), decls: [], uses: [] };
    if (this.timescale) pkg.timescale = this.timescale;
    const items = [];
    this.cur = { params: [], uses: pkg.uses };
    while (!this.isWord('endpackage') && this.tok.t !== 'eof') {
      if (this.isWord('import')) { this.importDecl(pkg.uses); continue; }
      this.moduleItem(items, pkg.decls, false);
    }
    this.expectWord('endpackage');
    if (this.accept(':')) this.ident();
    // (a package's parameters are constants: nothing overrides them)
    for (const pr of this.cur.params) pkg.decls.push({ kind: 'const', name: pr.name, type: pr.type, value: pr.default, loc: pr.loc });
    return pkg;
  }
  // import p::*; / import p::name, q::*; : the packages whose names a scope sees (a named import
  // is read as importing the whole package)
  importDecl(uses) {
    this.next();
    do {
      const pn = this.ident();
      this.expect('::');
      if (!this.accept('*')) this.ident();
      if (!uses.includes(pn)) uses.push(pn);
    } while (this.accept(','));
    this.expect(';');
  }
  expectWord(w) { if (this.isWord(w)) return this.next(); this.error(`expected '${w}' but found '${this.tok.v || this.tok.t}'`); throw new Sync(); }

  // generate scopes (the module, each generate block): an unnamed generate block is named
  // genblk<n>, n the number of its generate construct in the scope (IEEE 1364-2005 12.4.3), with
  // zeros after "genblk" while that name is declared in the scope
  beginGenScope() { this.genScopes.push({ n: 0, autos: [] }); }
  endGenScope(items, decls, extra = []) {
    const s = this.genScopes.pop();
    if (!s.autos.length) return;
    const names = new Set(extra);
    for (const d of decls) if (d.name) names.add(d.name);
    const visit = its => {
      for (const it of its) {
        if (it.kind === 'instance') names.add(it.name.replace(/\[.*$/, ''));
        if (it.kind === 'generate_if' || it.kind === 'generate_for') {
          for (const g of genChain(it)) {
            if (g.label && !g.autoLabel) names.add(g.label);
            if (g.elseLabel && !g.autoElse) names.add(g.elseLabel);
          }
        }
      }
    };
    visit(items);
    for (const { node, key, n } of s.autos) {
      let name = `genblk${n}`;
      while (names.has(name)) name = `genblk0${name.slice(6)}`;
      node[key] = name;
    }
  }
  autoLabel(node, key, n) {
    node[key === 'label' ? 'autoLabel' : 'autoElse'] = true;
    this.genScopes[this.genScopes.length - 1]?.autos.push({ node, key, n });
  }

  // ---------------- module ----------------
  module() {
    const start = this.next();
    const name = this.ident();
    const mod = {
      kind: 'module', name, lang: 'verilog', file: this.file, loc: this.loc(start),
      params: [], ports: [], decls: [], items: [], uses: [],
    };
    if (this.timescale) mod.timescale = this.timescale;
    this.cur = mod;
    this.portNames = new Map();
    this.portExprSigs = new Map();   // explicit port expressions .p(x): x -> its ports
    this.portExprDecls = new Map();  // x -> its declaration (from its input / output declaration)
    this.wildPorts = false;          // module m(...)
    while (this.isWord('import')) this.importDecl(mod.uses);   // module m import p::*; #(…) (…);
    if (this.accept('#')) {
      this.expect('(');
      if (!this.is(')')) {
        let kind = 'parameter';
        do {
          if (this.is('parameter') || this.is('localparam')) kind = this.next().v;
          const { type } = this.paramType();
          const ploc = this.loc();
          const pn = this.ident();
          // (SystemVerilog: a parameter of the port list may have no default; the instance sets it)
          const def = this.accept('=') ? this.expr() : null;
          mod.params.push({ name: pn, type, default: def, local: kind === 'localparam', loc: ploc });
        } while (this.accept(','));
      }
      this.expect(')');
    }
    if (this.accept('(')) {
      // module m(...): its ports are every input / output / inout the body declares (Yosys)
      if (this.is('...') || (this.is('.') && this.is('.', this.peek()) && this.is('.', this.toks[this.i + 2] || {}))) {
        if (this.is('...')) this.next(); else { this.next(); this.next(); this.next(); }
        this.wildPorts = true;
      } else if (!this.is(')')) {
        if (this.isAny('input', 'output', 'inout')) this.ansiPorts(mod);
        else {
          do {
            if (this.is('.')) { this.explicitPort(mod); continue; }
            const pn = this.ident();
            const port = { name: pn, dir: 'in', type: { kind: 'logic', range: null, signed: false }, default: null, loc: this.loc(), declared: false };
            mod.ports.push(port); this.portNames.set(pn, port);
          } while (this.accept(','));
        }
      }
      this.expect(')');
    }
    this.expect(';');
    this.beginGenScope();
    while (!this.is('endmodule') && this.tok.t !== 'eof') this.moduleItem(mod.items, mod.decls, true);
    this.endGenScope(mod.items, mod.decls, mod.ports.map(p => p.name));
    this.expect('endmodule');
    if (this.accept(':')) this.ident();
    this.finishExplicitPorts(mod);
    for (const p of mod.ports) {
      if (p.declared === false) this.error(`port '${p.name}' has no direction declaration`, { line: p.loc.line, col: p.loc.col });
      delete p.declared;
      // a supply0 / supply1 port: a net driven by a constant
      if (p.net === 'supply0' || p.net === 'supply1') mod.items.push({ kind: 'assign', target: { op: 'ref', name: p.name }, value: lit1(p.net === 'supply1' ? '1' : '0'), delay: null, loc: p.loc });
      // output wire y = e: a continuous assignment (a net declaration assignment)
      if (p.default && p.dir === 'out' && p.isNet) { mod.items.push({ kind: 'assign', target: { op: 'ref', name: p.name }, value: p.default, delay: null, loc: p.loc }); p.default = null; }
      delete p.isNet;
    }
    return mod;
  }

  // the net kind and the type of a port declaration, after its direction
  // (isNet: a net, not a variable: a net keyword, or no data type at all; the `= value` of an
  // output net is a continuous assignment, of a variable its initial value)
  portType() {
    let net = 'wire', isNet = true;
    if (this.isAny(...PORT_NETS) || this.isWord('var')) { net = this.next().v; isNet = !['reg', 'logic', 'var'].includes(net); }
    if (this.isAny('logic', 'reg')) { this.next(); if (net === 'wire' && isNet && this.toks[this.i - 2].v !== 'wire') isNet = false; }
    const t = this.tok;
    // (a port named like a type: input bit, …)
    if (t.t === 'id' && (TYPEWORDS.has(t.v) || this.typeNames.has(t.v)) && [',', ')', ';', '='].includes(this.peek().v)) return { net, isNet, type: { kind: 'logic', range: null, signed: false } };
    if (net === 'wire' && (this.isAny('integer', 'time', 'real', 'realtime') || (t.t === 'id' && (TYPEWORDS.has(t.v) || this.typeNames.has(t.v) || t.v === 'struct' || t.v === 'enum'))) && this.toks[this.i - 1].v !== 'wire') isNet = false;
    return { net, isNet, type: this.dataType() };
  }

  ansiPorts(mod) {
    let dir = 'in', type = null, net = 'wire', isNet = true;
    do {
      if (this.isAny('input', 'output', 'inout')) {
        const d = this.next().v;
        dir = d === 'input' ? 'in' : d === 'output' ? 'out' : 'inout';
        ({ net, type, isNet } = this.portType());
      }
      const loc = this.loc();
      const pn = this.ident();
      let t = type;
      const dims = this.unpackedDims();
      for (let k = dims.length - 1; k >= 0; k--) t = { kind: 'array', range: dims[k], elem: t };
      let def = null;
      if (this.accept('=')) def = this.expr();
      const port = { name: pn, dir, type: t, default: def, loc, net, isNet };
      if (WIRED[net]) port.wired = WIRED[net];
      if (this.portNames.has(pn)) { this.error(`port '${pn}' is declared twice`, this.toks[this.i - 1]); continue; }
      mod.ports.push(port); this.portNames.set(pn, port);
    } while (this.accept(','));
  }

  paramType() {
    if (this.is('integer')) { this.next(); return { type: { kind: 'integer', range: null } }; }
    if (this.is('real')) { this.next(); return { type: { kind: 'real' } }; }
    // a data type before the name: parameter logic [3:0] P, parameter int N, parameter my_t P
    if (this.isAny('logic', 'reg') || ((this.isTypeStart() || this.isWord('struct') || this.isWord('enum')) && !this.is('=', this.peek()))) {
      this.accept('logic') || this.accept('reg');
      return { type: this.dataType() };
    }
    const signed = !!this.accept('signed');
    this.accept('unsigned');
    const range = this.optRange();
    // (signed without a range: the range of the value, signedOnly)
    return { type: range || signed ? { kind: 'logic', range, signed, ...(range ? {} : { signedOnly: true }) } : null };
  }

  optRange() {
    if (!this.is('[')) return null;
    this.next();
    const left = this.expr(); this.expect(':'); const right = this.expr();
    this.expect(']');
    return { left, right, dir: null };
  }

  // packed dimensions: [7:0][3:0] (the first is the outermost)
  packedDims() {
    const dims = [];
    while (this.is('[')) dims.push(this.optRange());
    return dims;
  }

  // unpacked dimensions of a declared name: [0:3], [16] (SystemVerilog: 16 elements, 0 to 15)
  unpackedDims() {
    const dims = [];
    while (this.is('[')) {
      this.next();
      const left = this.expr();
      if (this.accept(':')) { const right = this.expr(); this.expect(']'); dims.push({ left, right, dir: null }); continue; }
      this.expect(']');
      dims.push({ left: { op: 'int', value: '0' }, right: { op: 'binary', o: '-', a: left, b: { op: 'int', value: '1' } }, dir: null });
    }
    return dims;
  }

  // A data type (after a net or variable keyword, if any): [signed | unsigned] [packed dimensions];
  // SystemVerilog: bit, int, shortint, longint, byte, a typedef name with packed dimensions,
  // struct packed { … }, enum [base type] { … }. The IR types: logic (range, signed, inner: the
  // packed dimensions after the first), integer, named (name, dims), struct (fields), svenum.
  dataType() {
    if (this.accept('integer') || this.accept('time')) return { kind: 'integer', range: null };
    if (this.isAny('real', 'realtime')) { this.next(); return { kind: 'real' }; }
    const t = this.tok;
    if (t.t === 'id' && ATOMS[t.v]) {
      this.next();
      const unsigned = !!this.accept('unsigned');
      this.accept('signed');
      if (t.v === 'int' && !unsigned) return { kind: 'integer', range: null };
      return { kind: 'logic', range: { left: { op: 'int', value: String(ATOMS[t.v] - 1) }, right: { op: 'int', value: '0' }, dir: null }, signed: !unsigned };
    }
    if (this.isWord('struct') || this.isWord('union')) return this.structType();
    if (this.isWord('enum')) return this.enumType();
    if (t.t === 'id' && this.is('::', this.peek()) && this.peek(2).t === 'id') {   // p::type_t
      this.next(); this.next();
      const n = `${t.v}::${this.ident()}`;
      const dims = this.packedDims();
      return { kind: 'named', name: n, ...(dims.length ? { dims } : {}) };
    }
    if (t.t === 'id' && this.typeNames.has(t.v)) {
      this.next();
      const dims = this.packedDims();
      return { kind: 'named', name: t.v, ...(dims.length ? { dims } : {}) };
    }
    if (this.isWord('bit')) this.next();
    const signed = !!this.accept('signed');
    this.accept('unsigned');
    const dims = this.packedDims();
    const ty = { kind: 'logic', range: dims[0] || null, signed };
    if (dims.length > 1) ty.inner = dims.slice(1);
    return ty;
  }

  // struct packed [signed] { type name, name; … } [packed dimensions]: the first member is the
  // most significant (an unpacked struct is read as a packed one; a union is not supported)
  structType() {
    const loc = this.loc();
    const union = this.isWord('union');   // a packed union: every member at bit 0
    this.next();
    if (union && this.isWord('tagged')) { this.error('tagged unions are not supported'); throw new Sync(); }
    this.isWord('packed') && this.next();
    const signed = !!this.accept('signed');
    this.accept('unsigned');
    this.expect('{');
    const fields = [];
    while (!this.is('}') && this.tok.t !== 'eof') {
      if (this.isWord('rand') || this.isWord('randc')) this.next();
      this.accept('logic') || this.accept('reg') || this.accept('wire');
      const type = this.dataType();
      do { fields.push({ name: this.ident(), type }); } while (this.accept(','));
      this.expect(';');
    }
    this.expect('}');
    const dims = this.packedDims();
    return { kind: 'struct', fields, signed, loc, ...(union ? { union: true } : {}), ...(dims.length ? { dims } : {}) };
  }

  // enum [base type] { A, B = 5, C } : the names are constants of the base type (int by
  // default), each one more than the one before unless it is given a value
  enumType() {
    this.next();
    let base = null;
    if (!this.is('{')) { this.accept('logic') || this.accept('reg'); base = this.dataType(); }
    this.expect('{');
    const items = [];
    do {
      const loc = this.loc();
      const name = this.ident();
      // name ranges (IEEE 1800-2017 6.19.2): S[3] is S0, S1, S2; S[2:4] is S2, S3, S4 (integer
      // literals); a value given is the first name's
      if (this.accept('[')) {
        const num = () => { const t = this.tok; if (t.t !== 'int' || !/^\d+$/.test(String(t.v))) { this.error('an enum name range needs integer literals'); throw new Sync(); } this.next(); return Number(t.v); };
        let a = num(), b;
        if (this.accept(':')) b = num(); else { b = a - 1; a = 0; }
        this.expect(']');
        const value = this.accept('=') ? this.expr() : null;
        const step = a <= b ? 1 : -1;
        for (let k = a, first = true; step > 0 ? k <= b : k >= b; k += step, first = false) items.push({ name: `${name}${k}`, value: first ? value : null, loc });
        continue;
      }
      items.push({ name, value: this.accept('=') ? this.expr() : null, loc });
    } while (this.accept(','));
    this.expect('}');
    const dims = this.packedDims();
    return { kind: 'svenum', base, items, ...(dims.length ? { dims } : {}) };
  }

  // typedef <data type> name [unpacked dimensions];
  typedef(decls) {
    const loc = this.loc();
    this.next();
    this.accept('logic') || this.accept('reg') || this.accept('wire');
    let type = this.dataType();
    const name = this.ident();
    const dims = this.unpackedDims();
    for (let k = dims.length - 1; k >= 0; k--) type = { kind: 'array', range: dims[k], elem: type };
    this.expect(';');
    this.typeNames.add(name);
    decls.push({ kind: 'type', name, type, loc });
  }

  // Parses one module/generate item, appending to items/decls.
  // SystemVerilog qualifiers before a declaration: rand / randc (randomization, not modelled), const
  // (a variable that is not assigned again): read as the declaration itself
  skipQualifiers() {
    while ((this.isWord('rand') || this.isWord('randc') || this.isWord('const')) && (this.peek().t === 'kw' || this.peek().t === 'id')) this.next();
  }
  moduleItem(items, decls, topLevel) {
    const t = this.tok;
    try {
      if (this.accept(';')) return;
      this.skipQualifiers();
      if (this.isAny('input', 'output', 'inout')) return this.portDecl();
      if (this.isAny('wire', 'reg', 'logic', 'integer', 'tri', 'supply0', 'supply1', 'genvar', 'time', 'real', 'realtime', ...Object.keys(WIRED)) || this.isTypeStart())
        return this.netDecl(items, decls, this.blockDepth > 0);
      if (this.isWord('typedef')) return this.typedef(decls);
      if (this.isWord('import') && this.peek().t === 'id' && this.is('::', this.peek(2))) return this.importDecl(this.cur.uses || (this.cur.uses = []));
      if (this.is('specify')) {   // specify blocks (path delays, timing checks): ignored by simulation
        while (!this.is('endspecify') && this.tok.t !== 'eof') this.next();
        this.expect('endspecify');
        return;
      }
      if (this.isWord('specparam')) {   // specify parameters: constants (used by specify blocks)
        this.next();
        this.optRange();
        do {
          const loc = this.loc();
          const pn = this.ident(); this.expect('=');
          let value = this.expr();
          if (this.accept(':')) { value = this.expr(); this.expect(':'); this.expr(); }   // min:typ:max: typ
          decls.push({ kind: 'const', name: pn, type: null, value, loc });
        } while (this.accept(','));
        this.expect(';');
        return;
      }
      // concurrent assertions (assert property (@(posedge clk) …);): processes (parser-assert.js)
      if (this.isConcurrentAssertion()) return this.concurrentAssertion(items, decls);
      // elaboration system tasks ($info, $warning, $error, $fatal): messages of the elaboration
      if (t.t === 'sys' && ['$info', '$warning', '$error', '$fatal'].includes(t.v)) {
        const loc = this.loc();
        this.next();
        const args = [];
        if (this.accept('(')) { if (!this.is(')')) do { args.push(this.expr()); } while (this.accept(',')); this.expect(')'); }
        this.expect(';');
        items.push({ kind: 'elabtask', name: t.v, args, loc });
        return;
      }
      if (this.is('event')) {   // named events: 1-bit variables toggled by `-> e`
        this.next();
        do { const loc = this.loc(); decls.push({ kind: 'signal', name: this.ident(), type: { kind: 'logic', range: null, signed: false }, init: { op: 'lit', bits: '0', signed: false, sized: true }, net: 'reg', loc }); } while (this.accept(','));
        this.expect(';');
        return;
      }
      if (this.isAny('parameter', 'localparam')) {
        const local = this.next().v === 'localparam' || !topLevel;
        const { type } = this.paramType();
        do {
          const ploc = this.loc();
          const pn = this.ident(); this.expect('=');
          const value = this.expr();
          if (local) decls.push({ kind: 'const', name: pn, type, value, loc: this.loc(t) });
          else this.cur.params.push({ name: pn, type, default: value, local: false, loc: ploc });
        } while (this.accept(','));
        this.expect(';');
        return;
      }
      if (this.is('assign')) {
        this.next();
        let delay = null;
        if (this.accept('#')) delay = this.delayValue();
        do {
          const loc = this.loc();
          const target = this.lvalue(); this.expect('=');
          items.push({ kind: 'assign', target, value: this.expr(), delay, loc });
        } while (this.accept(','));
        this.expect(';');
        return;
      }
      if (this.isAny('always', 'always_ff', 'always_comb', 'always_latch')) return items.push(this.always());
      if (this.is('initial')) {
        const loc = this.loc(); this.next();
        return items.push({ kind: 'process', label: null, sens: null, initial: true, decls: [], body: [this.stmt()], loc });
      }
      if (this.is('generate')) {
        this.next();
        while (!this.is('endgenerate') && this.tok.t !== 'eof') this.moduleItem(items, decls, false);
        this.expect('endgenerate');
        return;
      }
      // generate constructs: numbered in their scope (the names of their unnamed blocks); one in another one level
      // deeper, as statements: at most MAX_NESTING (#3490)
      if (this.isAny('for', 'if', 'case')) return this.deeperStmt(() => {
        const n = this.genScopes.length ? ++this.genScopes[this.genScopes.length - 1].n : 0;
        if (this.is('for')) return items.push(this.genFor(n));
        if (this.is('if')) return items.push(this.genIf(n));
        return items.push(this.genCase(n));
      });
      if (this.is('begin')) return this.deeperStmt(() => { // bare generate block
        const blk = this.genBlock();
        items.push({ kind: 'generate_if', label: blk.label, cond: { op: 'int', value: '1' }, then: blk.items, else: [], decls: blk.decls, loc: this.loc(t) });
      });
      if (this.is('function') || this.is('task')) return decls.push(this.funcDecl());
      if (this.is('defparam')) {   // defparam u1.P = v, u1.u2.Q = w;
        this.next();
        do {
          const loc = this.loc();
          const path = this.hierName(); this.expect('=');
          items.push({ kind: 'defparam', path, value: this.expr(), loc });
        } while (this.accept(','));
        this.expect(';');
        return;
      }
      if (t.t === 'kw' && GATES.has(t.v)) return this.gateInst(items);
      if (t.t === 'id' || (t.t === 'sys' && !SYS_NOARG.has(t.v) && (this.is('#', this.peek()) || this.peek().t === 'id'))) return this.instance(items);
      this.error(`unexpected '${t.v || t.t}' in module body`);
      throw new Sync();
    } catch (e) {
      if (!(e instanceof Sync)) throw e;
      if (this.i === this.toks.indexOf(t)) this.next();
      this.sync(['endmodule', 'end', 'endgenerate']);
    }
  }

  // an explicit port of a non-ANSI header, .name(expression) (the signals of the expression declared
  // in the body: input x; reg [3:0] y; …); the expression: a signal, a part of it, a concatenation
  explicitPort(mod) {
    this.next();
    const loc = this.loc();
    const pn = this.ident();
    this.expect('(');
    const expr = this.is(')') ? null : this.expr();
    this.expect(')');
    if (!expr) { this.error(`port '${pn}': an unconnected explicit port .${pn}() is not supported`, loc); return; }
    const refs = [];
    const walk = e => {
      if (e.op === 'ref') refs.push(e.name);
      else if (e.op === 'concat') e.parts.forEach(walk);
      else if ((e.op === 'slice' || e.op === 'index') && e.base?.op === 'ref') refs.push(e.base.name);
      else { this.error(`port '${pn}': an explicit port is a signal, a part of one or a concatenation of them`, loc); refs.length = 0; return; }
    };
    walk(expr);
    if (!refs.length) return;
    if (this.portNames.has(pn)) { this.error(`port '${pn}' is declared twice`, loc); return; }
    const port = { name: pn, dir: 'in', type: { kind: 'logic', range: null, signed: false }, default: null, loc, declared: false, explicit: expr };
    mod.ports.push(port); this.portNames.set(pn, port);
    for (const r of refs) { if (!this.portExprSigs.has(r)) this.portExprSigs.set(r, []); this.portExprSigs.get(r).push(port); }
  }

  // after the body: the direction and the width of each explicit port, and the assignment that joins
  // it to its expression (input: expression = port; output: port = expression)
  finishExplicitPorts(mod) {
    for (const port of mod.ports) {
      if (!port.explicit) continue;
      const e = port.explicit;
      delete port.explicit;
      const sigs = [...this.portExprSigs].filter(([, ps]) => ps.includes(port)).map(([n]) => n);
      const dirs = new Set(sigs.map(n => this.portExprDecls.get(n)?.dir).filter(Boolean));
      if (dirs.size > 1) { this.error(`port '${port.name}': its signals have different directions`, port.loc); port.declared = true; continue; }
      if (!dirs.size) continue;   // (no direction declared: reported below)
      port.dir = [...dirs][0];
      if (port.dir === 'inout') { this.error(`port '${port.name}': an explicit inout port is not supported`, port.loc); port.declared = true; continue; }
      port.declared = true;
      const d0 = this.portExprDecls.get(sigs[0]);
      if (e.op === 'ref') port.type = d0.type;
      else {
        // the width: the sum of the parts' (from their declared ranges: constants of the module)
        const B = (o, x, y) => ({ op: 'binary', o, a: x, b: y }), one = { op: 'int', value: '1' };
        const span = (l, r) => ({ op: 'cond', cond: B('>=', l, r), then: B('+', B('-', l, r), one), else: B('+', B('-', r, l), one) });
        const width = x => {
          if (x.op === 'concat') return x.parts.map(width).reduce((u, v) => B('+', u, v));
          if (x.op === 'index') return one;
          if (x.op === 'slice') return span(x.left, x.right);
          const t = this.portExprDecls.get(x.name)?.type;
          return t?.range ? span(t.range.left, t.range.right) : one;
        };
        port.type = { kind: 'logic', range: { left: B('-', width(e), one), right: { op: 'int', value: '0' }, dir: null }, signed: false };
      }
      port.net = 'wire'; port.isNet = true;
      const pref = { op: 'ref', name: port.name };
      mod.items.push(port.dir === 'in'
        ? { kind: 'assign', target: e, value: pref, delay: null, loc: port.loc }
        : { kind: 'assign', target: pref, value: e, delay: null, loc: port.loc });
    }
  }

  portDecl() {
    const d = this.next().v;
    const dir = d === 'input' ? 'in' : d === 'output' ? 'out' : 'inout';
    const { net, type, isNet } = this.portType();
    do {
      const loc = this.loc();
      const pn = this.ident();
      // a signal of an explicit port expression: a signal of the module, its direction noted
      if (!this.portNames.has(pn) && this.portExprSigs.has(pn)) {
        let t = type;
        const dims = this.unpackedDims();
        for (let k = dims.length - 1; k >= 0; k--) t = { kind: 'array', range: dims[k], elem: t };
        const decl = { kind: 'signal', name: pn, type: t, init: null, net: isNet ? 'wire' : 'reg', loc };
        if (this.accept('=')) decl.init = this.expr();
        this.cur.decls.push(decl);
        this.portExprDecls.set(pn, { dir, type: t, decl });
        continue;
      }
      let port = this.portNames.get(pn);
      if (!port && this.wildPorts) {   // module m(...): a port, in the order of the declarations
        port = { name: pn, dir, type, default: null, loc, declared: false };
        this.cur.ports.push(port); this.portNames.set(pn, port);
      }
      if (!port) {
        this.error(`'${pn}' is not in the port list`, this.toks[this.i - 1]);
        port = { name: pn, dir, type, default: null, loc };
      }
      let t = type;
      const dims = this.unpackedDims();
      for (let k = dims.length - 1; k >= 0; k--) t = { kind: 'array', range: dims[k], elem: t };
      port.dir = dir; port.type = t; port.declared = true; port.net = net; port.isNet = isNet;
      if (WIRED[net]) port.wired = WIRED[net];
      if (this.accept('=')) port.default = this.expr();
    } while (this.accept(','));
    this.expect(';');
  }

  // local: a declaration in a function, task or block (never the module port of that name)
  netDecl(items, decls, local = false) {
    // (a declaration that starts with its data type, int x / my_t y: a variable)
    const kw = this.tok.t === 'id' ? 'logic' : this.next().v;
    if (kw === 'genvar') { do { this.ident(); } while (this.accept(',')); this.expect(';'); return; }
    let type;
    if (kw === 'integer' || kw === 'time') type = { kind: 'integer', range: null };
    else if (kw === 'real' || kw === 'realtime') type = { kind: 'real' };
    else {
      if (this.isAny('reg', 'logic', 'wire')) this.next();
      if (this.isWord('var')) this.next();
      type = this.dataType();
    }
    const net = kw === 'reg' || kw === 'logic' || kw === 'integer' || kw === 'time' || kw === 'real' ? 'reg' : 'wire';
    const wired = WIRED[kw];
    do {
      const loc = this.loc();
      const name = this.ident();
      let t = type;
      const dims = this.unpackedDims();   // memory dimensions: m [0:1][0:3] is 2 arrays of 4; m [16]: 0 to 15
      for (let k = dims.length - 1; k >= 0; k--) t = { kind: 'array', range: dims[k], elem: t };
      let init = null;
      if (this.accept('=')) init = this.expr();
      const pe = local ? null : this.portExprDecls.get(name);
      if (pe) {
        if (type.range || type.kind !== 'logic') { pe.decl.type = t; pe.type = t; }
        pe.decl.net = net;
        if (init) pe.decl.init = init;
        continue;
      }
      const port = local ? null : this.portNames.get(name);
      if (port) {
        // `output q; reg [3:0] q;` -> refine the port declaration
        if ((type.range || type.kind !== 'logic') && !port.type.range) port.type = type;
        if (type.signed) port.type = { ...port.type, signed: true };
        port.net = kw === 'logic' ? 'logic' : net;
        if (wired) port.wired = wired;
        if (kw === 'supply0' || kw === 'supply1') port.net = kw;
        if (init) items.push({ kind: 'process', label: null, sens: null, initial: true, decls: [], body: [{ kind: 'assign', target: { op: 'ref', name }, value: init, nonblocking: false, delay: null }], loc });
        continue;
      }
      if (net === 'wire' && init) {
        decls.push({ kind: 'signal', name, type: t, init: null, net, loc, ...(wired ? { wired } : {}) });
        items.push({ kind: 'assign', target: { op: 'ref', name }, value: init, delay: null, loc });
      } else {
        if (kw === 'supply0') init = { op: 'int', value: '0' };
        if (kw === 'supply1') init = { op: 'lit', bits: '1', signed: false, sized: true };
        const d = { kind: 'signal', name, type: t, init, net, loc };
        if (wired) d.wired = wired;
        decls.push(d);
      }
    } while (this.accept(','));
    this.expect(';');
  }

  always() {
    const loc = this.loc();
    const kw = this.next().v;
    let sens = null;
    if (kw === 'always_comb' || kw === 'always_latch') sens = 'all';
    else if (this.is('@')) {
      this.next();
      sens = this.eventList();
    }
    const body = this.stmt();
    return { kind: 'process', label: null, sens, initial: false, decls: [], body: [body], loc };
  }

  eventList() {
    if (this.accept('*')) return 'all';
    if (this.tok.t === 'id' && !this.is('(')) return [{ edge: 'any', expr: this.primary() }];
    this.expect('(');
    if (this.accept('*')) { this.expect(')'); return 'all'; }
    const evs = [];
    do {
      let edge = 'any';
      if (this.accept('posedge')) edge = 'pos';
      else if (this.accept('negedge')) edge = 'neg';
      evs.push({ edge, expr: this.expr() });
    } while (this.accept('or') || this.accept(','));
    this.expect(')');
    return evs;
  }
}
// (its generate blocks, functions and instances, statements and expressions: parser-items.js, parser-stmts.js, parser-exprs.js)
Object.assign(Parser.prototype, itemMethods, stmtMethods, exprMethods, assertMethods, nestingMethods);
