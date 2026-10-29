// The truth table editor's handwritten input (#1056, #1066; out of truthtable.js's mount function, #405): expressions
// written by hand, one a line, with any names (#2010), become the editor's (its inputs, outputs, columns and
// expressions); a whole table drawn by hand replaces the table.
//
//   handwrittenExpressions(ed), handwrittenWholeTable(ed); ed: the editor's { model(), output(), alive(), replace(table) }
import { normalizeTable, validateTable } from '/core/logic.js';
import { reservedError } from '/core/reserved.js';

// the editor's own rules: no name the HDL reserves, a table it can edit
const tableError = t => [...t.inputs, ...t.outputs].map(reservedError).find(Boolean) || validateTable(t).find(x => x.severity === 'error')?.message || null;

/** Equations written by hand ("F = …", one a line): their inputs, outputs, columns and expressions replace the
 *  table's (one step of Undo); a single expression with no name is the selected output's. */
export async function handwrittenExpressions(ed) {
  const { handwrittenExpression } = await import('./ink-dialog.js');
  const tableOf = r => normalizeTable({ ...ed.model(), inputs: r.inputs, outputs: r.outputs, table: r.table, exprs: r.exprs });
  const r = await handwrittenExpression({ name: ed.output(), check: t => tableError(tableOf(t)) });
  if (r && ed.alive()) ed.replace(tableOf(r));
}

/** A table drawn by hand: its inputs, outputs and columns replace the table's (one step of Undo). */
export async function handwrittenWholeTable(ed) {
  const { handwrittenTable } = await import('./ink-table-dialog.js');
  const tableOf = r => normalizeTable({ ...ed.model(), inputs: r.inputs, outputs: r.outputs, table: r.table, exprs: {} });
  const check = r => tableError(tableOf(r));
  const r = await handwrittenTable({ check });
  if (r && ed.alive()) ed.replace(tableOf(r));
}
