// The VHDL parser's expressions (#405: out of parser.js): an expression, its relations, shifts, sums, terms, factors
// and primaries (names, calls, attributes, aggregates, literals: numbers with their units, bit strings, characters,
// strings), as methods of the parser (Object.assign(Parser.prototype, expressionMethods) in parser.js).
import { ref, int, bin, mapBits, baseName } from './nodes.js';
import { STD_LIBS } from './parse-defs.js';
import { MAX_NESTING, NESTING_MESSAGE } from '../util.js';

const LOGIC_CHARS = /^[01uxzwlhUXZWLH-]*$/;
const TIME_UNITS = { fs: ['fs', 1], ps: ['ps', 1], ns: ['ns', 1], us: ['us', 1], ms: ['ms', 1], sec: ['sec', 1], min: ['sec', 60], hr: ['sec', 3600] };
const LOGICAL = { and: '&', or: '|', xor: '^', xnor: '~^', nand: 'nand', nor: 'nor' };
const UNARY_REDUCE = { and: '&', or: '|', xor: '^', nand: '~&', nor: '~|', xnor: '~^' };
const RELATIONAL = { '=': '==', '/=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=',
  '?=': '==', '?/=': '!=', '?<': '<', '?<=': '<=', '?>': '>', '?>=': '>=' };
const SHIFT = { sll: '<<', srl: '>>', sla: '<<<', sra: '>>>', rol: 'rol', ror: 'ror' };
const MULOP = { '*': '*', '/': '/', mod: 'mod', rem: 'rem' };

export const expressionMethods = {
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
  },

  parseRelation() {
    const left = this.parseShift();
    const tok = this.peek();
    if (tok.type === 'op' && RELATIONAL[tok.value]) {
      this.next();
      const e = bin(RELATIONAL[tok.value], left, this.parseShift());
      if (tok.value === '?=' || tok.value === '?/=') Object.defineProperty(e, 'match', { value: true });
      return e;
    }
    return left;
  },

  parseShift() {
    const left = this.parseSimple();
    const tok = this.peek();
    if (tok.type === 'kw' && SHIFT[tok.value]) {
      this.next();
      return bin(SHIFT[tok.value], left, this.parseSimple());
    }
    return left;
  },

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
  },

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
  },

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
  },

  // (a primary in another, in parentheses, a call, an index or after not / abs, one level deeper: at most MAX_NESTING,
  // #3395)
  parsePrimary() {
    try {
      if (++this.nesting > MAX_NESTING) this.fail(NESTING_MESSAGE);
      return this.primaryAt();
    } finally { this.nesting--; }
  },

  primaryAt() {
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
  },

  /** `10 ns` -> phys */
  maybePhys(lit, num) {
    const tok = this.peek();
    if (tok.type === 'id' && Object.prototype.hasOwnProperty.call(TIME_UNITS, tok.value)) {
      this.next();
      const [unit, mul] = TIME_UNITS[tok.value];
      return { op: 'phys', value: num * mul, unit };
    }
    return lit;
  },

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
  },

  /**
   * Name: identifier followed by selections `.x`, calls/indexes `(...)`,
   * attributes `'attr[(args)]` and qualifications `'(expr)`.
   */
  parseName() {
    if (!this.isId()) this.fail(`expected a name but found ${this.describe(this.peek())}`);
    const first = this.next();
    let e = ref(first.value);
    let pkg = null;
    // Drop library / package prefixes: work.pkg.c -> c ; ieee.numeric_std.f -> f ; std.env.finish -> finish.
    // level 2: prefix is a library (next segment is a package), 1: prefix is a package, 0: not droppable.
    let level = this.libraries.has(first.value) ? 2 : this.packageNames.has(first.value) ? 1 : 0;
    if (level === 1) pkg = first.value;
    for (;;) {
      if (this.isOp('.')) {
        this.next();
        let field;
        if (this.isId()) field = this.next().value;
        else if (this.acceptKw('all')) { continue; }
        else if (this.peek().type === 'str') field = `"${this.next().value.toLowerCase()}"`;
        else if (this.peek().type === 'char') field = `'${this.next().value}'`;
        else this.fail(`expected name after '.' but found ${this.describe(this.peek())}`);
        if (level === 2) {
          if (!STD_LIBS.has(first.value)) pkg = field;
          else e = ref(field);
          level = 1;
        } else if (level === 1) {
          e = { op: 'ref', name: field, ...(pkg ? { pkg } : {}) };
          level = 0;
          pkg = null;
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
          e = { op: 'qualified', type, ...(e.pkg ? { pkg: e.pkg } : {}), expr: inner };
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
      if (level === 1 && !STD_LIBS.has(first.value) && pkg) e = ref(pkg);
      return e;
    }
  },

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
    if (base.op === 'ref') return { op: 'apply', name: base.name, ...(base.pkg ? { pkg: base.pkg } : {}), args };
    // chained: mem(i)(3), r.f(2)
    if (args.length !== 1 || (args[0] && args[0].named)) this.diag('multiple indices on a chained name are not supported');
    return { op: 'index', base, index: args[0] && args[0].named ? args[0].value : args[0] };
  }
};
