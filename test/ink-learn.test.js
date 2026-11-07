// core/ink/learn.js: the user's corrections learnt (#1751). The characters of an expression the user changed, where
// the text lines up with the ink, become samples of their handwriting, recognized on the next try; a text that does not
// line up (a character more, another line, a text written again) gives none; in a schematic, a gate's type of another
// outline keeps the outline as a sample of that one, a name corrected its letters; nothing changed, nothing learnt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeText } from '../core/ink/synth.js';
import { writeSchematic } from '../core/ink/synth-schematic.js';
import { recognizeEquations } from '../core/ink/equations.js';
import { readSchematic } from '../core/ink/schematic.js';
import { gateTemplates } from '../core/ink/gates.js';
import { builtinTemplates, userTemplates, userGateTemplates, validSamples, encodeSample, GATE_KINDS } from '../core/ink/templates.js';
import { expressionSamples, schematicSamples, correctedChars } from '../core/ink/learn.js';

// two lines of equations, one under the other
const lines = (...texts) => texts.flatMap((t, i) => writeText(t, { y: 20 + 110 * i }).strokes);
const letters = templates => [...builtinTemplates(), ...userTemplates(templates)];

test('a character of an expression corrected is a sample, and is recognized on the next try', () => {
  const strokes = writeText('F = A + R').strokes;
  const r = recognizeEquations(strokes);
  // (the hand's F is read as a P: the user corrects it)
  assert.equal(r.text, 'P = A + R');
  const samples = expressionSamples(r, 'F = A + R', strokes);
  assert.deepEqual(samples.map(s => s.c), ['F']);
  assert.deepEqual(validSamples(samples), samples);
  // its ink: the strokes of the character read as P
  const p = r.lines[0].chars.find(c => c.ch === 'P');
  assert.deepEqual(samples[0], encodeSample('F', p.ink.map(k => strokes[k])));
  // the regression (#1751): the next reading, with the sample as the user's template, is the corrected one
  assert.equal(recognizeEquations(strokes, { templates: letters(samples) }).text, 'F = A + R');
  // and nothing more to learn then
  const again = recognizeEquations(strokes, { templates: letters(samples) });
  assert.deepEqual(expressionSamples(again, again.text, strokes), []);
});

test('the corrections of each line of several, in the editor notation the text is shown in', () => {
  const strokes = lines('F = A + R', 'G = Ab');
  const r = recognizeEquations(strokes);
  assert.equal(r.text, 'P = A + R\nG = A.b');
  // (the second line's A.b: the dot is the notation's, not drawn; its b corrected to d)
  assert.deepEqual(expressionSamples(r, 'F = A + R\nG = A.d', strokes).map(s => s.c), ['F', 'd']);
  // a blank line between them is no line
  assert.deepEqual(expressionSamples(r, 'F = A + R\n\nG = A.b\n', strokes).map(s => s.c), ['F']);
});

test('a text that does not line up with the ink gives no sample', () => {
  const strokes = lines('F = A + R', 'G = Ab');
  const r = recognizeEquations(strokes);
  // a character more on the line, or one less: that line's none, the other's still
  assert.deepEqual(expressionSamples(r, 'F = A + RC\nG = A.d', strokes).map(s => s.c), ['d']);
  assert.deepEqual(expressionSamples(r, 'F = A\nG = A.d', strokes).map(s => s.c), ['d']);
  // a line more or less: none
  assert.deepEqual(expressionSamples(r, 'F = A + R', strokes), []);
  assert.deepEqual(expressionSamples(r, 'F = A + R\nG = A.d\nH = A', strokes), []);
  // the text written again, the letters swapped: not a correction
  assert.deepEqual(expressionSamples(r, 'X = Y + Z\nG = A.b', strokes), []);
  assert.deepEqual(expressionSamples(r, 'P = R + A\nG = A.b', strokes), []);
  // nothing changed (the operators and the notation do not count: + for ⊕ is no shape of a letter)
  assert.deepEqual(expressionSamples(r, r.text, strokes), []);
  assert.deepEqual(expressionSamples(r, 'P = A ⊕ R\nG = A b', strokes), []);
  // no reading
  assert.deepEqual(expressionSamples(null, 'F', strokes), []);
});

