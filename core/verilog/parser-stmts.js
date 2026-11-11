// Silinx - the Verilog parser's statements (#405: out of core/verilog/parser.js): blocks, assignments, if / case /
// loops, event and delay controls, task calls (hierarchical too), the lvalues and hierarchical names.
import { ASSERTIONS, SYS_NOARG, Sync } from './parser-defs.js';
import { assertStmt } from './parser-assert.js';

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const stmtMethods = {
  // ---------------- statements ----------------
  stmt() {
    const t = this.tok;
    const loc = this.loc();
    const s = this.stmtInner();
    if (s && !s.loc) s.loc = loc;
    return s;
  },

  stmtInner() {
    const t = this.tok;
    try {
      if (this.accept(';')) return { kind: 'null' };
      // SystemVerilog return [expression]; (a function's value / leaving a task)
      if (this.isWord('return') && !this.is('=', this.peek()) && !this.is('<=', this.peek())) {
        this.next();
        const value = this.is(';') ? null : this.expr();
        this.expect(';');
        return { kind: 'return', value };
      }
      // a statement label (SystemVerilog name: statement): the name of a block
      if (t.t === 'id' && this.is(':', this.peek()) && !this.is(':', this.peek(2))) {
        this.next(); this.next();
        const s = this.stmt();
        if (s && s.kind === 'block' && !s.label) s.label = t.v;
        return s;
      }
      // immediate assertions: assert (e) [pass] [else fail]; a false, x or z value fails
      if (t.t === 'id' && ASSERTIONS.has(t.v) && (this.is('(', this.peek()) || this.isWord('property', this.peek()) || this.isWord('final', this.peek()) || this.is('#', this.peek()))) {
        this.next();
        if (this.isWord('property') || this.isWord('final') || this.is('#') || t.v === 'cover' || t.v === 'restrict') {   // (not checked)
          let depth = 0;
          while (this.tok.t !== 'eof' && !(depth === 0 && this.is(';'))) {
            if (this.is('(')) depth++;
            else if (this.is(')')) depth--;
            this.next();
          }
          this.expect(';');
          return { kind: 'null' };
        }
        this.expect('(');
        const cond = this.expr(); this.expect(')');
        const pass = this.is('else') ? null : this.stmt();
        const fail = this.accept('else') ? this.stmt() : null;
        return assertStmt(t.v, cond, pass, fail, this.loc(t));
      }
      if (this.is('begin')) {
        this.next();
        let label = null;
        if (this.accept(':')) label = this.ident();
        const decls = this.blockDecls();
        // a missing 'end' must not loop forever: stop at 'endmodule' or a module item (assign, always…,
        // an instance) and on a statement that consumes nothing
        const stmts = [...decls.inits];
        delete decls.inits;
        while (!this.isAny('end', 'endmodule', 'assign', 'always', 'always_ff', 'always_comb', 'always_latch', 'initial', 'module') && !this.isInstanceStart() && this.tok.t !== 'eof') { const i0 = this.i; stmts.push(this.stmt()); if (this.i === i0) break; }
        this.expect('end');
        if (this.accept(':')) this.ident();
        return { kind: 'block', label, decls, stmts };
      }
      if (this.is('fork')) {
        // fork ... join | join_any | join_none (the last two SystemVerilog): each statement is a thread
        this.next();
        let label = null;
        if (this.accept(':')) label = this.ident();
        const decls = this.blockDecls(), stmts = [...decls.inits];
        delete decls.inits;
        const isEnd = () => this.is('join') || (this.tok.t === 'id' && (this.tok.v === 'join_any' || this.tok.v === 'join_none'));
        while (!isEnd() && !this.isAny('end', 'endmodule') && this.tok.t !== 'eof') stmts.push(this.stmt());
        let join = 'all';
        if (this.tok.t === 'id' && this.tok.v === 'join_any') { this.next(); join = 'any'; }
        else if (this.tok.t === 'id' && this.tok.v === 'join_none') { this.next(); join = 'none'; }
        else this.expect('join');
        if (this.accept(':')) this.ident();
        return { kind: 'fork', label, decls, stmts, join };
      }
      if (this.is('if')) return this.ifChain();
      if (this.isAny('case', 'casez', 'casex')) {
        const variant = this.next().v;
        this.expect('(');
        const expr = this.expr(); this.expect(')');
        const items = []; let def = null;
        while (!this.is('endcase') && this.tok.t !== 'eof') {
          if (this.accept('default')) { this.accept(':'); def = this.stmt(); continue; }
          const choices = [];
          do { choices.push(this.expr()); } while (this.accept(','));
          this.expect(':');
          items.push({ choices, body: this.stmt() });
        }
        this.expect('endcase');
        return { kind: 'case', expr, variant, items, default: def };
      }
      if (this.is('for')) {
        this.next(); this.expect('(');
        // for (int k = 0; ...) / for (integer k = 0; ...): a loop variable of the loop's own
        const local = !!(this.accept('integer') || (this.tok.t === 'id' && this.tok.v === 'int' && this.peek().t === 'id' && this.next()));
        const iv = this.ident(); this.expect('=');
        const init = { kind: 'assign', target: { op: 'ref', name: iv }, value: this.expr(), nonblocking: false, delay: null };
        this.expect(';');
        const cond = this.expr(); this.expect(';');
        const sv = this.ident();
        const step = { kind: 'assign', target: { op: 'ref', name: sv }, value: this.stepValue(sv), nonblocking: false, delay: null };
        this.expect(')');
        const loop = { kind: 'for', init, cond, step, body: this.stmt() };
        if (!local) return loop;
        return { kind: 'block', label: null, decls: [{ kind: 'signal', name: iv, type: { kind: 'integer', range: null }, init: null, net: 'variable' }], stmts: [loop] };
      }
      if (this.is('while')) { this.next(); this.expect('('); const cond = this.expr(); this.expect(')'); return { kind: 'while', cond, body: this.stmt() }; }
      if (this.is('repeat')) { this.next(); this.expect('('); const count = this.expr(); this.expect(')'); return { kind: 'repeat', count, body: this.stmt() }; }
      if (this.is('forever')) { this.next(); return { kind: 'forever', body: this.stmt() }; }
      if (this.is('#')) {
        this.next();
        const amount = this.delayValue();
        return { kind: 'delay', amount, stmt: this.is(';') ? (this.next(), null) : this.stmt() };
      }
      if (this.is('@')) {
        this.next();
        const events = this.eventList();
        return { kind: 'event', events, stmt: this.is(';') ? (this.next(), null) : this.stmt() };
      }
      if (this.is('wait') && this.is('fork', this.peek())) { this.next(); this.next(); this.expect(';'); return { kind: 'waitfork' }; }
      if (this.is('wait')) {
        this.next(); this.expect('(');
        const until = this.expr(); this.expect(')');
        const w = { kind: 'wait', on: null, until, for: null, level: true };
        if (this.accept(';')) return w;
        return { kind: 'block', label: null, decls: [], stmts: [w, this.stmt()] };
      }
      if (this.is('disable') && this.is('fork', this.peek())) { this.next(); this.next(); this.expect(';'); return { kind: 'disablefork' }; }
      if (this.is('disable')) {   // disable <named block | task>
        this.next();
        const label = this.hierName();
        this.expect(';');
        return { kind: 'disable', label };
      }
      if (this.is('->')) {   // trigger a named event (toggles its variable)
        this.next();
        const name = this.hierName();
        this.expect(';');
        const ref = { op: 'ref', name };
        return { kind: 'assign', target: ref, value: { op: 'unary', o: '~', a: ref }, nonblocking: false, delay: null };
      }
      if (t.t === 'sys' && (SYS_NOARG.has(t.v) || !['=', '<=', '['].some(v => this.is(v, this.peek())))) {
        this.next();
        const args = [];
        if (this.accept('(')) {
          if (!this.is(')')) do { args.push(this.is(',') ? { op: 'str', value: '' } : this.expr()); } while (this.accept(','));
          this.expect(')');
        }
        this.expect(';');
        return { kind: 'call', name: t.v, args };
      }
      if (t.t === 'id' && (this.endsCall(this.i + 1) || (this.peek().v === '(' && this.isTaskCall()) || (this.peek().v === '.' && this.isHierTaskCall()))) {
        const name = this.hierName(), path = this.hierPath; const args = [];
        if (this.accept('(')) { if (!this.is(')')) do { args.push(this.expr()); } while (this.accept(',')); this.expect(')'); }
        this.expect(';');
        return { kind: 'call', name, args, ...(path ? { path } : {}) };
      }
      // assignment
      const target = this.lvalue();
      if (this.is('++') || this.is('--')) {
        const o = this.next().v[0];
        this.expect(';');
        return { kind: 'assign', target, value: { op: 'binary', o, a: target, b: { op: 'int', value: '1' } }, nonblocking: false, delay: null };
      }
      for (const [co, o] of [['+=', '+'], ['-=', '-'], ['*=', '*'], ['/=', '/'], ['%=', '%'], ['|=', '|'], ['&=', '&'], ['^=', '^'], ['<<=', '<<'], ['>>=', '>>'], ['<<<=', '<<<'], ['>>>=', '>>>']]) {
        if (this.accept(co)) { const v = this.expr(); this.expect(';'); return { kind: 'assign', target, value: { op: 'binary', o, a: target, b: v }, nonblocking: false, delay: null }; }
      }
      let nonblocking = false;
      if (this.accept('<=')) nonblocking = true; else this.expect('=');
      let delay = null;
      if (this.accept('#')) delay = this.delayValue();
      if (this.is('@')) { this.error('intra-assignment event control is not supported'); throw new Sync(); }
      const value = this.expr();
      this.expect(';');
      return { kind: 'assign', target, value, nonblocking, delay };
    } catch (e) {
      if (!(e instanceof Sync)) throw e;
      this.sync(['end', 'endcase', 'endmodule', 'endfunction', 'endtask', 'join']);
      return { kind: 'null' };
    }
  },

  // if … else if … else: the chain read in a loop, not one call per else if (a chain of thousands of them, #2577);
  // it nests in else as before, each else if at its own location, and an error in an else if's condition makes
  // that else a null statement, as a statement of its own would
  ifChain() {
    const ifs = [];
    let els = null, loc = null;
    for (;;) {
      let cond;
      try {
        this.next(); this.expect('(');
        cond = this.expr(); this.expect(')');
      } catch (e) {
        if (!(e instanceof Sync) || !ifs.length) throw e;
        this.sync(['end', 'endcase', 'endmodule', 'endfunction', 'endtask', 'join']);
        els = { kind: 'null', loc };
        break;
      }
      const s = { kind: 'if', cond, then: this.stmt(), else: null };
      if (loc) s.loc = loc;
      ifs.push(s);
      if (!this.accept('else')) break;
      if (this.is('if')) { loc = this.loc(); continue; }
      els = this.stmt();
      break;
    }
    for (let k = ifs.length - 1; k >= 0; k--) { ifs[k].else = els; els = ifs[k]; }
    return els;
  },

  // id '(' ... ')' ';' at statement level is a task call (not an assignment target)
  isTaskCall() {
    let depth = 0, k = this.i + 1;
    for (; k < this.toks.length; k++) {
      const t = this.toks[k];
      if (t.v === '(') depth++;
      else if (t.v === ')') { depth--; if (depth === 0) break; }
      if (t.t === 'eof') return false;
    }
    return this.endsCall(k + 1);
  },

  // a module instance here: `name #(…` or `name inst (` (never a statement)
  isInstanceStart() {
    if (this.tok.t !== 'id') return false;
    return this.is('#', this.peek()) || (this.peek().t === 'id' && this.is('(', this.peek(2)));
  },

  // after a task call: its ';', or the next statement on a later line (the ';' is missing)
  endsCall(k) {
    const t = this.toks[k];
    if (this.is(';', t)) return true;
    const starts = t.t === 'id' || t.t === 'kw' || t.t === 'sys' || ['#', '@', '->', '{'].some(v => this.is(v, t));
    return starts && t.line > this.toks[k - 1].line;
  },

  // a.b.t(…); / blk[1].t; at statement level: a call of a task of another scope
  isHierTaskCall() {
    let k = this.i + 1;
    for (;;) {
      const t = this.toks[k];
      if (this.is('.', t) && this.toks[k + 1].t === 'id') { k += 2; continue; }
      if (this.is('[', t)) { const e = this.closeBracket(k); if (e < 0) return false; k = e + 1; continue; }
      break;
    }
    if (this.endsCall(k)) return true;
    if (!this.is('(', this.toks[k])) return false;
    const save = this.i;
    this.i = k - 1;
    const r = this.isTaskCall();
    this.i = save;
    return r;
  },

  lvalue() {
    if (this.is('{')) {
      this.next();
      const parts = [];
      do { parts.push(this.lvalue()); } while (this.accept(','));
      this.expect('}');
      return { op: 'concat', parts };
    }
    const name = this.hierName();
    return this.postfix(this.hierPath ? { op: 'ref', name, path: this.hierPath } : { op: 'ref', name });
  },

  // a name, or a hierarchical name: a.b.c, blk[2].x, blk[i - 1].x (an instance of a generate loop,
  // an element of an array of structures). The text is the name (blk[2].x); this.hierPath is the
  // list of its parts { name, index } when an index is not a number (else null).
  hierName() {
    let n = this.ident();
    while (this.is('::') && this.peek().t === 'id') { this.next(); n += '::' + this.ident(); }   // p::name
    const path = [{ name: n, index: null }];
    let dyn = false;
    for (;;) {
      if (this.is('.') && this.peek().t === 'id') { this.next(); const s = this.ident(); n += '.' + s; path.push({ name: s, index: null }); continue; }
      if (this.is('[')) {
        const k = this.closeBracket(this.i);
        if (k > 0 && this.is('.', this.toks[k + 1]) && this.toks[k + 2].t === 'id') {
          this.next();
          const e = this.expr(); this.expect(']');
          path[path.length - 1].index = e;
          if (e.op === 'int') n += `[${e.value}]`;
          else { n += '[*]'; dyn = true; }
          continue;
        }
      }
      this.hierPath = dyn ? path : null;
      return n;
    }
  }
};
