// core/ink/: the handwriting recognizer of Boolean expressions (#1056). Its built-in templates are up to date
// with the skeleton font; $P matches whatever the stroke order and direction; held-out handwriting (other seeds,
// stronger distortions than the templates') is read with the expected accuracy, glyph by glyph and expression by
// expression; the segmentation (dots of i and j, primes, '='), the slant, overbars (nested too), the symbols
// written alike chosen by the parser, the case by the size; the user's samples; the warnings and the errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLYPHS, SYMBOLS, advance } from '../core/ink/font.js';
import { handGlyph, writeText, rng } from '../core/ink/synth.js';
import { cloud, classify, template, matchDistance, inkLength, N } from '../core/ink/pdollar.js';
import { segment, slantOf, boxOf, InkError } from '../core/ink/segment.js';
import { builtinTemplates, userTemplates, encodeSample, decodeStrokes, validSamples, USER_WEIGHT } from '../core/ink/templates.js';
import { recognizeExpression, splitEquation, expressionInputs, UNKNOWN_DISTANCE } from '../core/ink/expression.js';
import { LogicError, parseExpr, exprColumn } from '../core/logic.js';
import { TEMPLATES_FILE, templatesText } from '../scripts/ink-templates.mjs';

const MARKS = ["'", '·'];
// written alike: the recognizer's choice between them is the context's (case by size, the rest by the parser)
const ALIKE = [['c', 'C'], ['o', 'O', '0'], ['s', 'S'], ['v', 'V'], ['w', 'W'], ['x', 'X'], ['z', 'Z'], ['l', '|', '1', 'I'],
  ['k', 'K'], ['p', 'P'], ['u', 'U'], ['y', 'Y']];
const same = (a, b) => a === b || ALIKE.some((g) => g.includes(a) && g.includes(b));
const read = (text, opts = {}) => recognizeExpression(writeText(text, opts).strokes, opts);

test('the built-in templates are made from the skeleton font (node scripts/ink-templates.mjs)', () => {
  assert.equal(fs.readFileSync(TEMPLATES_FILE, 'utf8'), templatesText());
  const t = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
  assert.equal(t.version, 1);
  // every symbol of the set, every variant three times (the skeleton, two hands)
  assert.deepEqual([...new Set(t.templates.map((x) => x.c))].sort(), [...SYMBOLS].sort());
  assert.equal(t.templates.length, SYMBOLS.reduce((n, c) => n + 3 * GLYPHS[c].length, 0));
  assert.deepEqual(validSamples(t.templates), t.templates);
  // the set asked for: A-Z, a-z, 0-9, _ and the operators
  for (const c of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_', '+', '·', '*', "'", '¬', '~', '(', ')', '=', '⊕', '^', '&', '|']) {
    assert.ok(SYMBOLS.includes(c), c);
  }
  assert.equal(SYMBOLS.length, 76);
  assert.ok(advance('m') > advance('i'));
});

test('$P: a cloud of N points, centred; the same symbol whatever its strokes\' order and direction; no ink is an error', () => {
  const a = handGlyph('A', { amount: 0, variant: 0 });
  const c = cloud(a);
  assert.equal(c.length, N);
  assert.ok(Math.abs(c.reduce((s, p) => s + p.x, 0)) < 1e-9 && Math.abs(c.reduce((s, p) => s + p.y, 0)) < 1e-9);
  const reordered = [a[1], [...a[0]].reverse()];
  assert.ok(matchDistance(c, cloud(reordered)) < 0.15, 'order and direction');
  assert.ok(matchDistance(c, cloud(handGlyph('B', { amount: 0, variant: 0 }))) > 0.5);
  // the same symbol drawn larger and elsewhere
  assert.ok(matchDistance(c, cloud(a.map((s) => s.map((p) => ({ x: 300 + 80 * p.x, y: 20 + 80 * p.y }))))) < 1e-9);
  // one template per symbol, the nearest first
  const best = classify(reordered, builtinTemplates());
  assert.equal(best[0].ch, 'A');
  assert.equal(new Set(best.map((b) => b.ch)).size, best.length);
  assert.ok(best.every((b, i) => i === 0 || b.d >= best[i - 1].d));
  // a dot: all the points at one place
  assert.equal(cloud([[{ x: 5, y: 5 }]]).length, N);
  assert.throws(() => cloud([]), /no ink/);
  assert.throws(() => cloud([[]]), /no ink/);
  // the amount of ink: a ⊕ has more than a +
  assert.ok(inkLength(handGlyph('⊕', { amount: 0 })) > 2 * inkLength(handGlyph('+', { amount: 0 })));
});