test('correctedChars: the characters changed, not a case written alike, not a symbol out of the set', () => {
  const chars = [...'Acx?'].map((ch, i) => ({ ch, ink: [i] }));
  assert.deepEqual(correctedChars(chars, 'Bcx?'), [{ ch: 'B', ink: [0] }]);
  // (a c and a C are one shape: the case is the size's)
  assert.deepEqual(correctedChars(chars, 'ACx?'), []);
  // an unknown symbol (?) named
  assert.deepEqual(correctedChars(chars, 'Acxk'), [{ ch: 'k', ink: [3] }]);
  // the operators between them not counted (the notation's); one letter less does not line up
  assert.deepEqual(correctedChars(chars, 'A + c·x + d'), [{ ch: 'd', ink: [3] }]);
  assert.deepEqual(correctedChars(chars, 'Acx'), []);
  assert.deepEqual(correctedChars([], ''), []);
});

// a half adder drawn by hand: an XOR and an AND, the inputs A and B, the outputs S and C
const HALF_ADDER = { gates: [{ type: 'xor', x: 2.6, y: 0, n: 2 }, { type: 'and', x: 2.6, y: 2.0, n: 2 }], nets: [
  { name: 'A', at: [0.5, -0.2], to: [[0, 0], [1, 0]], j: 0.4 }, { name: 'B', at: [0.5, 1.0], to: [[0, 1], [1, 1]], j: 0.7 },
  { from: 0, name: 'S' }, { from: 1, name: 'C' }] };

test('a gate type of another outline chosen in the list keeps the outline as a sample of that type', () => {
  const { strokes } = writeSchematic(HALF_ADDER);
  const read = readSchematic(strokes);
  assert.deepEqual(read.gates.map(g => [g.id, g.type]), [['U1', 'xor2'], ['U2', 'and2']]);
  const circuit = structuredClone(read);
  // (the user's XOR is their own way of drawing an OR, their NAND the AND's outline: no new outline)
  circuit.gates[0].type = 'or2';
  circuit.gates[1].type = 'nand2';
  const samples = schematicSamples(read, circuit, strokes);
  assert.deepEqual(samples.map(s => s.c), ['or']);
  assert.deepEqual(samples[0], encodeSample('or', read.gates[0].ink.map(k => strokes[k])));
  assert.deepEqual(validSamples(samples), samples);
  // the next reading, with the user's outline: an OR
  const gates = [...gateTemplates(), ...userGateTemplates(samples)];
  assert.deepEqual(readSchematic(strokes, { gates }).gates.map(g => g.type), ['or2', 'and2']);
  // the gates' samples are no letters' templates, and the reverse
  assert.deepEqual(userTemplates(samples), []);
  assert.deepEqual(userGateTemplates([encodeSample('A', [[{ x: 0, y: 0 }, { x: 5, y: 9 }]])]), []);
  assert.deepEqual(GATE_KINDS, ['and', 'or', 'xor', 'buf']);
});

test('a name corrected keeps its letters, recognized on the next try; a name of other letters, none', () => {
  const { strokes } = writeSchematic(HALF_ADDER);
  const read = readSchematic(strokes);
  const net = name => read.nets.find(n => n.name === name);
  // each name's letters and their ink
  assert.deepEqual(net('S').chars.map(c => c.ch), ['S']);
  const circuit = structuredClone(read);
  circuit.nets.find(n => n.name === 'S').name = 'Q';
  const samples = schematicSamples(read, circuit, strokes);
  assert.deepEqual(samples.map(s => s.c), ['Q']);
  const again = readSchematic(strokes, { templates: letters(samples) });
  assert.deepEqual(again.nets.filter(n => n.name).map(n => n.name).sort(), ['A', 'B', 'C', 'Q']);
  // a name of more letters, or nothing changed: none
  circuit.nets.find(n => n.name === 'Q').name = 'SUM';
  assert.deepEqual(schematicSamples(read, circuit, strokes), []);
  assert.deepEqual(schematicSamples(read, structuredClone(read), strokes), []);
  assert.deepEqual(schematicSamples(null, read, strokes), []);
});
