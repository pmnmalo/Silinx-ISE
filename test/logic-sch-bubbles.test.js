// The schematic of a table with inverted-input gates (#3786): a complemented input of an AND, OR, NAND or NOR is one of
// its inverted inputs (Xilinx's ANDnBk, ORnBk, NANDnBk, NORnBk), not an INV on the inverted rail; an INV only for an
// output that is a lone complement and for the complemented inputs of an XOR / XNOR (the XORnBk symbols are Silinx's
// own, none in ISE's library); the NAND and NOR forms stay NAND / NOR only. Each schematic's HDL compiles, elaborates
// with no diagnostic but the expected one and simulates to the table, in VHDL and in Verilog; its ISE export uses
// library symbols only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMS, newTable, outputForm, normalizeTable, truthTableFromModule } from '../core/logic.js';
import { schematicFromTable, schematicErrors } from '../core/logic-sch.js';
import { generateHdl } from '../core/schdoc.js';
import { exportIseSch } from '../core/isesch-export.js';
import { compile, elaborate } from '../core/compile.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const randCol = (r, n, pdc) => Array.from({ length: 1 << n }, () => { const x = r(); return x < pdc ? 'X' : x < pdc + (1 - pdc) / 2 ? '1' : '0'; }).join('');
const V = n => 'abcdef'.slice(0, n).split('');
const careEqual = (col, got) => [...col].every((c, i) => c === 'X' || c === got[i]);
const types = sch => sch.symbols.map(s => s.type);
// the inverted inputs of a gate type: and3b2 → 2
const invIns = t => +(/^(?:n?and|n?or)\d+b(\d)$/.exec(t)?.[1] || 0);
// the inputs no output's expression uses (their markers unconnected: the one warning of the schematic's HDL)
const varsOf = e => (e.t === 'var' ? [e.name] : e.a ? varsOf(e.a) : (e.args || []).flatMap(varsOf));
const unusedInputs = (doc, form) => { const used = new Set(doc.outputs.flatMap(o => varsOf(outputForm(doc, o, form).ast))); return doc.inputs.filter(v => !used.has(v)); };