test('held-out glyphs (other hands than the templates\') are recognized: at least 95%', () => {
  const rand = rng(4242), templates = builtinTemplates().filter((t) => !MARKS.includes(t.ch));
  let ok = 0, n = 0;
  const wrong = [];
  for (let k = 0; k < 3; k++) {
    for (const ch of SYMBOLS.filter((c) => !MARKS.includes(c))) {
      const got = classify(handGlyph(ch, { rand, amount: 1 }), templates)[0];
      n++;
      if (same(got.ch, ch)) ok++; else wrong.push(`${ch}->${got.ch}`);
      assert.ok(got.d < UNKNOWN_DISTANCE, `${ch} recognized (${got.d})`);
    }
  }
  assert.ok(ok / n >= 0.95, `${ok}/${n}: ${wrong.join(' ')}`);
});

// the held-out expressions: [written, expected text, options]
const EXPRESSIONS = [
  ["F=A·B'+C", "F = A·B' + C"],
  ['f=ab+c', 'f = ab + c'],
  ["Y=(A+B)·C'", "Y = (A + B)·C'"],
  ['Z=A⊕B', 'Z = A ⊕ B'],
  ['S=x*y+z', 'S = x*y + z'],
  ['out=a^b', 'out = a^b'],
  ['F=AB+CD+1', 'F = AB + CD + 1'],
  ['F=~(A+B)', 'F = ~(A + B)'],
  ['Q=x_1+x_2', 'Q = x_1 + x_2'],
  ['F=0+A', 'F = 0 + A'],
  ['F=wxyz', 'F = wxyz'],
  ['G=¬A&B|C', 'G = ¬A&B|C'],
  ['M=ab+bc+ac', 'M = ab + bc + ac'],
  ['T=(x+y)(x+z)', 'T = (x + y)(x + z)'],
];

test('held-out expressions are read: at least 88% exactly (76 of 84), every one of a careful hand', () => {
  let ok = 0, n = 0;
  const wrong = [];
  for (let seed = 1; seed <= 6; seed++) {
    for (const [written, want] of EXPRESSIONS) {
      const r = read(written, { seed: 100 + seed });
      n++;
      if (r.written === want) ok++; else wrong.push(`${written} -> ${r.written}`);
    }
  }
  assert.ok(ok / n >= 0.88, `${ok}/${n}: ${wrong.join('; ')}`);
  for (const [written, want] of EXPRESSIONS) {
    const r = read(written, { seed: 7, amount: 0.4 });
    assert.equal(r.written, want, written);
    assert.deepEqual(r.warnings, [], written);
    assert.equal(r.error, null, written);
  }
});

test('a recognized expression: its two sides, its characters, no warnings; it fills a truth table', () => {
  const r = read("F=A·B'+C", { seed: 3, amount: 0.4 });
  // as written, and in the editor's notation (#2001)
  assert.equal(r.written, "F = A·B' + C");
  assert.equal(r.text, 'F = A./B + C');
  assert.equal(r.name, 'F');
  assert.equal(r.expr, 'A./B + C');
  assert.deepEqual(r.chars.map((c) => c.ch), [...'F=A·B\'+C']);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.error, null);
  assert.ok(r.chars.every((c, i) => i === 0 || c.box.minX > r.chars[i - 1].box.minX));
  // every stroke is in one character
  assert.deepEqual(r.chars.flatMap((c) => c.ink).sort((a, b) => a - b), [...Array(r.chars.flatMap((c) => c.ink).length).keys()]);
  assert.equal(exprColumn(parseExpr(r.expr, { vars: ['A', 'B', 'C'] }), ['A', 'B', 'C']), '01011101');
  // no '=': all of it is the expression
  const e = read('a+b', { seed: 3, amount: 0.4 });
  assert.deepEqual([e.text, e.name, e.expr, e.error], ['a + b', '', 'a + b', null]);
});

