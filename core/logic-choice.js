// Silinx logic - what a truth table generates for each output (core/logic.js): its HDL logic, the form of its module's and its
// schematic's expression (#2951: chosen per output, the tick box on a result in the editor; the table's `form` for the
// outputs without one of their own, as every table had one form for all before), and the minimal solution of its SOP
// and POS used when it has several (#2950: the first by default). In the table document:
//   form: the table's form (a table saved before #2951: its one form; a new table: 'gates');
//   forms: { output: form } of the outputs whose form is not the table's;
//   solutions: { output: { sop: k, pos: k } }, the index of the minimal solution used (k > 0; 0, the first, left out).
// The editor's tick boxes and solution selector and the MCP's set_output_logic change them through setOutputLogic.
import { FORMS, LogicError, minimize, MAX_EDIT_INPUTS, normalizeTable } from './logic.js';

/** The forms' names, as the editor's results name them. */
export const FORM_NAMES = { sop: 'Minimal SOP', pos: 'Minimal POS', xor: 'XOR form', nand: 'NAND form', nor: 'NOR form', gates: 'Least number of gates', delay: 'Least delay', csop: 'Canonical SOP', cpos: 'Canonical POS' };
/** The HDL logic of output `o` of a (normalized) table. */
export const formOf = (doc, o) => doc.forms?.[o] || doc.form || 'sop';

/** The index of the minimal solution used of output `o`'s `kind` ('sop' | 'pos'), within `count` (else the first). */
export function solutionOf(doc, o, kind, count = Infinity) {
  const k = doc.solutions?.[o]?.[kind] || 0;
  return k < count ? k : 0;
}

/** normalizeTable's part (#2950, #2951): `forms` and `solutions` of the outputs only, valid, the defaults left out (none:
 *  no field, a table saved before stays as it was). */
export function normalizeChoices(doc) {
  const fs = doc.forms && typeof doc.forms === 'object' ? doc.forms : {};
  doc.forms = Object.fromEntries(doc.outputs.filter(o => FORMS.includes(fs[o]) && fs[o] !== doc.form).map(o => [o, fs[o]]));
  const ss = doc.solutions && typeof doc.solutions === 'object' ? doc.solutions : {};
  const k = v => (Number.isInteger(v) && v > 0 ? v : 0);
  doc.solutions = Object.fromEntries(doc.outputs.map(o => [o, Object.fromEntries(['sop', 'pos'].filter(f => k(ss[o]?.[f])).map(f => [f, k(ss[o][f])]))])
    .filter(([, s]) => Object.keys(s).length));
  for (const f of ['forms', 'solutions']) if (!Object.keys(doc[f]).length) delete doc[f];
  return doc;
}

/** reshapeTable's part: the outputs kept keep their form (and their solutions while the inputs are the same), the new
 *  ones get the form of least gates (when the table's is another). */
export function newOutputForms(doc, inputs, outputs) {
  const known = o => Object.keys(doc.table || {}).some(k => k.toLowerCase() === o.toLowerCase());
  const kept = (m, o) => { const k = Object.keys(m || {}).find(x => x.toLowerCase() === o.toLowerCase()); return k == null ? [] : [[o, m[k]]]; };
  const forms = Object.fromEntries(outputs.flatMap(o => kept(doc.forms, o)));
  for (const o of outputs) if (!known(o) && (doc.form || 'sop') !== 'gates') forms[o] = 'gates';
  const same = inputs.length === doc.inputs.length && inputs.every((v, j) => v === doc.inputs[j]);
  const solutions = same ? Object.fromEntries(outputs.flatMap(o => kept(doc.solutions, o))) : {};
  return { forms, solutions };
}

/**
 * The table with output `o`'s HDL logic set to `form` (one of FORMS) and / or the minimal solution `solution`
 * ({ sop: k } or { pos: k }, k from 0, as the results list them) used: a new normalized document. Throws a LogicError
 * on an output, form or solution that does not exist.
 */
export function setOutputLogic(docIn, o, { form, solution } = {}) {
  const doc = normalizeTable(docIn);
  if (!doc.outputs.includes(o)) throw new LogicError(`no output '${o}' (outputs: ${doc.outputs.join(', ')})`);
  if (form !== undefined) {
    if (!FORMS.includes(form)) throw new LogicError(`form: ${FORMS.join(', ')}`);
    doc.forms = { ...doc.forms, [o]: form };
  }
  for (const [kind, k] of Object.entries(solution || {})) {
    if (kind !== 'sop' && kind !== 'pos') throw new LogicError('solution: { sop: k } or { pos: k }');
    const n = doc.inputs.length;
    const count = minimize(doc.table[o], n, { form: kind, ...(n > MAX_EDIT_INPUTS ? { maxNodes: 50000 } : {}) }).alternatives.length;
    if (!Number.isInteger(k) || k < 0 || k >= count) throw new LogicError(`solution ${kind}: ${count === 1 ? 'one minimal solution (0)' : `0 to ${count - 1} (${count} minimal solutions)`}`);
    doc.solutions = { ...doc.solutions, [o]: { ...doc.solutions?.[o], [kind]: k } };
  }
  return normalizeTable(doc);
}
