// The VHDL parser's concurrent statements (#405: out of parser.js): processes, concurrent assertions and
// assignments, generate (for, if, case), blocks, instances, waveforms and choices, the labels' regions (#192), as
// methods of the parser (Object.assign(Parser.prototype, concurrentMethods) in parser.js).
import { baseName, bin } from './nodes.js';
import { block, waveAssigns } from './parse-defs.js';
import { declaredNames, labelErrors } from './labels.js';
import { forRangeParts, guardItems } from './parse-helpers.js';

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const concurrentMethods = {
  // --- concurrent statements -------------------------------------------------
  /**
   * Parse concurrent statements until `end` / `elsif` / `else` / `when` (not consumed).
   * Declarations found in flattened blocks are appended to `decls`.
   */
  parseConcurrentItems(decls) {
    const items = [];
    while (!this.atEof() && !this.isKw('end') && !this.isKw('elsif') && !this.isKw('else') && !this.isKw('when')) {
      const before = this.i;
      this.sawGuarded = false;
      let res = this.guard(() => this.parseConcurrent(decls), null);
      // `t <= guarded v` in a block with a guard expression: assigned only while GUARD is true
      if (res && this.sawGuarded && this.blockGuard) res = guardItems(res, this.blockGuard);
      if (res) items.push(...res);
      if (this.i === before) { this.diag(`unexpected ${this.describe(this.peek())} in concurrent statement part`); this.next(); }
    }
    return items;
  },

  /** @returns {object[]} items */
  parseConcurrent(decls) {
    const start = this.peek();
    let label = null;
    if (this.isId() && this.isOp(':', 1)) { label = this.next().value; this.next(); }
    const first = this.i;
    const items = this.parseConcurrentStatement(decls, label, start);
    if (label) this.declareLabel(label, start, first, items);
    return items;
  },

  // --- statement labels (#192) ------------------------------------------------
  /** fn(region) in a declarative region of its own (its components, which are not in the IR, and the labels of its statements). */
  inRegion(fn) {
    const outer = this.region;
    const region = this.region = { names: [], labels: [] };
    try { return fn(region); } finally { this.region = outer; }
  },

  /** The labels of a region with the name of one of its declarations (names, and its components): errors, also returned. */
  checkLabels(region, names) {
    const errors = labelErrors(region.labels, [...names, ...region.names], this.file);
    this.errors.push(...errors);
    return errors;
  },

  // The label of the concurrent statement just read (from token `first`), in the region around it.
  // XST reports a redeclaration at the line where the statement ends (a block: at its label).
  declareLabel(name, start, first, items) {
    if (!this.region) return;
    const tok = this.t[first], kw = tok.type === 'kw' ? (tok.value === 'postponed' ? this.t[first + 1].value : tok.value) : null;
    const what = kw === 'block' ? 'block' : kw === 'process' ? 'process' : kw === 'for' || kw === 'if' || kw === 'case' ? 'generate'
      : items[0]?.kind === 'instance' ? 'instance' : kw === 'assert' ? 'assertion'
        : items[0]?.kind === 'process' && items[0].body[0]?.kind === 'call' && kw !== 'with' ? 'procedure call' : 'assignment';
    let at = this.loc(start);
    if (what !== 'block') {
      // the first token of the line of its `;` (one line: the label)
      let j = this.i - 1;
      const line = this.t[j].line;
      if (line !== start.line) { while (j > first && this.t[j - 1].line === line) j--; at = this.loc(this.t[j]); }
    }
    this.region.labels.push({ name, written: start.raw ?? name, what, ...this.loc(start), at });
  },

  parseConcurrentStatement(decls, label, start) {
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
  },

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
    const { decls, body } = this.inRegion(() => {
      const decls = this.parseDeclarativePart(uses);
      this.expectKw('begin');
      return { decls, body: this.parseSeqStmts() };
    });
    this.expectKw('end');
    this.acceptKw('postponed');
    this.expectKw('process');
    if (this.isId()) this.next();
    this.expectOp(';');
    return { kind: 'process', label, sens, initial: false, decls, body, loc };
  },

  parseConcurrentAssert(label, loc) {
    const a = this.parseAssertStmt();
    return { kind: 'process', label, sens: 'all', initial: false, decls: [], body: [a], loc };
  },

  /**
   * Body of a generate: `[decls begin] items end generate [label];` (end not consumed), a region
   * of its own with its parameter `param` (a for-generate's).
   */
  parseGenerateBody(param = null) {
    return this.inRegion((region) => {
      const decls = [];
      if (this.isDeclStart() || this.isKw('begin')) {
        decls.push(...this.parseDeclarativePart([]));
        this.expectKw('begin');
      }
      const names = [...(param ? [param] : []), ...declaredNames(decls)];
      const items = this.parseConcurrentItems(decls);
      this.checkLabels(region, names);
      return { decls, items };
    });
  },

  /** 2008 alternative terminator `end [alt_label];` before elsif / else / when. */
  acceptAltEnd() {
    if (this.isKw('end') && !this.isKw('generate', 1)) {
      this.next();
      if (this.isId()) this.next();
      this.expectOp(';');
    }
  },

  parseForGenerate(label, loc) {
    this.expectKw('for');
    const vt = this.peek();
    const v = this.expectId('generate parameter');
    this.expectKw('in');
    const range = this.parseRange();
    this.expectKw('generate');
    const { decls, items } = this.parseGenerateBody({ name: v, what: 'generate parameter', line: vt.line });
    this.acceptAltEnd();
    this.expectKw('end');
    this.expectKw('generate');
    if (this.isId()) this.next();
    this.expectOp(';');
    const g = { kind: 'generate_for', label, var: v, ...forRangeParts(v, range), decls, items, loc };
    if (!range || range.of) g.range = range;
    return g;
  },

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
  },

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
  },

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
  },

  /** Block statement: flattened into the enclosing region. */
  parseBlock(decls) {
    this.expectKw('block');
    let guardExpr = null;
    if (this.acceptOp('(')) { guardExpr = this.parseExpression(); this.expectOp(')'); }
    const outerGuard = this.blockGuard;
    if (guardExpr) this.blockGuard = guardExpr;
    try { return this.parseBlockRest(decls); } finally { this.blockGuard = outerGuard; }
  },

  parseBlockRest(decls) {
    this.acceptKw('is');
    if (this.isKw('generic') || this.isKw('port')) {
      this.warn('block generics/ports are not supported');
      while (!this.atEof() && !this.isKw('begin') && !this.isDeclStart()) this.next();
    }
    return this.inRegion((region) => {
      const own = this.parseDeclarativePart([]);
      decls.push(...own);
      this.expectKw('begin');
      const items = this.parseConcurrentItems(decls);
      this.expectKw('end');
      this.expectKw('block');
      if (this.isId()) this.next();
      this.expectOp(';');
      this.checkLabels(region, declaredNames(own));
      return items;
    });
  },

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
  },

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
  },

  /** Concurrent signal assignment (simple / conditional) or concurrent procedure call. */
  parseConcurrentAssignOrCall(label, loc) {
    const tok = this.peek();
    const target = this.parseTarget();
    if (this.isOp(';') || this.callEndsLine()) {
      this.expectOp(';');
      const call = this.makeCall(target, tok);
      return [{ kind: 'process', label, sens: 'all', initial: false, decls: [], body: [call], loc }];
    }
    if (!this.isOp('<=')) this.fail(`expected '<=' but found ${this.describe(this.peek())}`);
    this.next();
    if (this.acceptKw('guarded')) this.sawGuarded = true;
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
  },

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
  },

  /** `transport` | `[reject t] inertial` -> 'transport' | { reject: expr } | null (inertial). */
  parseDelayMechanism() {
    if (this.acceptKw('transport')) return 'transport';
    if (this.acceptKw('reject')) { const reject = this.parseExpression(); this.expectKw('inertial'); return { reject }; }
    this.acceptKw('inertial');
    return null;
  },

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
  },

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
  },

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
    if (this.acceptKw('guarded')) this.sawGuarded = true;
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
  },

  parseSelectedAssign(label, loc) {
    const c = this.parseSelectedCase();
    return { kind: 'process', label, sens: 'all', initial: false, decls: [], body: [c], loc };
  },

  /** Choices separated by '|': expr, range, or 'others'. */
  parseChoices() {
    const out = [];
    do {
      if (this.acceptKw('others')) out.push('others');
      else out.push(this.parseChoice());
    } while (this.acceptOp('|'));
    return out;
  },

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
};