function simulatesTo(sch, doc, lang, what, form) {
  assert.deepEqual(schematicErrors(sch).map(e => e.message), [], what);
  const g = generateHdl(sch, { lang });
  assert.deepEqual(g.diagnostics.map(d => `${d.severity}: ${d.message}`), unusedInputs(doc, form).map(v => `warning: I/O marker '${v}' is not connected`), what);
  const path = `${doc.name}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  const lib = compile([{ path, text: g.code }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, doc.name).diags].map(d => `${d.severity}: ${d.message}`), [], what);
  const t = truthTableFromModule([{ path, text: g.code }], doc.name);
  assert.deepEqual(t.warnings, [], what);
  for (const o of doc.outputs) assert.ok(careEqual(doc.table[o], t.table[o]), `${what} ${o}: ${doc.table[o]} vs ${t.table[o]}`);
}
// the complemented inputs of an expression's AND / OR gates (a NOT of a variable under an AND or an OR), and its lone
// complement (the whole output a NOT of a variable)
function complements(ast) {
  let under = 0;
  const w = (x, parent) => {
    if (x.t === 'not' && x.a.t === 'var') { if (parent === 'and' || parent === 'or') under++; return; }
    if (x.t === 'not') return w(x.a, null);
    x.args?.forEach(k => w(k, x.t));
  };
  w(ast, null);
  return { under, lone: ast.t === 'not' && ast.a.t === 'var' };
}

test('#3786 /a·/c·/d is one AND3B3, no INV; a lone complement one INV; an input one BUF', () => {
  const doc = { ...newTable('acd', ['a', 'b', 'c', 'd'], ['f', 'g', 'h']), table: { f: '1000100000000000', g: '1111111100000000', h: '0000000011111111' } };
  for (const [form, lang] of [['sop', 'vhdl'], ['pos', 'verilog']]) {
    const sch = schematicFromTable(doc, { form, lang });
    // f = /a·/c·/d (rows 0 and 4: b free), g = /a, h = a
    assert.deepEqual(types(sch).sort(), ['and3b3', 'buf', 'inv'], form);
    simulatesTo(sch, doc, lang, form, form);
  }
  // its canonical SOP: f = /a·/b·/c·/d + /a·b·/c·/d, an AND4B4 and an AND4B3
  const f = { ...doc, outputs: ['f'], table: { f: doc.table.f } };
  assert.deepEqual(types(schematicFromTable(f, { form: 'csop' })).sort(), ['and4b3', 'and4b4', 'or2']);
  // POS: (a + /b)·(/a + b) as two OR2B1 and an AND2
  const x = { ...newTable('xnor2', ['a', 'b'], ['f']), table: { f: '1001' } };
  assert.deepEqual(types(schematicFromTable(x, { form: 'pos' })).sort(), ['and2', 'or2b1', 'or2b1']);
  assert.deepEqual(types(schematicFromTable(x, { form: 'sop' })).sort(), ['and2', 'and2b2', 'or2']);
});

test('#3786 every form of many functions: inverted inputs for every complement of an AND / OR, INVs only where none fits; HDL simulated in VHDL and Verilog', () => {
  const r = rng(3786);
  let checked = 0;
  for (let k = 0; k < 36; k++) {
    const n = 1 + (k % 5), outs = ['x', 'y', 'z'].slice(0, 1 + (k % 3));
    const doc = normalizeTable({ ...newTable(`b${k}`, V(n), outs), table: Object.fromEntries(outs.map(o => [o, randCol(r, n, k % 4 ? 0.15 : 0)])) });
    for (const form of FORMS) {
      const lang = (k + FORMS.indexOf(form)) % 2 ? 'verilog' : 'vhdl';
      const sch = schematicFromTable(doc, { form, lang }), ts = types(sch);
      const what = `${form} ${k}`;
      const fs = outs.map(o => outputForm(doc, o, form));
      if (fs.every(f => f.form === 'nand' || f.ast.t === 'const')) assert.ok(ts.every(t => /^nand[234]$|^constant$/.test(t)), `${what}: ${ts}`);
      else if (fs.every(f => f.form === 'nor' || f.ast.t === 'const')) assert.ok(ts.every(t => /^nor[234]$|^constant$/.test(t)), `${what}: ${ts}`);
      else if (fs.every(f => !['nand', 'nor', 'xor'].includes(f.form))) {
        // the AND / OR forms: one inverted input per complement under an AND / OR (the fan-in split keeps them), an
        // INV per output that is a lone complement, none on the rails
        const c = fs.map(f => complements(f.ast));
        assert.equal(ts.reduce((s, t) => s + invIns(t), 0), c.reduce((s, x) => s + x.under, 0), `${what}: ${ts}`);
        assert.equal(ts.filter(t => t === 'inv').length, c.filter(x => x.lone).length, `${what}: ${ts}`);
        assert.ok(ts.every(t => /^(and|or)[2-5](b[1-5])?$|^(inv|buf|constant)$/.test(t)), `${what}: ${ts}`);
      }
      simulatesTo(sch, doc, lang, what, form);
      checked++;
    }
  }
  assert.equal(checked, 36 * FORMS.length);
});

test('#3786 the schematic exported to ISE: its inverted-input gates are the Xilinx library\'s (no symbol of Silinx\'s own)', () => {
  const doc = { ...newTable('iseb', ['a', 'b', 'c', 'd'], ['f', 'g']), table: { f: '1000100000000000', g: '0110100110010110' } };
  for (const form of ['sop', 'pos', 'cpos']) {
    const sch = schematicFromTable(doc, { form });
    assert.ok(types(sch).some(t => invIns(t)), form);
    const ex = exportIseSch(sch, { timestamp: '2026-11-13T0:0:0' });
    assert.deepEqual(ex.warnings, [], form);
    assert.deepEqual(ex.files.filter(f => f.kind === 'sym').map(f => f.path), [], form);
    for (const t of new Set(types(sch).filter(invIns))) assert.match(ex.xml, new RegExp(`<blockdef name="${t}">`), `${form}: ${t}`);
  }
});
