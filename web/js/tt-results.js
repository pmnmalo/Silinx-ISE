// The truth table's results (#405: out of mountTtEditor in web/js/truthtable.js, #3218): for the selected output, the
// forms of the fewest gates and of the least delay (#1427), the minimal SOP and POS, the canonical forms, the XOR form
// when it is cheaper (#435), the NAND-only and NOR-only forms (#694), each with its tick box (its HDL logic, #2951) and
// the notation of the expressions (#434).
import { h } from './ui.js';
import { formatExpr, circuitCost, outputForm, formOf, setOutputLogic } from '/core/logic.js';
import { canonicalCost } from '/core/logic-canon.js';
import { designKind } from './project-kind-flag.js';

// (a design and simulation project's, #3780: no HDL)
const HDL_NOTATIONS = ['vhdl', 'verilog'];
const NOTATIONS = [['slash', '/a.b + c'], ['slash-compact', '/ab + c'], ['textbook', 'a·b\' + c'], ['compact', 'ab\' + c'], ['vhdl', 'VHDL'], ['verilog', 'Verilog']];

// the HDL logic of the fewest gates, or of the least delay, among the other forms (#1427)
const GATES_TIP = 'The form with the fewest gates, each symbol one gate whatever its number of inputs';
const DELAY_TIP = 'The form with the fewest gates on its longest path, every gate the same delay';
// the tick box of a result (#2951): ticked, the output's HDL logic (its module and schematic in that form); `pick()` ticks it
const HDL_TIP = 'The HDL logic of this output: its module and its schematic in this form';
const hdlTick = (on, pick) => h('input', { type: 'checkbox', class: 'tt-hdl', checked: on, title: HDL_TIP, onchange: e => { if (e.target.checked) pick(); else e.target.checked = true; } });
// a form as a circuit: its gates (each symbol one) and its delay (its longest path, every gate the same delay, #1427)
function circuit(ast) {
  const c = circuitCost(ast);
  return h('div', { class: 'tt-circuit' }, `As a circuit: ${c.gates} gate(s), delay ${c.delay}`);
}
// the form of the fewest gates or of the least delay of an output (#1427): which one, its expression, its gates and delay
const FORM_NAMES = { sop: 'Minimal SOP', pos: 'Minimal POS', xor: 'XOR form', nand: 'NAND form', nor: 'NOR form' };
function bestForm(doc, out, goal, label, tip, notation, tick) {
  const r = outputForm(doc, out, goal);
  return h('div', { class: `tt-res tt-${goal}`, title: tip },
    h('div', {}, tick(goal), h('b', {}, label), ': ', h('span', { class: 'tt-best-form' }, FORM_NAMES[r.form] || FORM_NAMES.sop)),
    h('div', {}, h('code', { class: 'tt-expr', 'data-no-i18n': '' }, `${out} = ${formatExpr(r.ast, notation)}`)), circuit(r.ast));
}

// the canonical forms in full, the sum of the minterms and the product of the maxterms (#2927), each the list of its
// terms first (#2952), its full expression under it (#3069), its terms, literals, gates and circuit as the minimal
// forms' (#3072), each with its tick box (#2951)
const costText = (terms, literals, g) => `${terms} term(s), ${literals} literal(s); gates: ${g.and} AND, ${g.or} OR, ${g.not} NOT (${g.inputs} gate inputs)`;
function canonForms(A, out, n, notation, tick) {
  const cost = canonicalCost(A.col, n);
  const expr = (f, label, title, ast, list) => h('div', { class: `tt-canon-${f.slice(1)}`, title }, tick(f), h('b', {}, label), ': ',
    h('code', { class: 'tt-canon-list', 'data-no-i18n': '' }, `${out} = ${list}`), h('br'), h('code', { class: 'tt-expr', 'data-no-i18n': '' }, `${out} = ${formatExpr(ast, notation)}`),
    h('div', { class: 'tt-cost' }, costText(cost[f.slice(1)].terms, cost[f.slice(1)].literals, cost[f.slice(1)].gates)), circuit(ast));
  return h('div', { class: 'tt-res tt-canon' },
    expr('csop', 'Canonical SOP', 'The sum of the minterms: every input in every term, the don\'t cares left out', A.canon.sop, A.sigma),
    expr('cpos', 'Canonical POS', 'The product of the maxterms: every input in every term, the don\'t cares left out', A.canon.pos, A.pi));
}

