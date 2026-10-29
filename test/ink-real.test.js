// core/ink/corpus.js and the corpus of real handwriting (#1749, test/fixtures/ink/): a drawing kept as text and read
// back the same; every drawing of the corpus well formed and read by its kind's recognizer, each kind's rate of
// drawings read exactly as expected at least its floor (raised as the recognizers improve; the misreads listed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeDrawing, decodeDrawing, readDrawing, circuitText, DRAWING_KINDS } from '../core/ink/corpus.js';
import { writeText } from '../core/ink/synth.js';
import { writeTable } from '../core/ink/synth-table.js';
import { writeSchematic } from '../core/ink/synth-schematic.js';
import { readSchematic } from '../core/ink/schematic.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ink');
// the share of each kind's drawings read exactly as expected that may not be lost (raise it, never lower it)
const FLOORS = { expression: 0, table: 0, schematic: 0 };
const corpus = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ f, d: decodeDrawing(fs.readFileSync(path.join(DIR, f), 'utf8')) }));

test('a drawing kept as text: its strokes, kind, devices, what was read; read back the same', () => {
  const w = writeText("F=A·B'+C", { seed: 3, amount: 0.4 });
  const e = encodeDrawing({ kind: 'expression', strokes: w.strokes, devices: ['pen', 'pen', 'touch', 'stylus'], read: 'F = A./B + C', vars: ['A', 'B', 'C'] });
  assert.deepEqual(Object.keys(e), ['silinx', 'version', 'kind', 'devices', 'vars', 'read', 'strokes']);
  assert.deepEqual([e.silinx, e.version, e.kind, e.devices, e.vars, e.read], ['ink-drawing', 1, 'expression', ['pen', 'touch'], ['A', 'B', 'C'], 'F = A./B + C']);
  assert.equal(e.strokes.length, w.strokes.length);
  // a tenth of a pixel
  assert.ok(e.strokes.flat().every((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9));
  const d = decodeDrawing(JSON.stringify(e));
  assert.deepEqual([d.kind, d.devices, d.vars, d.read, d.expect, d.note], ['expression', ['pen', 'touch'], ['A', 'B', 'C'], 'F = A./B + C', null, '']);
  assert.equal(readDrawing(d), 'F = A./B + C');
  // the other kinds: a table's text, a schematic's circuit
  const t = decodeDrawing(encodeDrawing({ kind: 'table', strokes: writeTable([['A', 'B', 'F'], ['0', '0', '0'], ['0', '1', '1'], ['1', '0', '1'], ['1', '1', '0']], { seed: 9, amount: 0.4 }).strokes }));
  assert.equal(readDrawing(t), 'A B | F\n0 0 | 0\n0 1 | 1\n1 0 | 1\n1 1 | 0');
  const and2 = { gates: [{ type: 'and', x: 2.6, y: 0.5, n: 2 }, { type: 'not', x: 4.8, y: 0.55 }], nets: [{ name: 'A', at: [0.5, 0.2], to: [[0, 0]] }, { name: 'B', at: [0.5, 1.6], to: [[0, 1]] }, { from: 0, to: [[1, 0]] }, { from: 1, name: 'Z' }] };
  const s = decodeDrawing(encodeDrawing({ kind: 'schematic', strokes: writeSchematic(and2, { seed: 9, amount: 0.4 }).strokes }));
  assert.equal(readDrawing(s), 'U1 and2 (A, B) -> U1\nU2 inv (U1) -> Z');
});

test('decodeDrawing: what is not a drawing, and its errors', () => {
  const bad = (x, msg) => assert.throws(() => decodeDrawing(x), (e) => e.message === msg);
  bad('{', 'Not a Silinx drawing: the text is not one copied with Copy Drawing.');
  bad('{"a":1}', 'Not a Silinx drawing: the text is not one copied with Copy Drawing.');
  bad({ silinx: 'ink-drawing', version: 2, kind: 'table', strokes: [[0, 0]] }, 'A Silinx drawing of version 2: this Silinx reads version 1.');
  bad({ silinx: 'ink-drawing', version: 1, kind: 'fsm', strokes: [[0, 0]] }, "A Silinx drawing of an unknown kind: 'fsm'.");
  for (const strokes of [[], [[0]], [[0, 'a']], 'x']) bad({ silinx: 'ink-drawing', version: 1, kind: 'table', strokes }, 'A Silinx drawing with no strokes, or strokes that are not lists of points.');
  // what cannot be read: its recognizer's message
  assert.equal(readDrawing(decodeDrawing({ silinx: 'ink-drawing', version: 1, kind: 'schematic', strokes: [[0, 0, 5, 5]] })), '! No gate found: draw the gates larger than the names, their inputs on the left.');
});

test('circuitText: the gates and flip-flops, a net with no name by its source, the errors after', () => {
  const c = { gates: [{ id: 'U1', kind: 'ff', type: 'fd', pins: { D: 'n1', C: 'n2' }, outputs: { Q: 'n3', QN: 'n4' } }, { id: 'U2', kind: 'and', type: 'and2', inputs: ['n3', 'n4'], output: null }],
    nets: [{ id: 'n1', name: 'd' }, { id: 'n2', name: 'clk' }, { id: 'n3', name: null, driver: 'U1', driverPin: 'Q' }, { id: 'n4', name: null, driver: 'U1', driverPin: 'QN' }], errors: ['U2 (AND): no wire from its output.'] };
  assert.equal(circuitText(c), 'U1 fd (D: d, C: clk) -> Q: U1, QN: U1.QN\nU2 and2 (U1, U1.QN) -> ?\n! U2 (AND): no wire from its output.');
  const toggle = readSchematic(writeSchematic({ gates: [{ type: 'ff', x: 2.4, y: 0, ins: ['D', 'C'], outs: ['Q', 'QN'], wedge: true }], nets: [
    { name: 'clk', at: [0.6, 0.6], to: [[0, 'C']] }, { from: 0, out: 'Q', name: 'q' }, { from: 0, out: 'QN', to: [[0, 'D']], via: 1.7 }] }, { seed: 9, amount: 0.4, size: 60, x: 30, y: 30 }).strokes);
  assert.equal(circuitText(toggle), 'U1 fd (C: clk, D: U1.QN) -> Q: q, QN: U1.QN');
});

test('the corpus of real handwriting: every drawing well formed, each kind read at least as well as its floor', (t) => {
  const all = corpus();
  const files = fs.readdirSync(DIR).filter((f) => !f.endsWith('.json')).sort();
  assert.deepEqual(files, ['README.md'], 'the folder holds drawings (.json) and its README only');
  for (const kind of DRAWING_KINDS) {
    const of = all.filter((x) => x.d.kind === kind);
    for (const { f, d } of of) {
      assert.equal(typeof d.expect, 'string', `${f}: what it should read as (expect)`);
      assert.match(f, new RegExp(`^${kind}-[a-z0-9-]+\\.json$`), `${f}: named <kind>-<what>-<device>.json`);
    }
    const wrong = of.filter(({ d }) => readDrawing(d) !== d.expect);
    for (const { f, d } of wrong) t.diagnostic(`${f}: read ${JSON.stringify(readDrawing(d))}, expected ${JSON.stringify(d.expect)}`);
    const rate = of.length ? (of.length - wrong.length) / of.length : 1;
    t.diagnostic(`${kind}: ${of.length - wrong.length} of ${of.length} read as expected`);
    assert.ok(rate >= FLOORS[kind], `${kind}: ${of.length - wrong.length} of ${of.length}, below the floor ${FLOORS[kind]}`);
  }
});