test("the text read in the editor's notation (#2001): /A.B + C, a bar over a group /(…); as written when it does not parse", () => {
  const cases = [
    ["F=A'·B+C", {}, "F = A'·B + C", 'F = /A.B + C'],
    ['H=AB', { bars: [[2, 2]] }, "H = A'B", 'H = /A.B'],
    ['H=A+B', { bars: [[2, 4]] }, "H = (A + B)'", 'H = /(A + B)'],
    ['H=AB', { bars: [[2, 2], [2, 3]] }, "H = (A'B)'", 'H = /(/A.B)'],
    ['S=x*y+z', {}, 'S = x*y + z', 'S = x.y + z'],
  ];
  for (const [w, o, written, text] of cases) {
    const r = read(w, { seed: 4, amount: 0.4, ...o });
    assert.deepEqual([r.written, r.text, r.error], [written, text, null], w);
    // the same expression: the editor reads the text back as the function written
    const { expr } = splitEquation(written), vars = expressionInputs(expr);
    assert.equal(exprColumn(parseExpr(r.expr, { vars }), vars), exprColumn(parseExpr(expr, { vars }), vars), w);
  }
  // no '=': the expression alone
  assert.equal(read('AB', { seed: 4, amount: 0.4, bars: [[0, 0]] }).text, '/A.B');
  // not an expression: as written, for the user to correct
  const open = read('F=(A+B', { seed: 3, amount: 0.4 });
  assert.deepEqual([open.text, open.written], ['F = (A + B', 'F = (A + B']);
  assert.ok(open.error);
});

test('segmentation: the dots of i and j with them, a prime apart, the slant made upright', () => {
  const s = segment(writeText("ij+A'", { seed: 5, amount: 0.4 }).strokes);
  assert.deepEqual(s.chars.map((c) => c.strokes.length), [2, 2, 2, 2, 1]);
  assert.deepEqual(s.bars, []);
  assert.equal(read("ij+A'", { seed: 5, amount: 0.4 }).written, "ij + A'");
  // the slant: none upright, the shear of a leaning hand
  const h = handGlyph('H', { amount: 0 });
  assert.equal(slantOf(h), 0);
  const leaning = h.map((st) => st.map((p) => ({ x: p.x + 0.3 * (1 - p.y), y: p.y })));
  assert.ok(Math.abs(slantOf(leaning) + 0.3) < 0.01, String(slantOf(leaning)));
  // leaning letters written close: still apart once upright
  const text = 'F=AB';
  const w = writeText(text, { seed: 9, amount: 0, spacing: 0.9 });
  const lean = w.strokes.map((st) => st.map((p) => ({ x: p.x + 0.35 * (80 - p.y), y: p.y })));
  assert.equal(segment(lean).chars.length, 4);
  assert.equal(recognizeExpression(lean).written, 'F = AB');
  // a dot of AND in the middle, a prime at the top
  assert.deepEqual(read("A·B'", { seed: 2, amount: 0.4 }).chars.map((c) => c.ch), ['A', '·', 'B', "'"]);
  assert.deepEqual(boxOf([[{ x: 1, y: 2 }, { x: 3, y: 6 }]]), { minX: 1, minY: 2, maxX: 3, maxY: 6, w: 2, h: 4, cx: 2, cy: 4 });
});

test('overbars are NOT: over one letter a prime, over more a bracket, nested ones too; = is not a bar', () => {
  assert.equal(read('H=AB', { seed: 4, amount: 0.4, bars: [[2, 2]] }).written, "H = A'B");
  assert.equal(read('H=A+B', { seed: 4, amount: 0.4, bars: [[2, 4]] }).written, "H = (A + B)'");
  assert.equal(read('H=AB', { seed: 4, amount: 0.4, bars: [[2, 2], [2, 3]] }).written, "H = (A'B)'");
  assert.equal(read('H=A+BC', { seed: 6, amount: 0.4, bars: [[4, 5], [2, 5]] }).written, "H = (A + (BC)')'");
  const r = read('H=AB', { seed: 4, amount: 0.4, bars: [[2, 3]] });
  assert.equal(segment(writeText('H=AB', { seed: 4, amount: 0.4, bars: [[2, 3]] }).strokes).bars.length, 1);
  assert.equal(r.expr, '/(A.B)');
  assert.equal(exprColumn(parseExpr(r.expr, { vars: ['A', 'B'] }), ['A', 'B']), '1110');
  // the strokes of = and of a T, E or F touching: not bars
  for (const t of ['A=B', 'T', 'E+F', 't+f', 'Z+7']) assert.deepEqual(segment(writeText(t, { seed: 1, amount: 0.4 }).strokes).bars, [], t);
  // held-out hands: the bars still read
  let ok = 0;
  for (let seed = 1; seed <= 6; seed++) if (read('H=A+B', { seed, bars: [[2, 4]] }).written === "H = (A + B)'") ok++;
  assert.ok(ok >= 5, `${ok}/6`);
});

