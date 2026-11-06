// What a truth table generates for each output (core/logic-choice.js): its HDL logic chosen per output (#2951, the
// canonical SOP and POS among the forms, least gates for a new table or output, a table saved before keeping its one
// form and its HDL) and the minimal solution used (#2950): the HDL, the schematic and the results follow them; the
// HDL compiled, elaborated and simulated in VHDL and Verilog with no warnings; setOutputLogic's errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  newTable, normalizeTable, reshapeTable, generateTableHdl, schematicFromTable, schematicErrors, truthTableFromModule,
  analyzeOutput, outputForm, formatExpr, minimalAst, gateForm, setOutputLogic, formOf, solutionOf, FORMS, LogicError,
} from '../core/logic.js';
import { compile, elaborate } from '../core/compile.js';
import { generateHdl } from '../core/schdoc.js';

const careEqual = (col, sim) => [...col].every((c, i) => c === 'X' || c === sim[i]);
/** The module of a table compiled, elaborated (no error nor warning) and simulated: its outputs' columns. */
function simulated(doc, lang) {
  const g = generateTableHdl(doc, lang);
  const lib = compile([{ path: g.filename, text: g.code }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, doc.name).diags].map(x => `${x.severity}: ${x.message}`), [], lang);
  const t = truthTableFromModule([{ path: g.filename, text: g.code }], doc.name);
  assert.deepEqual(t.warnings, [], lang);
  return t.table;
}
const assigns = (doc, lang = 'vhdl') => generateTableHdl(doc, lang).code.split('\n').filter(l => /<=|assign /.test(l)).map(l => l.trim());
// the cyclic chart Σm(0,1,2,5,6,7) (two minimal SOPs), the majority, a column with don't cares
const T3 = () => ({ ...newTable('t3', ['a', 'b', 'c'], ['f', 'g', 'h']), table: { f: '11100111', g: '00010111', h: '01X10X10' } });

test('#2951 a new table: every output in the form of least gates; a table saved before: its one form for every output, its HDL unchanged', () => {
  const doc = normalizeTable(T3());
  assert.deepEqual([doc.form, doc.forms, doc.solutions], ['gates', undefined, undefined]);   // (no choice: no field)
  for (const o of doc.outputs) assert.equal(formOf(doc, o), 'gates');
  assert.deepEqual(assigns(doc), ['f <= (a xnor b) or (a xnor c);', 'g <= (b and c) or (a and c) or (a and b);', 'h <= c xor (a and b);']);
  // saved before: no forms nor solutions; its form (none: minimal SOP) for every output, the same module as with the
  // form given for all
  for (const form of [...FORMS, undefined]) {
    const old = { version: 1, name: 'old', inputs: ['a', 'b', 'c'], outputs: ['f', 'g', 'h'], table: T3().table, exprs: {}, notes: '', lang: 'vhdl', ...(form ? { form } : {}) };
    const n = normalizeTable(old);
    assert.deepEqual([n.form, n.forms, n.solutions], [form || 'sop', undefined, undefined]);
    assert.deepEqual(normalizeTable(n), n, 'saved as it was');
    for (const lang of ['vhdl', 'verilog']) assert.equal(generateTableHdl(old, lang).code, generateTableHdl(old, lang, { form: form || 'sop' }).code, `${form} ${lang}`);
  }
  // the example's table (traffic: lamps.bool.json, minimal SOP): its module is the one committed
  const lamps = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/lamps.bool.json', import.meta.url), 'utf8'));
  assert.equal(lamps.forms, undefined);
  assert.equal(generateTableHdl(lamps, 'vhdl', { source: 'lamps.bool.json' }).code, fs.readFileSync(new URL('../examples/traffic/src/lamps.vhd', import.meta.url), 'utf8'));
});