/** The results of the selected output, in `results`; ctx: the editor's M(), out(), A() (its analysis), notation()
 *  and setNotation(v), setM(m), changed(), renderResults(), renderKmap(). */
export function renderTtResults(ctx) {
  const { results } = ctx, M = ctx.M(), out = ctx.out(), A = ctx.A(), notation = ctx.notation();
  results.innerHTML = '';
  const nsel = h('select', { class: 'tt-notation', title: 'Notation of the expressions', onchange: () => { ctx.setNotation(nsel.value); ctx.renderResults(); ctx.renderKmap(); } },
    ...NOTATIONS.filter(([v]) => !designKind() || !HDL_NOTATIONS.includes(v)).map(([v, l]) => h('option', { value: v, selected: v === notation }, l)));
  // its tick box (#2951): the form ticked, the output's HDL logic (an XOR form not simpler: its minimal SOP's)
  const tick = f => hdlTick((formOf(M, out) === 'xor' && !A.xor ? 'sop' : formOf(M, out)) === f, () => { ctx.setM(setOutputLogic(M, out, { form: f })); ctx.changed(); });
  const form = (label, f, cls) => {
    const r = A[f], g = r.gates;
    const note = [];   // (the solution's number: the Karnaugh map's selector, not here, #3060)
    if (!r.exact) note.push(h('span', { class: 'tt-note' }, 'The exact search was cut short: this solution may not be minimal.'));
    return h('div', { class: `tt-res ${cls}` },
      h('div', {}, tick(f), h('b', {}, label), ': ', h('code', { class: 'tt-expr', 'data-no-i18n': '' }, `${out} = ${formatExpr(r.ast, notation)}`)),
      h('div', { class: 'tt-cost' }, costText(r.terms.length, r.literals, g)),
      circuit(r.ast), ...note);
  };
  // the XOR form, when cheaper than both (#435)
  const x = A.xor;
  const xorForm = x && h('div', { class: 'tt-res tt-xor', title: 'Shown when it has fewer literals than the minimal SOP and POS, or as many and fewer operators' },
    h('div', {}, tick('xor'), h('b', {}, 'XOR form'), ': ', h('code', { class: 'tt-expr', 'data-no-i18n': '' }, `${out} = ${formatExpr(x.ast, notation)}`)),
    h('div', { class: 'tt-cost' }, `${x.literals} literal(s), ${x.ops} two-input operator(s): ${x.xor} XOR / XNOR, ${x.and} AND, ${x.or} OR`), circuit(x.ast),
    x.exact ? null : h('span', { class: 'tt-note' }, 'The search was cut short: a simpler XOR form may exist.'));
  // NAND and NOR only (#694): the minimal SOP and POS by double negation
  const gateForm = (label, g, cls, from) => h('div', { class: `tt-res ${cls}`, title: from },
    h('div', {}, tick(cls.slice(3)), h('b', {}, label), ': ', h('code', { class: 'tt-expr', 'data-no-i18n': '' }, `${out} = ${formatExpr(g.ast, notation)}`)),
    h('div', { class: 'tt-cost' }, `${g.gates} gate(s), ${g.inverters} of them inverter(s)`), circuit(g.ast));
  const best = (goal, label, tip) => bestForm(M, out, goal, label, tip, notation, tick);
  results.append(
    h('div', { class: 'tt-row' }, h('label', {}, 'Notation:'), nsel),
    // (the circuit's two choices first, then the minimal forms, the canonical ones after them, #3065)
    best('gates', 'Least number of gates', GATES_TIP), best('delay', 'Least delay', DELAY_TIP),
    form('Minimal SOP', 'sop', 'tt-sop'),
    form('Minimal POS', 'pos', 'tt-pos'),
    canonForms(A, out, M.inputs.length, notation, tick),
    ...(xorForm ? [xorForm] : []),
    gateForm('NAND form', A.nand, 'tt-nand', 'The minimal SOP with NAND gates only (double negation); an inverter is a NAND with its inputs tied, /(a·a)'),
    gateForm('NOR form', A.nor, 'tt-nor', 'The minimal POS with NOR gates only (double negation); an inverter is a NOR with its inputs tied, /(a + a)'));
}
