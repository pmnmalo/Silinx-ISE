// The Boolean Algebra Wizard (#2082), New Source ▸ 'Boolean Algebra' ▸ Wizard >: the inputs and the outputs, or an
// expression that gives them and the output's column (#1056, on New Source's page before) -> summary; it creates the
// .bool.json and opens it in the Boolean algebra editor. The name, the location and the language: New Source's.
import { api } from './api.js';
import { h, toast } from './ui.js';
import { reservedError } from '/core/reserved.js';
import { wizard, field, replaceGuard, closeBeforeReplace, NAME_RE } from './wizards.js';
import { S, app } from './app.js';

// a truth table from "name = expression" (#1056): its inputs (the expression's, 1 to 6), its output (the name, else f)
// and the output's column; or the error to show
export async function ttFromExpression(text) {
  const { splitEquation, expressionInputs } = await import('/core/ink/expression.js');
  const { parseExpr, exprColumn, MAX_EDIT_INPUTS } = await import('/core/logic.js');
  const { name, expr } = splitEquation(text);
  let inputs;
  try { inputs = expressionInputs(expr); } catch (e) { return `Expression: ${e.message}`; }
  if (inputs.length < 1 || inputs.length > MAX_EDIT_INPUTS) return `Expression: 1 to ${MAX_EDIT_INPUTS} inputs (it has ${inputs.length}).`;
  const output = name || 'f';
  if (!NAME_RE.test(output)) return `Expression: '${output}' is not a valid output name.`;
  const r = reservedError(output) || inputs.map(reservedError).find(Boolean);
  if (r) return `${r}: choose another name.`;
  if (inputs.some(i => i.toLowerCase() === output.toLowerCase())) return `Expression: the output '${output}' is also an input.`;
  return { inputs, output, expr, column: exprColumn(parseExpr(expr, { vars: inputs }), inputs) };
}

// names typed with commas or spaces
const namesOf = text => text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);

// the names of the inputs and the outputs (1 to max inputs, 1 output or more); or the error to show
function namesError(inputs, outputs, max) {
  if (inputs.length < 1 || inputs.length > max) return `Inputs: 1 to ${max} (there are ${inputs.length}).`;
  if (!outputs.length) return 'Outputs: at least one.';
  const seen = new Set();
  for (const n of [...inputs, ...outputs]) {
    if (!NAME_RE.test(n)) return `'${n}' is not a valid name.`;
    const r = reservedError(n);
    if (r) return `${r}: choose another name.`;
    if (seen.has(n.toLowerCase())) return `'${n}' is used twice.`;
    seen.add(n.toLowerCase());
  }
  return null;
}

export async function booleanWizard({ path, name, lang, back = null }) {
  if (!S.project) return;
  const { newTable, MAX_EDIT_INPUTS } = await import('/core/logic.js');
  const guard = replaceGuard('Boolean Algebra Wizard');
  const exprIn = h('input', { type: 'text', class: 'tw-expr', spellcheck: 'false', placeholder: "optional, e.g. F = A·B' + C" });
  const insIn = h('input', { type: 'text', class: 'tw-inputs', value: 'a, b, c', spellcheck: 'false' });
  const outsIn = h('input', { type: 'text', class: 'tw-outputs', value: 'f', spellcheck: 'false' });
  // an expression typed: it gives the inputs and the output (their fields greyed)
  const sync = () => { insIn.disabled = outsIn.disabled = !!exprIn.value.trim(); };
  exprIn.addEventListener('input', sync);
  let made = null;   // the table, made by the page's check
  const make = async () => {
    if (exprIn.value.trim()) {
      const e = await ttFromExpression(exprIn.value);
      if (typeof e === 'string') return e;
      made = { ...newTable(name, e.inputs, [e.output]), table: { [e.output]: e.column }, exprs: { [e.output]: e.expr }, lang };
      return null;
    }
    const ins = namesOf(insIn.value), outs = namesOf(outsIn.value);
    const err = namesError(ins, outs, MAX_EDIT_INPUTS);
    if (err) return err;
    made = { ...newTable(name, ins, outs), lang };
    return null;
  };
  const p1 = {
    title: 'Inputs and Outputs',
    render: () => h('div', {},
      h('div', { class: 'hint' }, `The names of the inputs (1 to ${MAX_EDIT_INPUTS}) and of the outputs, separated by commas; or an expression, whose variables are the inputs and whose name (else f) the output, its column filled in.`),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field('Expression:', h('div', { class: 'tw-row' }, exprIn)), ...field('Inputs:', insIn), ...field('Outputs:', outsIn))),
    onShow: () => { sync(); setTimeout(() => exprIn.focus(), 0); },
    validate: make,
  };
  const summary = h('pre', { class: 'tw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      summary.textContent = [
        `The wizard will create the Boolean algebra source ${path} and open it in its editor.`, '',
        `Module: ${made.name} (${lang === 'verilog' ? 'Verilog' : 'VHDL'})`,
        `Inputs: ${made.inputs.join(', ')}`,
        `Outputs: ${made.outputs.join(', ')}`,
        ...(exprIn.value.trim() ? [`Expression: ${exprIn.value.trim()}`] : []),
      ].join('\n');
    },
    validate: () => guard(path),
  };
  const ok = await wizard('Boolean Algebra Wizard', [p1, pSum], { width: 720, back });
  if (!ok) return;
  await closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, JSON.stringify(made, null, 2));
  await app.reloadProject();
  app.log(`Boolean Algebra Wizard: created ${path} with ${made.inputs.length} input(s) and ${made.outputs.length} output(s).`, 'ok');
  toast(`${made.name} created`, 'ok');
  app.openTt(path);
  return path;
}
