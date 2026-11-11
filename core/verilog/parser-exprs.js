// Silinx - the Verilog parser's expressions (#405: out of core/verilog/parser.js): binary operators by precedence,
// unary ones, primaries (literals, names, concatenations, calls, the conditional operator) and their postfixes.
import { BIN_PREC, SYS_NOARG, Sync, UNARY } from './parser-defs.js';
import { basedToBits } from './lexer.js';

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const exprMethods = {
  // ---------------- expressions ----------------
  // (a chain c0 ? a0 : c1 ? a1 : …, nesting in its else as deep as it is long: read in a loop, #3375)
  expr() {
    const conds = [];
    let e = this.binary(0);
    while (this.accept('?')) {
      const a = this.expr(); this.expect(':');
      conds.push([e, a]);
      e = this.binary(0);
    }
    for (let i = conds.length - 1; i >= 0; i--) e = { op: 'cond', cond: conds[i][0], then: conds[i][1], else: e };
    return e;
  },

  binary(level) {
    if (level >= BIN_PREC.length) return this.unary();
    let left = this.binary(level + 1);
    const ops = BIN_PREC[level];
    while (this.tok.t === 'op' && ops.includes(this.tok.v)) {
      const o = this.next().v;
      const right = o === '**' ? this.binary(level) : this.binary(level + 1);
      left = { op: 'binary', o, a: left, b: right };
    }
    return left;
  },

  unary() {
    if (this.tok.t === 'op' && UNARY.has(this.tok.v)) {
      const o = this.next().v;
      const a = this.unary();
      if (o === '+') return a;
      if (o === '-' && (a.op === 'int')) return { op: 'int', value: a.value.startsWith('-') ? a.value.slice(1) : '-' + a.value };
      return { op: 'unary', o, a };
    }
    return this.primary();
  },

  primary() {
    const t = this.tok;
    if (t.t === 'int') {
      this.next();
      // SystemVerilog size cast: 8'(expr)
      if (this.tok.t === 'cast') { this.next(); this.expect('('); const e = this.expr(); this.expect(')'); return { op: 'call', name: '$__size_cast', args: [{ op: 'int', value: t.v }, e] }; }
      return { op: 'int', value: t.v };
    }
    if (t.t === 'real') { this.next(); return { op: 'real', value: t.v }; }
    if (t.t === 'based') { this.next(); const { bits, sized } = basedToBits(t); return { op: 'lit', bits, signed: t.signed, sized }; }
    if (t.t === 'fill') { this.next(); return { op: 'fill', bit: t.v }; }
    if (t.t === 'str') { this.next(); return { op: 'str', value: t.v }; }
    if (t.t === 'sys') {
      // a $name without arguments that no system function has: an identifier (Yosys)
      if (!this.is('(', this.peek()) && !SYS_NOARG.has(t.v)) { this.next(); return { op: 'ref', name: t.v }; }
      this.next();
      const args = [];
      if (this.accept('(')) { if (!this.is(')')) do { args.push(this.expr()); } while (this.accept(',')); this.expect(')'); }
      return { op: 'call', name: t.v, args };
    }
    if (this.is('(')) {
      this.next(); const e = this.expr(); this.expect(')');
      return e;
    }
    if (this.is('{')) {
      this.next();
      const first = this.expr();
      if (this.is('{')) { // replication
        this.next();
        const parts = [];
        do { parts.push(this.expr()); } while (this.accept(','));
        this.expect('}'); this.expect('}');
        return { op: 'repl', count: first, value: parts.length === 1 ? parts[0] : { op: 'concat', parts } };
      }
      const parts = [first];
      while (this.accept(',')) parts.push(this.expr());
      this.expect('}');
      return this.postfix({ op: 'concat', parts });
    }
    // a cast to a type: my_t'(e), int'(e), signed'(e)
    if ((t.t === 'id' || this.is('signed') || this.is('unsigned')) && this.peek().t === 'cast') {
      this.next(); this.next(); this.expect('(');
      const e = this.expr(); this.expect(')');
      return { op: 'call', name: '$__type_cast', args: [{ op: 'ref', name: t.v }, e] };
    }
    if (t.t === 'id') {
      const name = this.hierName(), path = this.hierPath;
      if (this.is('(')) {
        this.next();
        const args = [];
        if (!this.is(')')) do { args.push(this.expr()); } while (this.accept(','));
        this.expect(')');
        return path ? { op: 'call', name, args, path } : { op: 'call', name, args };
      }
      return this.postfix(path ? { op: 'ref', name, path } : { op: 'ref', name });
    }
    this.error(`unexpected '${t.v || t.t}' in expression`);
    throw new Sync();
  },

  postfix(base) {
    while (this.is('[')) {
      this.next();
      const a = this.expr();
      if (this.accept(':')) {
        const b = this.expr(); this.expect(']');
        base = { op: 'slice', base, left: a, right: b };
      } else if (this.is('+:') || this.is('-:')) {
        const dir = this.next().v[0];
        const width = this.expr(); this.expect(']');
        base = { op: 'pslice', base, start: a, width, dir };
      } else {
        this.expect(']');
        base = { op: 'index', base, index: a };
      }
    }
    return base;
  }
};
