// The VHDL parser's sequential statements (#405: out of parser.js): statement lists, assignments and calls, if,
// case, loops, wait, assert and report, as methods of the parser (Object.assign(Parser.prototype, sequentialMethods)
// in parser.js).
import { SEVERITIES, block, waveAssigns } from './parse-defs.js';

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const sequentialMethods = {
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
  },

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
          const target = this.isId() && !this.atLineEnd() ? this.next().value : null;   // loop label (not the next line's statement)
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
    if (this.isOp(';') || this.callEndsLine()) { this.expectOp(';'); return this.makeCall(target, tok); }
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
  },

  /** Assignment target: a name, or a positional aggregate of names (VHDL-2008: a concatenation target). */
  parseTarget() {
    if (this.isOp('(')) {
      const tok = this.peek();
      const agg = this.parsePrimary();
      if (agg.op === 'aggregate' && agg.items.every((it) => !it.choices)) return { op: 'concat', parts: agg.items.map((it) => it.value) };
      this.diag('aggregate assignment targets with choices are not supported', tok);
      return agg;
    }
    if (!this.isId()) this.fail(`expected a name but found ${this.describe(this.peek())}`);
    return this.parseName();
  },

  /** Name used as a statement -> procedure call. std.env.finish -> 'finish'. */
  makeCall(target, tok) {
    const loc = this.loc(tok);
    const pkg = target.pkg;
    if (target.op === 'ref') return { kind: 'call', name: target.name, ...(pkg ? { pkg } : {}), args: [], loc };
    if (target.op === 'apply') return { kind: 'call', name: target.name, ...(pkg ? { pkg } : {}), args: target.args, loc };
    this.fail('invalid procedure call', tok);
  },

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
  },

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
  },

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
  },

  parseWait(loc) {
    this.expectKw('wait');
    const w = { kind: 'wait', on: null, until: null, for: null, level: false, loc };
    if (this.acceptKw('on')) {
      w.on = [];
      do { w.on.push(this.parseName()); } while (this.acceptOp(','));
    }
    if (this.acceptKw('until')) w.until = this.parseExpression();
    // (not a for loop on the next line: `for i in …`)
    if (this.isKw('for') && !(this.isId(1) && this.isKw('in', 2))) { this.next(); w.for = this.parseExpression(); }
    this.expectOp(';');
    return w;
  },

  parseAssertStmt() {
    const tok = this.expectKw('assert');
    const cond = this.parseExpression();
    const message = this.acceptKw('report') ? this.parseMessage() : null;
    const severity = this.acceptKw('severity') ? this.parseSeverity() : 'error';
    this.expectOp(';');
    return { kind: 'assert', cond, message, severity, loc: this.loc(tok) };
  },

  /** report/assert message: strings stay strings. */
  parseMessage() {
    this.strMode++;
    try { return this.parseExpression(); } finally { this.strMode--; }
  },

  parseSeverity() {
    const tok = this.peek();
    const e = this.parseExpression();
    if (e.op === 'ref' && SEVERITIES.has(e.name)) return e.name;
    this.warn('non-constant severity level; using \'error\'', tok);
    return 'error';
  }
};
