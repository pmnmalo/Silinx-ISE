// The VHDL parser's statement nesting (#3490): statements nested more than MAX_NESTING levels deep (a concurrent
// statement, a process's or a subprogram's sequential statement, each one level deeper than the one around it) are
// refused with one error, as methods of the parser (Object.assign(Parser.prototype, nestingMethods) in parser.js).
import { MAX_NESTING, STMT_NESTING_MESSAGE } from '../util.js';

// the words after `end` that close a construct (end if, end generate …)
const ENDS = new Set(['if', 'case', 'loop', 'generate', 'block', 'process', 'function', 'procedure', 'record', 'units', 'protected', 'component']);
// the words that start a header a `then`, `is` or `generate` ends (an if's, a case's, a generate's)
const HEADS = new Set(['if', 'elsif', 'else', 'for', 'while', 'case']);

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const nestingMethods = {
  /** fn(), a statement one level deeper than the one around it. Past MAX_NESTING levels the statement is skipped and
   *  `fallback` returned: one error at its first token, once for the outermost statement however deep it nests. */
  deeperStmt(fn, fallback) {
    try {
      if (++this.stmtNesting > MAX_NESTING) {
        if (!this.stmtTooDeep) { this.stmtTooDeep = true; this.diag(STMT_NESTING_MESSAGE); }
        this.skipStatement();
        return fallback;
      }
      return fn();
    } finally { if (--this.stmtNesting === 0) this.stmtTooDeep = false; }
  },

  /** Skip a statement and the statements in it, in a loop: up to its `;` or the `end …;` that closes it (consumed);
   *  stops before an `end` it did not open. */
  skipStatement() {
    let open = 0, head = null, parens = 0, sub = false;   // (open: the constructs open in it, each closed by an end)
    while (!this.atEof()) {
      if (this.isKw('end')) {
        if (!open) return;
        this.next();
        if (this.peek().type === 'kw' && ENDS.has(this.peek().value)) this.next();
        if (this.isId()) this.next();
        this.acceptOp(';');
        if (!--open) return;
        continue;
      }
      const tok = this.next();
      if (tok.type === 'op') {
        if (tok.value === '(') parens++;
        else if (tok.value === ')') parens--;
        else if (tok.value === ';' && parens <= 0) { head = null; sub = false; if (!open) return; }
        continue;
      }
      if (tok.type !== 'kw') continue;
      const w = tok.value;
      if (HEADS.has(w)) head = w;
      else if (w === 'then') { if (head === 'if') open++; head = null; }   // (not an elsif's)
      else if (w === 'generate') { if (head === 'if' || head === 'for' || head === 'case') open++; head = null; }   // (not an alternative's)
      else if (w === 'is') { if (head === 'case' || sub) open++; head = null; sub = false; }   // (a case; a subprogram's body)
      else if (w === 'loop') { open++; head = null; }
      else if (w === 'process' || w === 'block' || w === 'record' || w === 'units' || w === 'protected') open++;
      else if (w === 'component') { if (!this.isOp(':', -2)) open++; }   // (not an instance's `u: component c`)
      else if (w === 'function' || w === 'procedure') sub = true;
    }
  }
};
