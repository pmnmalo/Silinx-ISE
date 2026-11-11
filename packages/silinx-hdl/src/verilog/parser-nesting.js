// Silinx - the Verilog parser's statement nesting (#3490): statements nested more than MAX_NESTING levels deep (a
// statement in another, a generate construct in another, each one level deeper) are refused with one error.
import { MAX_NESTING, STMT_NESTING_MESSAGE } from '../util.js';

// the words that open a construct, and those that close one
const OPENS = new Set(['begin', 'fork', 'case', 'casex', 'casez', 'randcase', 'generate', 'function', 'task', 'specify']);
const CLOSES = new Set(['end', 'join', 'join_any', 'join_none', 'endcase', 'endgenerate', 'endfunction', 'endtask', 'endspecify']);
const word = t => (t.t === 'kw' || t.t === 'id' ? t.v : null);

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const nestingMethods = {
  /** fn(), a statement (or a generate construct) one level deeper than the one around it. Past MAX_NESTING levels it is
   *  skipped and `fallback` returned: one error at its first token, once for the outermost statement however deep. */
  deeperStmt(fn, fallback) {
    try {
      if (++this.stmtNesting > MAX_NESTING) {
        if (!this.stmtTooDeep) { this.stmtTooDeep = true; this.error(STMT_NESTING_MESSAGE); }
        this.skipStatement();
        return fallback;
      }
      return fn();
    } finally { if (--this.stmtNesting === 0) this.stmtTooDeep = false; }
  },

  /** Skip a statement and the statements in it, in a loop: up to its `;` or the end that closes it (and its label),
   *  then the else of an if of it; stops before an end it did not open and at endmodule. */
  skipStatement() {
    let depth = 0, parens = 0, ifs = 0;   // (ifs: its ifs still without their else)
    while (this.tok.t !== 'eof' && !this.is('endmodule')) {
      const w = word(this.tok);
      if (CLOSES.has(w) && !depth) return;
      const prev = this.i > 0 ? word(this.toks[this.i - 1]) : null;
      const t = this.next();
      if (this.is('(', t)) parens++;
      else if (this.is(')', t)) parens--;
      else if (OPENS.has(w) && !(w === 'fork' && (prev === 'wait' || prev === 'disable'))) depth++;
      else if (CLOSES.has(w)) depth--;
      else if (w === 'if' && !depth) ifs++;
      if (depth || parens > 0 || !(CLOSES.has(w) || this.is(';', t))) continue;
      if (CLOSES.has(w) && this.accept(':')) this.next();
      if (!ifs || !this.is('else')) return;
      this.next();
      ifs--;
    }
  }
};