test('the symbols written alike: case by size, the ring and the line by their place, the reading that parses', () => {
  // c / C, o / O, x / X by the height of the letter
  assert.equal(read('F=Cc+Xx+Oo', { seed: 3, amount: 0.3 }).written, 'F = Cc + Xx + Oo');
  assert.equal(read('S=x*y+z', { seed: 3, amount: 0.3 }).written, 'S = x*y + z');
  // a ring alone is 0, a line alone 1, a line between operands |
  assert.equal(read('f=o+a', { seed: 2, amount: 0.3 }).written, 'f = 0 + a');
  assert.equal(read('f=a|b', { seed: 2, amount: 0.3 }).written, 'f = a|b');
  assert.equal(read('f=l+a', { seed: 2, amount: 0.3 }).written, 'f = 1 + a');
  // the inputs known: a letter that is not one of them is read as one that parses (a 'q' for the input 'g')
  const g = writeText('f=g+a', { seed: 11, amount: 0.3 });
  const gq = [...g.strokes];
  const q = writeText('q', { seed: 11, amount: 0.3, x: 0 }).strokes;
  const box = boxOf(gq.slice(4, 6));
  const qBox = boxOf(q);
  gq.splice(4, 2, ...q.map((st) => st.map((p) => ({ x: p.x - qBox.minX + box.minX, y: p.y - qBox.minY + box.minY }))));
  assert.equal(recognizeExpression(gq).written, 'f = q + a');
  assert.equal(recognizeExpression(gq, { vars: ['g', 'a'] }).written, 'f = g + a');
  assert.equal(recognizeExpression(gq, { vars: ['g', 'a'] }).error, null);
});

test('splitEquation and expressionInputs: the name, and the inputs as written by hand', () => {
  assert.deepEqual(splitEquation("F = A·B' + C"), { name: 'F', expr: "A·B' + C" });
  assert.deepEqual(splitEquation('a + b'), { name: '', expr: 'a + b' });
  assert.deepEqual(splitEquation(null), { name: '', expr: '' });
  assert.deepEqual(expressionInputs("ab'c + a'd"), ['a', 'b', 'c', 'd']);
  assert.deepEqual(expressionInputs("A·B' + a"), ['A', 'B']);
  assert.deepEqual(expressionInputs('x_1 + x_2·en'), ['x_1', 'x_2', 'en']);
  assert.deepEqual(expressionInputs('1 + 0'), []);
  assert.throws(() => expressionInputs('a + '), LogicError);
  assert.throws(() => expressionInputs(''), /the expression is empty/);
});

