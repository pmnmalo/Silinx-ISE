// Several equations written by hand, one a line (#2010, core/ink/equations.js): the strokes split into lines (an
// overbar, a stroke of =, a dot with their line), each line read (any names); the equations' table: its inputs in
// order of appearance, its outputs, each column against an independent evaluation, its expressions; the errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeText } from '../core/ink/synth.js';
import { inkLines, recognizeEquations, tableFromEquations } from '../core/ink/equations.js';
import { recognizeExpression } from '../core/ink/expression.js';
import { LogicError } from '../core/logic.js';

// lines of text written one under the other (each its own hand)
const written = (specs, { gap = 110 } = {}) => {
  const strokes = [], owner = [];
  specs.forEach(([text, o = {}], i) => {
    const w = writeText(text, { seed: 3 + i, amount: 0.4, size: 60, x: 20, y: 30 + i * gap, ...o });
    strokes.push(...w.strokes); owner.push(...w.strokes.map(() => i));
  });
  return { strokes, owner };
};

test('the lines of a drawing: each stroke with its own line, bars, the strokes of = and dots with theirs', () => {
  for (const specs of [
    [['F=A+B'], ['G=AC', { bars: [[2, 2]] }]],
    [['S=A⊕B'], ['C=A·B']],
    [['X=A+B+C', { bars: [[2, 6]] }], ['Y=B'], ['Z=a+c']],
    [['H=AB', { bars: [[2, 2], [2, 3]] }], ["J=A'+i"]],
  ]) {
    const { strokes, owner } = written(specs);
    const lines = inkLines(strokes);
    assert.equal(lines.length, specs.length, specs.map((s) => s[0]).join(' / '));
    lines.forEach((ink, i) => assert.ok(ink.every((k) => owner[k] === i), `${specs[i][0]}: ${ink.filter((k) => owner[k] !== i)}`));
    // every stroke in one line, in order
    assert.deepEqual(lines.flat().sort((a, b) => a - b), strokes.map((_, k) => k));
  }
  // lines close together (a gap of a fifth of their height): still two
  assert.equal(inkLines(written([['F=A'], ['G=B']], { gap: 72 }).strokes).length, 2);
});

test('equations read a line each, in the editor\'s notation; one line read as recognizeExpression reads it', () => {
  const { strokes } = written([['F=A+B'], ['G=AC', { bars: [[2, 2]] }], ['Z=a⊕c']]);
  const r = recognizeEquations(strokes);
  assert.equal(r.text, 'F = A + B\nG = /A.C\nZ = a ⊕ c');
  assert.deepEqual(r.lines.map((l) => [l.name, l.error]), [['F', null], ['G', null], ['Z', null]]);
  // the characters' ink: the drawing's own strokes, each line's from its line (a bar is no character's)
  const lines = inkLines(strokes);
  r.lines.forEach((l, i) => assert.ok(l.chars.every((c) => c.ink.every((k) => lines[i].includes(k))), l.text));
  assert.equal(new Set(r.lines.flatMap((l) => l.chars.flatMap((c) => c.ink))).size, strokes.length - 1);
  const one = written([["F=A·B'+C"]]).strokes;
  assert.equal(recognizeEquations(one).text, recognizeExpression(one).text);
  assert.equal(recognizeEquations(one).text, 'F = A./B + C');
});

// an independent evaluation: the expression as JavaScript over the row's bits (MSB first)
const column = (js, inputs) => Array.from({ length: 2 ** inputs.length }, (_, r) => {
  const env = Object.fromEntries(inputs.map((v, i) => [v, (r >> (inputs.length - 1 - i)) & 1]));
  return String(Number(Function(...inputs, `return ${js}`)(...inputs.map((v) => env[v])) & 1));
}).join('');

test('the equations\' table: inputs in order of appearance, an output each, its column and its expression', () => {
  const t = tableFromEquations('F = /A.B + C\nG = a ⊕ D\nH = /(B + D)');
  assert.deepEqual([t.inputs, t.outputs], [['A', 'B', 'C', 'D'], ['F', 'G', 'H']]);
  const I = ['A', 'B', 'C', 'D'];
  assert.equal(t.table.F, column('(1 - A) & B | C', I));
  assert.equal(t.table.G, column('A ^ D', I));
  assert.equal(t.table.H, column('1 - (B | D)', I));
  assert.deepEqual(t.exprs, { F: '/A.B + C', G: 'a ⊕ D', H: '/(B + D)' });
  // one expression with no name: the output named for it; letters written together, one-letter inputs
  assert.deepEqual(tableFromEquations("ab' + c", { name: 'Q' }), { inputs: ['a', 'b', 'c'], outputs: ['Q'], table: { Q: column('a & (1 - b) | c', ['a', 'b', 'c']) }, exprs: { Q: "ab' + c" } });
  // blank lines ignored
  assert.deepEqual(tableFromEquations('\nF = A\n\n').outputs, ['F']);
});

test('the equations\' errors: no expression, unnamed among several, a name twice, both an output and an input, too many inputs, a parse error', () => {
  const err = (text, o) => { try { tableFromEquations(text, o); return null; } catch (e) { assert.ok(e instanceof LogicError, e.message); return e.message; } };
  assert.equal(err(''), 'Write an expression, e.g. F = /A.B + C.');
  assert.equal(err('F = A\nA + B'), 'Name each expression of several: F = …, G = …');
  assert.equal(err('F = A\nf = B'), 'The output f has two expressions.');
  assert.equal(err('F ='), 'F has no expression.');
  assert.equal(err('2F = A'), "'2F' is not a name: a letter, then letters, digits or _.");
  assert.equal(err('F = A\nG = F.B'), 'F is both an output and an input: an expression of the inputs only.');
  assert.equal(err('F = 1'), 'The expressions have no input.');
  assert.equal(err('F = A.B.C.D.E.G.H'), '7 inputs (A, B, C, D, E, G, H): at most 6.');
  assert.equal(err('F = A.B.C.D.E.G.H', { maxInputs: 8 }), null);
  assert.equal(err('F = A +'), 'the expression ends too early: expected a variable, 0, 1 or ( (at position 4)');
  assert.equal(err('F = A\nG = A +'), 'The expression of G: the expression ends too early: expected a variable, 0, 1 or ( (at position 4)');
});
