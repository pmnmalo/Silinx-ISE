// The VHDL parser's declarations (#405: out of parser.js): declarative parts and their items (signals, constants,
// variables, types and subtypes, components, attributes, aliases, subprograms), subtype indications and ranges, as
// methods of the parser (Object.assign(Parser.prototype, declarationMethods) in parser.js).
import { DECL_KWS, STD_LIBS } from './parse-defs.js';
import { isRealRange, makeType } from './parse-helpers.js';

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const declarationMethods = {
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
  },

  isDeclStart() {
    const tok = this.peek();
    if (tok.type !== 'kw') return false;
    if (DECL_KWS.has(tok.value)) return true;
    if (tok.value === 'for' && this.isId(1) || tok.value === 'for' && this.isKw('all', 1)) {
      // configuration specification `for u1 : comp use ...;` vs. for-generate (`lbl: for`)
      return true;
    }
    return false;
  },

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
        const name = this.expectId('component name');
        this.region?.names.push({ name, what: 'component', line: tok.line });
        this.acceptKw('is');
        if (this.acceptKw('generic')) this.guard(() => { this.parseGenericList(); this.expectOp(';'); });
        // (its ports kept apart from the declarations, for the architecture: their defaults are those of an instance's
        // open inputs, #963)
        let ports = [];
        if (this.acceptKw('port')) this.guard(() => { ports = this.parsePortList(); this.expectOp(';'); });
        this.expectKw('end');
        this.endOf('component');
        (this.components ||= []).push({ name, ports });
        return [];
      }
      case 'pure': case 'impure': case 'function': case 'procedure': {
        const f = this.parseSubprogram(uses);
        return f ? [f] : [];
      }
      case 'attribute': {
        // attribute declaration `attribute name : type_mark;` or specification
        // `attribute name of names : entity_class is expression;` - neither is analysed
        this.next();
        this.expectId('attribute name');
        if (this.acceptOp(':')) {
          this.parseSubtypeIndication();
        } else {
          this.expectKw('of');
          while (!this.atEof() && !this.isOp(':') && !this.isOp(';')) this.next();
          this.expectOp(':');
          this.next();   // the entity class: signal, entity, label…
          this.expectKw('is');
          this.parseExpression();
        }
        this.expectOp(';');
        return [];
      }
      case 'disconnect': case 'group': {
        this.skipDecl();
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
        if ((!this.isOp(';') && !this.atLineEnd()) || (signature && target.op !== 'ref')) {
          this.warn('unsupported alias declaration (ignored)', tok);
          this.sync();
          return [];
        }
        this.expectOp(';');
        if (signature) return [{ kind: 'subalias', name, target: target.name, loc: this.loc(tok) }];
        return [{ kind: 'alias', name, type, target, loc: this.loc(tok) }];
      }
      case 'file': {
        // file f : TEXT [open write_mode] is "name"; : an object procedures take as a file parameter;
        // what is written to it is not kept (textio writes are ignored)
        this.next();
        const names = this.parseIdList();
        this.expectOp(':');
        const type = this.parseSubtypeIndication();
        // VHDL-93: [open read_mode | write_mode | append_mode] is "name"; VHDL-87: is [in | out] "name"
        let mode = 'read_mode', ext = null;
        while (!this.atEof() && !this.isOp(';') && !this.declEndsLine()) {
          const t = this.next();
          if (t.type === 'id' && /^(read|write|append)_mode$/i.test(t.value)) mode = t.value.toLowerCase();
          else if (t.type === 'kw' && t.value === 'out') mode = 'write_mode';
          else if (t.type === 'str' && ext === null) ext = t.value;
        }
        this.expectOp(';');
        return names.map((name) => ({ kind: 'file', name, type, mode, ext, loc: this.loc(tok) }));
      }
      case 'use': {
        uses.push(...this.parseUseClause());
        return [];
      }
      case 'for': {
        // configuration specification - ignored
        this.skipDecl();
        if (this.isKw('end') && this.isKw('for', 1)) { this.next(); this.next(); this.expectOp(';'); }
        return [];
      }
      default:
        this.fail(`unexpected ${this.describe(tok)} in declarative part`);
    }
    return [];
  },

  parseTypeDecl() {
    const tok = this.expectKw('type');
    const name = this.expectId('type name');
    if (this.isOp(';') || this.declEndsLine()) { // incomplete
      this.expectOp(';');
      return { kind: 'type', name, type: { kind: 'named', name }, loc: this.loc(tok) };
    }
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
      // (an unconstrained index, `natural range <>`, keeps its subtype's name: a constant's value takes its bounds, #2548)
      const ranges = [], index = [];
      do {
        index.push(this.isId() && this.isKw('range', 1) && this.isOp('<>', 2) ? this.peek().value : null);
        ranges.push(this.parseIndexSubtype());
      } while (this.acceptOp(','));
      this.expectOp(')');
      this.expectKw('of');
      let elem = this.parseSubtypeIndication();
      for (let k = ranges.length - 1; k >= 0; k--) elem = { kind: 'array', range: ranges[k], elem, ...(index[k] ? { index: index[k] } : {}) };
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
  },

  /** Array index: `0 to 7`, `natural range <>`, `t_enum`, `integer range 0 to 3`. */
  parseIndexSubtype() {
    if (this.isId() && this.isKw('range', 1) && this.isOp('<>', 2)) {
      this.next(); this.next(); this.next();
      return null;
    }
    return this.parseRange();
  },

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
    let pkg = null;
    if (this.libraries?.has(name) && !STD_LIBS.has(name)) {
      if (this.acceptOp('.')) {
        pkg = this.expectId('package name');
      }
    } else if (this.packageNames?.has(name)) {
      pkg = name;
    }
    while (this.acceptOp('.')) name = this.expectId('type name');
    if (this.isId()) {
      // `resolved std_ulogic` : first name is a resolution function
      name = this.next().value;
      pkg = null;
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
    return makeType(name, range, hasRange, pkg);
  },

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
  },

  parseSubprogram(uses) {
    const tok = this.peek();
    // (purity: 'pure' / 'impure' when written; a function is pure by default, #185)
    const purity = this.acceptKw('pure') ? 'pure' : this.acceptKw('impure') ? 'impure' : null;
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
    if (this.isOp(';') || this.declEndsLine() && !this.bodyFollows(name)) {
      this.expectOp(';');
      return { kind: 'function', name, params, returnType, decls: [], body: [], retVar: undefined, loc: this.loc(tok), declOnly: true, ...(purity ? { purity } : {}) };
    }
    this.expectKw('is');
    if (this.isKw('new')) { this.warn('subprogram instantiation is not supported'); this.sync(); return null; }
    const { decls, body, end } = this.inRegion(() => {
      const decls = this.parseDeclarativePart(uses);
      this.expectKw('begin');
      return { decls, body: this.parseSeqStmts(), end: this.expectKw('end') };
    });
    this.acceptKw('function') || this.acceptKw('procedure');
    if (this.isId() || this.peek().type === 'str') this.next();
    this.expectOp(';');
    // (endLoc: its `end`, where ISE reports a function that is not pure)
    return { kind: 'function', name, params, returnType, decls, body, retVar: undefined, loc: this.loc(tok), endLoc: this.loc(end), ...(purity ? { purity } : {}) };
  },

  parseParamList() {
    this.expectOp('(');
    const params = [];
    const earlier = [];   // (a default must not use them, #3744)
    for (;;) {
      this.guardList(() => {
        const tok = this.peek();
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
        const def = this.acceptOp(':=') ? this.parseInterfaceDefault(earlier, 'parameter', names) : null;
        earlier.push(...names.map(name => ({ name, what: 'parameter', line: tok.line })));
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
};