test('errors and warnings: no ink, a symbol not recognized, a text that does not parse, two =', () => {
  for (const ink of [[], [[]], null]) assert.throws(() => recognizeExpression(ink), (e) => e instanceof InkError && e.message === 'Nothing written: write the expression on the pad.');
  // a scribble: not a symbol of the set
  const rand = rng(77);
  const scribble = [[{ x: 330, y: 45 }]];
  for (let i = 1; i < 40; i++) scribble[0].push({ x: scribble[0][i - 1].x + rand() * 30 - 15, y: scribble[0][i - 1].y + rand() * 30 - 15 });
  const w = writeText('F=A+', { seed: 1, amount: 0.3 });
  const r = recognizeExpression([...w.strokes, ...scribble]);
  assert.equal(r.written, 'F = A + ?');
  assert.deepEqual(r.warnings, ['A symbol was not recognized (shown as ?): write it again, or teach Silinx your handwriting.']);
  assert.equal(r.error, "unexpected character '?' (at position 5)");
  // a star, twice
  const star = (x0) => Array.from({ length: 5 }, (_, j) => [{ x: x0 + 30 * Math.cos(j * 1.2566), y: 50 + 30 * Math.sin(j * 1.2566) }, { x: x0 + 30 * Math.cos(j * 1.2566 + 2.5), y: 50 + 30 * Math.sin(j * 1.2566 + 2.5) }]);
  const two = recognizeExpression([...star(100), ...star(200)]);
  assert.equal(two.written, '??');
  assert.deepEqual(two.warnings, ['2 symbols were not recognized (shown as ?): write them again, or teach Silinx your handwriting.']);
  // the text that does not parse: the parser's message
  const open = read('F=(A+B', { seed: 1, amount: 0.3 });
  assert.equal(open.written, 'F = (A + B');
  assert.deepEqual(open.warnings, []);
  assert.equal(open.error, "missing ')' (opened at position 1) (at position 7)");
  const empty = read('F=', { seed: 1, amount: 0.3 });
  assert.deepEqual([empty.text, empty.expr, empty.error], ['F =', '', 'the expression is empty']);
  const twice = read('F=A=B', { seed: 1, amount: 0.3 });
  assert.deepEqual(twice.warnings, ["More than one '=': only the first one separates the name from the expression."]);
  assert.equal(twice.error, "unexpected character '=' (at position 3)");
  // inputs given: an unknown variable is the parser's error
  const unknown = read('F=A+D', { seed: 1, amount: 0.3, vars: ['A', 'B'] });
  assert.equal(unknown.written, 'F = A + D');
  assert.equal(unknown.error, "unknown variable 'D' (the inputs are A, B) (at position 5)");
});

test('teach Silinx my handwriting: the user\'s samples are templates, preferred; what the browser kept is checked', () => {
  // an A written as a five-pointed star: not a symbol of the set, until the user teaches it
  const star = (x0, y0, r, turn) => Array.from({ length: 5 }, (_, j) => [{ x: x0 + r * Math.cos(j * 1.2566 + turn), y: y0 + r * Math.sin(j * 1.2566 + turn) }, { x: x0 + r * Math.cos(j * 1.2566 + 2.5 + turn), y: y0 + r * Math.sin(j * 1.2566 + 2.5 + turn) }]);
  const strokes = [...star(60, 50, 30, 0.05), ...writeText('+B', { seed: 2, amount: 0.3, x: 110, y: 20 }).strokes];
  assert.equal(recognizeExpression(strokes).written, 'M + B');
  const samples = [encodeSample('A', star(0, 0, 40, 0)), encodeSample('A', star(0, 0, 25, -0.1))];
  const templates = [...builtinTemplates(), ...userTemplates(samples)];
  const r = recognizeExpression(strokes, { templates });
  assert.equal(r.written, 'A + B');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.chars[0].alts[0].ch, 'A');
  assert.equal(userTemplates(samples)[0].k, USER_WEIGHT);
  // a sample: whole numbers, the larger side 100, decoded to its strokes
  const e = encodeSample('x', [[{ x: 10, y: 10 }, { x: 30, y: 50 }], [], [{ x: 30, y: 10 }, { x: 10, y: 50 }]]);
  assert.deepEqual(e, { c: 'x', s: [[0, 0, 50, 100], [50, 0, 0, 100]] });
  assert.deepEqual(decodeStrokes(e.s), [[{ x: 0, y: 0 }, { x: 50, y: 100 }], [{ x: 50, y: 0 }, { x: 0, y: 100 }]]);
  // what the browser kept may be anything: only the samples of a symbol of the set, with strokes of numbers
  assert.deepEqual(validSamples(null), []);
  assert.deepEqual(validSamples('x'), []);
  assert.deepEqual(validSamples([e, { c: 'é', s: e.s }, { c: 'x', s: [[1, 2, 3]] }, { c: 'x', s: [] }, { c: 'x', s: [[1, 'a']] }, null, { c: 'x' }]), [e]);
  assert.equal(template('A', decodeStrokes(e.s)).ch, 'A');
});
