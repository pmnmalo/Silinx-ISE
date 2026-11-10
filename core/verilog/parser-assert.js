// Silinx - the Verilog parser's assertions (#3177): immediate assertions (assert / assume (e) [pass] [else fail]) and
// SystemVerilog's concurrent ones, written as what the simulator and the formal verification (core/verify.js) both run.
// A concurrent assertion of one clock,
//   [label:] assert | assume property (@(posedge | negedge clk) [disable iff (r)] p) [pass] [else fail];
//   p:  e  |  a |-> b  (b in the same clock cycle as a)  |  a |=> b  (b in the next one)
// becomes a process on that edge with an immediate assertion in it (a |=> b: a register holding a, its initial value 0,
// as the FPGA's); the values seen are those before the edge, as SystemVerilog samples them. Sequences (##, [*…]),
// $past and the like, cover and restrict, and a property with no clocking event are not checked: a warning says so.
import { ASSERTIONS } from './parser-defs.js';

const not = a => ({ op: 'unary', o: '!', a });

/** An immediate assertion's statement: the simulator's check, and its pass and fail actions (form: assert | assume). */
export function assertStmt(form, cond, pass, fail, loc) {
  const check = { kind: 'assert', form, cond, message: null, severity: 'error', loc };
  // (an else action reports the failure itself: the check is then quiet, only the formal verification's)
  if (fail) return { kind: 'block', label: null, decls: [], stmts: [{ ...check, quiet: true }, { kind: 'if', cond, then: pass || { kind: 'null' }, else: fail }] };
  return pass && pass.kind !== 'null' ? { kind: 'block', label: null, decls: [], stmts: [check, { kind: 'if', cond, then: pass, else: null }] } : check;
}

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const assertMethods = {
  // a concurrent assertion at the module's level (its label, if any, not yet read): its process(es) in items, its
  // register in decls; or skipped, with a warning
  concurrentAssertion(items, decls) {
    const start = this.tok;
    if (this.tok.t === 'id' && this.is(':', this.peek())) { this.next(); this.next(); }
    const form = this.next().v;
    const skip = why => {
      let depth = 0;
      while (this.tok.t !== 'eof' && !(depth === 0 && this.is(';'))) {
        if (this.is('(')) depth++;
        else if (this.is(')')) depth--;
        this.next();
      }
      this.expect(';');
      this.error(`${why}: not checked by the simulation nor by Verify`, start, 'warning');
    };
    if (form === 'cover' || form === 'restrict') return skip(`${form} property`);
    if (!this.isWord('property') || !this.is('(', this.peek())) return skip(`a concurrent ${form} that is not '${form} property (…)'`);
    const loc = this.loc(start);
    this.next(); this.next();
    if (!this.is('@')) { this.i -= 2; return skip(`${form} property with no clocking event (@(posedge clk))`); }
    this.next();
    const at = this.i;
    const ev = this.eventList();
    if (ev === 'all' || ev.length !== 1 || ev[0].edge === 'any') { this.i = at - 3; return skip(`${form} property clocked by something other than one clock edge`); }
    let disable = null;
    if (this.accept('disable')) {
      if (!this.isWord('iff')) { this.i = at - 3; return skip(`${form} property with 'disable' not followed by 'iff'`); }
      this.next(); this.expect('('); disable = this.expr(); this.expect(')');
    }
    // the implication: '|' '->' (|->) or '|=' '>' (|=>) at the property's own level, its antecedent read up to it
    let j = this.i, depth = 0, imp = null;
    for (; this.toks[j].t !== 'eof'; j++) {
      const t = this.toks[j];
      if (this.is('(', t) || this.is('[', t) || this.is('{', t)) depth++;
      else if (this.is(')', t) || this.is(']', t) || this.is('}', t)) { if (depth-- === 0) break; }
      else if (depth === 0 && this.is('|', t) && this.is('->', this.toks[j + 1])) { imp = 'same'; break; }
      else if (depth === 0 && this.is('|=', t) && this.is('>', this.toks[j + 1])) { imp = 'next'; break; }
      else if (depth === 0 && (this.is('#', t) || (t.t === 'sys' && /^(\$past|\$rose|\$fell|\$stable|\$changed)$/.test(t.v)))) { this.i = at - 3; return skip(`${form} property with a sequence or a sampled-value function`); }
    }
    let ante = null, cons;
    if (imp) {
      const saved = this.toks[j];
      this.toks[j] = { ...saved, t: 'op', v: ')' };   // (the antecedent ends there)
      ante = this.expr();
      this.toks[j] = saved;
      this.next(); this.next();
    }
    cons = this.expr();
    this.expect(')');
    const pass = this.is('else') || this.is(';') ? null : this.stmt();
    const fail = this.accept('else') ? this.stmt() : null;
    if (!pass && !fail) this.expect(';');
    const sens = ev;
    const proc = body => ({ kind: 'process', label: null, sens, initial: false, decls: [], body: [body], loc });
    const guard = (c, then) => (c ? { kind: 'if', cond: c, then, else: null } : then);
    const enabled = s => (disable ? { kind: 'if', cond: disable, then: { kind: 'null' }, else: s } : s);
    let check = assertStmt(form, cons, pass, fail, loc);
    if (imp === 'next') {
      // a |=> b: the antecedent of the cycle before, in a register of its own
      const past = `silinx$past${this.pastN = (this.pastN || 0) + 1}`;
      decls.push({ kind: 'signal', name: past, type: { kind: 'logic', range: null, signed: false }, init: { op: 'lit', bits: '0', signed: false, sized: true }, net: 'reg', loc });
      const ref = { op: 'ref', name: past };
      items.push(proc({ kind: 'assign', target: ref, value: disable ? { op: 'binary', o: '&&', a: not(disable), b: ante } : ante, nonblocking: true, delay: null }));
      items.push(proc(enabled(guard(ref, check))));
      return;
    }
    items.push(proc(enabled(guard(ante, check))));
  },
  isConcurrentAssertion() {
    const t = this.tok;
    return (t.t === 'id' && ASSERTIONS.has(t.v)) || (t.t === 'id' && this.is(':', this.peek()) && this.peek(2).t === 'id' && ASSERTIONS.has(this.peek(2).v));
  },
};
