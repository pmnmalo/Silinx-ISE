// Silinx logic - the cost of a table's output in its canonical forms (#3072): the sum of its minterms and the product of
// its maxterms (core/logic.js canonicalAsts, #2927), counted as the minimal forms are (gateCount): its terms, its
// literals (every input in every term), its gates (an AND per term, one OR of the terms, a NOT per input complemented
// somewhere; POS the other way) and their inputs.
import { cubeLiterals, gateCount } from './logic.js';

const rowsOf = (col, ch) => [...col].flatMap((c, r) => (c === ch ? [r] : []));

/** { sop, pos } of a column (its characters '0' / '1' / 'X', row 0 first) of `n` inputs: each { terms, literals, gates }
 *  (gates: gateCount's { and, or, not, inputs, literals }); no minterm (no maxterm): the constant, nothing counted. */
export function canonicalCost(col, n) {
  const form = (f, rows) => {
    // a row's minterm (POS: its maxterm, the clause complementing the literals) as an implicant of no don't care bit
    const terms = rows.map(r => ({ literals: cubeLiterals({ value: r, mask: 0 }, n) }));
    const res = { form: f, terms, literals: terms.length * n };
    return { terms: terms.length, literals: res.literals, gates: gateCount(res) };
  };
  return { sop: form('sop', rowsOf(col, '1')), pos: form('pos', rowsOf(col, '0')) };
}