test('#2951 each output in its own form, the canonical SOP and POS among them: its HDL (compiled, simulated, no warnings) and its schematic', () => {
  let doc = normalizeTable(T3());
  doc = setOutputLogic(doc, 'f', { form: 'csop' });
  doc = setOutputLogic(doc, 'g', { form: 'cpos' });
  doc = setOutputLogic(doc, 'h', { form: 'nand' });
  assert.deepEqual(doc.forms, { f: 'csop', g: 'cpos', h: 'nand' });
  assert.deepEqual(assigns(doc), [
    'f <= (not a and not b and not c) or (not a and not b and c) or (not a and b and not c) or (a and not b and c) or (a and b and not c) or (a and b and c);',
    'g <= (a or b or c) and (a or b or not c) and (a or not b or c) and (not a or b or c);',
    'h <= ((a nand a) nand c) nand (b nand (c nand c));',
  ]);
  const head = generateTableHdl(doc).code.split('\n').filter(l => / = .*\(/.test(l) && !/Σm|don't care/.test(l));
  assert.deepEqual(head.map(l => l.replace(/^-- \w = .*?\s{3}/, '')), ['(canonical SOP, 10 gate(s), delay 3)', '(canonical POS, 8 gate(s), delay 3)', '(NAND gates only, from the minimal SOP, 4 literal(s), 5 gate(s), delay 3)']);
  for (const lang of ['vhdl', 'verilog']) {
    const t = simulated(doc, lang);
    for (const o of doc.outputs) assert.ok(careEqual(doc.table[o], t[o]), `${lang} ${o}`);
    // the canonical forms leave the don't cares out: the SOP 0, the POS 1 there
    const d = setOutputLogic(setOutputLogic(doc, 'h', { form: 'csop' }), 'f', { form: 'cpos' });
    assert.deepEqual(simulated(d, lang).h, '01010010');
    assert.deepEqual(setOutputLogic(doc, 'h', { form: 'cpos' }).forms.h, 'cpos');
    assert.deepEqual(simulated(setOutputLogic(doc, 'h', { form: 'cpos' }), lang).h, '01110110');
  }
  // the schematic: each output in its form (no option), drawn without errors, simulates to the table
  const sch = schematicFromTable(doc);
  assert.deepEqual(schematicErrors(sch), []);
  const g = generateHdl(sch, {});
  assert.deepEqual(g.diagnostics, []);
  const t = truthTableFromModule([{ path: g.filename, lang: 'vhdl', text: g.code }], sch.name).table;
  for (const o of doc.outputs) assert.ok(careEqual(doc.table[o], t[o]), o);
  assert.ok(sch.symbols.some(s => s.type === 'and3') && sch.symbols.some(s => s.type === 'nand2'));
  // the form given for every output still overrides them (the NAND / NOR views)
  assert.ok(assigns(doc).length === 3 && assigns({ ...doc }, 'vhdl')[2].includes('nand'));
  assert.ok(generateTableHdl(doc, 'vhdl', { form: 'sop' }).code.includes('f <= (not a and not b) or (b and not c) or (a and c);'));
});

test('#2950 the minimal solution used: the HDL, the NAND form, the results and the schematic follow it; the first by default', () => {
  const base = normalizeTable({ ...T3(), form: 'sop' });
  assert.equal(solutionOf(base, 'f', 'sop'), 0);
  const doc = setOutputLogic(base, 'f', { solution: { sop: 1 } });
  assert.deepEqual(doc.solutions, { f: { sop: 1 } });
  assert.equal(assigns(doc)[0], 'f <= (not a and not c) or (not b and c) or (a and b);');
  assert.match(generateTableHdl(doc).code, /-- f = a'·c' \+ b'·c \+ a·b {3}\(minimal SOP \(solution 2 of 2\), 6 literal\(s\), 7 gate\(s\), delay 3\)/);
  // the results: the solution used, its NAND form; the first again with { sop: 0 } (not saved)
  const A = analyzeOutput(doc, 'f');
  assert.deepEqual([A.sop.pick, A.sop.ast, A.sop.terms], [1, A.sop.alternatives[1].ast, A.sop.alternatives[1].terms]);
  assert.equal(formatExpr(A.nand.ast), formatExpr(gateForm({ ...A.sop }, doc.inputs, 'nand').ast));
  assert.equal(formatExpr(outputForm(doc, 'f', 'nand').ast), formatExpr(A.nand.ast));
  assert.equal(formatExpr(minimalAst(A.sop, doc.inputs)), "a'·c' + b'·c + a·b");
  for (const lang of ['vhdl', 'verilog']) for (const form of ['sop', 'nand', 'gates', 'delay']) assert.equal(simulated(setOutputLogic(doc, 'f', { form }), lang).f, '11100111', `${form} ${lang}`);
  assert.equal(setOutputLogic(doc, 'f', { solution: { sop: 0 } }).solutions, undefined);
  assert.equal(analyzeOutput(base, 'f').sop.pick, 0);
  // the schematic: its gates those of the solution used
  const sch = schematicFromTable(doc), t = truthTableFromModule([{ path: 'x.vhd', lang: 'vhdl', text: generateHdl(sch, {}).code }], sch.name);
  assert.equal(t.table.f, '11100111');
  // a solution index past the ones there are (the table changed): the first
  const changed = normalizeTable({ ...doc, table: { ...doc.table, f: '00010111' } });
  assert.equal(solutionOf(changed, 'f', 'sop', analyzeOutput(changed, 'f').sop.alternatives.length), 0);
  assert.equal(analyzeOutput(changed, 'f').sop.pick, 0);
  assert.equal(assigns(changed)[0], 'f <= (b and c) or (a and c) or (a and b);');
});

test('#2950 #2951 normalize and reshape: only valid choices of existing outputs kept; a new output in least gates; new inputs: the first solutions', () => {
  const d = normalizeTable({ ...T3(), form: 'sop', forms: { f: 'pos', g: 'sop', h: 'esop', zz: 'nor' }, solutions: { f: { sop: 1, pos: 0 }, g: { sop: -1, pos: 1.5 }, zz: { sop: 1 } } });
  assert.deepEqual([d.forms, d.solutions], [{ f: 'pos' }, { f: { sop: 1 } }]);
  assert.deepEqual(Object.keys(normalizeTable({ ...T3(), forms: 'x', solutions: [1] })).filter(k => k === 'forms' || k === 'solutions'), []);
  // reshape: f kept with its form and solution; k new: least gates; the inputs changed: no solution kept
  const r = normalizeTable(reshapeTable(d, ['a', 'b', 'c'], ['F', 'h', 'k']));
  assert.deepEqual([r.forms, r.solutions], [{ F: 'pos', k: 'gates' }, { F: { sop: 1 } }]);
  assert.equal(normalizeTable(reshapeTable(d, ['a', 'b', 'c', 'd'], ['f'])).solutions, undefined);
  assert.deepEqual(normalizeTable(reshapeTable(normalizeTable(T3()), ['a', 'b', 'c'], ['f', 'k'])).forms, undefined);   // (a table in least gates)
});

test('#2950 #2951 setOutputLogic refuses an output, a form or a solution that does not exist', () => {
  const doc = normalizeTable(T3());
  const fails = (o, x, msg) => assert.throws(() => setOutputLogic(doc, o, x), e => e instanceof LogicError && e.message === msg);
  fails('q', { form: 'sop' }, "no output 'q' (outputs: f, g, h)");
  fails('f', { form: 'esop' }, `form: ${FORMS.join(', ')}`);
  fails('f', { solution: { sop: 2 } }, 'solution sop: 0 to 1 (2 minimal solutions)');
  fails('g', { solution: { sop: 1 } }, 'solution sop: one minimal solution (0)');
  fails('f', { solution: { sop: 'a' } }, 'solution sop: 0 to 1 (2 minimal solutions)');
  fails('f', { solution: { xor: 0 } }, 'solution: { sop: k } or { pos: k }');
  // nothing given: the same table
  assert.deepEqual(setOutputLogic(doc, 'f'), doc);
});
