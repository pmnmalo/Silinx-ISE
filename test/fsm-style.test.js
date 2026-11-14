// A state's or a transition's look in a state diagram (core/fsm-style.js, #3883): each value checked and made
// canonical (colours, sizes, widths, the lists), its messages; the defaults left out (an old drawing unchanged, no
// `look` written); a file's values not valid kept and reported by Check as errors, drawn with the default look; the
// file's round trip; the HDL the same with or without looks (VHDL and Verilog); the text's CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeFsm, validateFsm, generateFsm, newFsm, sameFsm, fsmErrors } from '../core/fsm.js';
import { styleValue, normalizeStyle, styleProblems, styleOf, setStyle, styleText, textCss, STYLE_KEYS, STYLE_DEFAULTS } from '../core/fsm-style.js';

const TRAFFIC = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/traffic.fsm.json', import.meta.url), 'utf8'));

test('#3883 styleValue: colours, sizes, widths and the lists, made canonical; refused with their reasons', () => {
  assert.deepEqual(styleValue('state', 'fill', '#FC0'), { value: '#ffcc00' });
  assert.deepEqual(styleValue('state', 'fill', ' #12AbEf '), { value: '#12abef' });
  assert.deepEqual(styleValue('trans', 'stroke', '#000'), { value: '#000000' });
  assert.deepEqual(styleValue('state', 'fontSize', '16'), { value: 16 });
  assert.deepEqual(styleValue('state', 'fontSize', 6), { value: 6 });
  assert.deepEqual(styleValue('state', 'fontSize', 48), { value: 48 });
  assert.deepEqual(styleValue('trans', 'strokeWidth', '2.25'), { value: 2.3 });
  assert.deepEqual(styleValue('trans', 'strokeWidth', 0.5), { value: 0.5 });
  assert.deepEqual(styleValue('trans', 'dash', 'dotted'), { value: 'dotted' });
  assert.deepEqual(styleValue('state', 'textStyle', 'bold-italic'), { value: 'bold-italic' });
  assert.deepEqual(styleValue('state', 'font', 'serif'), { value: 'serif' });
  const no = (kind, key, v) => styleValue(kind, key, v).error;
  assert.equal(no('state', 'fill', 'blue'), "the fill colour 'blue' is not a colour: #rrggbb (e.g. #ffcc00)");
  assert.equal(no('state', 'stroke', '#12345'), "the border colour '#12345' is not a colour: #rrggbb (e.g. #ffcc00)");
  assert.equal(no('trans', 'stroke', 255), 'the line colour 255 is not a colour: #rrggbb (e.g. #ffcc00)');
  assert.equal(no('trans', 'color', '#gggggg'), "the text colour '#gggggg' is not a colour: #rrggbb (e.g. #ffcc00)");
  assert.equal(no('state', 'fontSize', 5), 'the text size 5 must be a whole number from 6 to 48');
  assert.equal(no('state', 'fontSize', 49), 'the text size 49 must be a whole number from 6 to 48');
  assert.equal(no('trans', 'fontSize', 12.5), 'the text size 12.5 must be a whole number from 6 to 48');
  assert.equal(no('trans', 'fontSize', '1e1'), "the text size '1e1' must be a whole number from 6 to 48");
  assert.equal(no('state', 'strokeWidth', '0'), "the border width '0' must be a number from 0.5 to 10");
  assert.equal(no('trans', 'strokeWidth', 11), 'the line width 11 must be a number from 0.5 to 10');
  assert.equal(no('trans', 'strokeWidth', -1), 'the line width -1 must be a number from 0.5 to 10');
  assert.equal(no('trans', 'dash', 'wavy'), "the line style 'wavy' must be one of solid, dashed, dotted");
  assert.equal(no('state', 'textStyle', 'heavy'), "the text style 'heavy' must be one of regular, bold, italic, bold-italic");
  assert.equal(no('trans', 'font', 'Comic Sans'), "the font 'Comic Sans' must be one of sans-serif, serif, monospace");
  assert.equal(no('trans', 'fill', '#ffffff'), "'fill' is not a property of a transition's look (stroke, strokeWidth, dash, color, fontSize, textStyle, font)");
  assert.equal(no('state', 'dash', 'dashed'), "'dash' is not a property of a state's look (fill, stroke, strokeWidth, color, fontSize, textStyle, font)");
});

test('#3883 setStyle: values set, back to the default (left out), the first refused (nothing set); the defaults never written', () => {
  assert.deepEqual(setStyle('state', null, { fill: '#FC0', fontSize: '16', textStyle: 'bold-italic' }), { look: { fill: '#ffcc00', fontSize: 16, textStyle: 'bold-italic' } });
  // (in the keys' order, whatever the order given)
  assert.deepEqual(Object.keys(setStyle('trans', { font: 'serif' }, { color: '#111', stroke: '#222' }).look), ['stroke', 'color', 'font']);
  assert.deepEqual(setStyle('state', { fill: '#ffcc00', fontSize: 16 }, { fill: '', fontSize: null }), { look: null });
  // a value equal to its default: not written (a state's 1.6 and 13; a transition's solid, 12, regular, monospace)
  assert.deepEqual(setStyle('state', null, { strokeWidth: 1.6, fontSize: 13 }), { look: null });
  assert.deepEqual(setStyle('trans', null, { dash: 'solid', fontSize: '12', textStyle: 'regular', font: 'monospace', strokeWidth: '1.60' }), { look: null });
  // a state's regular text is not its default (its name bold)
  assert.deepEqual(setStyle('state', null, { textStyle: 'regular' }), { look: { textStyle: 'regular' } });
  assert.deepEqual(setStyle('trans', { stroke: '#ff0000' }, { stroke: '#00f', fill: '#fff' }),
    { error: "'fill' is not a property of a transition's look (stroke, strokeWidth, dash, color, fontSize, textStyle, font)" });
  assert.deepEqual(setStyle('trans', null, { dash: '' , bend: '' }), { error: "'bend' is not a property of a transition's look (stroke, strokeWidth, dash, color, fontSize, textStyle, font)" });
  assert.deepEqual(setStyle('state', null, { fill: 'red' }), { error: "the fill colour 'red' is not a colour: #rrggbb (e.g. #ffcc00)" });
  // every key of each kind can be set and cleared
  for (const kind of ['state', 'trans']) {
    for (const k of STYLE_KEYS[kind]) {
      const v = /fill|stroke$|color/.test(k) ? '#123456' : k === 'fontSize' ? 20 : k === 'strokeWidth' ? 3 : { dash: 'dashed', textStyle: 'italic', font: 'serif' }[k];
      assert.deepEqual(setStyle(kind, null, { [k]: v }), { look: { [k]: v } }, `${kind} ${k}`);
      assert.deepEqual(setStyle(kind, { [k]: v }, { [k]: null }), { look: null });
    }
  }
  assert.deepEqual(STYLE_DEFAULTS.trans, { strokeWidth: 1.6, dash: 'solid', fontSize: 12, textStyle: 'regular', font: 'monospace' });
});

test('#3883 normalizeStyle, styleProblems, styleOf: a file\'s look kept (its bad values too, for Check), drawn with its valid values', () => {
  assert.equal(normalizeStyle('state', undefined), null);
  assert.equal(normalizeStyle('state', {}), null);
  assert.equal(normalizeStyle('state', { fill: '', fontSize: null, strokeWidth: 1.6 }), null);
  assert.deepEqual(normalizeStyle('state', { fontSize: '20', fill: '#ABC', strokeWidth: 2 }), { fill: '#aabbcc', strokeWidth: 2, fontSize: 20 });
  const bad = { fill: 'blue', fontSize: 13, weight: 'bold', color: '#00ff00' };
  assert.deepEqual(normalizeStyle('state', bad), { fill: 'blue', color: '#00ff00', weight: 'bold' });
  assert.deepEqual(styleProblems('state', normalizeStyle('state', bad)), ["the fill colour 'blue' is not a colour: #rrggbb (e.g. #ffcc00)",
    "'weight' is not a property of a state's look (fill, stroke, strokeWidth, color, fontSize, textStyle, font)"]);
  assert.deepEqual(styleOf('state', { look: normalizeStyle('state', bad) }), { color: '#00ff00' });
  assert.deepEqual(styleOf('trans', {}), {});
  assert.equal(normalizeStyle('trans', 'red'), 'red');
  assert.deepEqual(styleProblems('trans', 'red'), ['its look must be an object { stroke, strokeWidth, dash, color, fontSize, textStyle, font }']);
  assert.deepEqual(styleProblems('trans', null), []);
  assert.deepEqual(styleOf('trans', { look: 'red' }), {});
});

test('#3883 styleText and textCss: the look in words; its texts\' inline CSS, only what it sets', () => {
  assert.equal(styleText('state', null), 'the default look');
  assert.equal(styleText('state', { fill: '#ffcc00', strokeWidth: 3, fontSize: 16 }), 'fill colour #ffcc00, border width 3, text size 16');
  assert.equal(styleText('trans', { stroke: '#ff0000', dash: 'dotted', textStyle: 'bold' }), 'line colour #ff0000, line style dotted, text style bold');
  assert.equal(textCss({}, 13), '');
  assert.equal(textCss({ color: '#ff0000', fontSize: 26, textStyle: 'italic', font: 'serif' }, 13, 12), 'fill:#ff0000;font-size:24px;font-weight:400;font-style:italic;font-family:serif');
  assert.equal(textCss({ fontSize: 26, textStyle: 'bold' }, 13), 'font-size:26px;font-weight:700;font-style:normal');
  assert.equal(textCss({ textStyle: 'bold-italic' }, 12), 'font-weight:700;font-style:italic');
});

test('#3883 normalizeFsm: an old drawing unchanged (no look written); a look kept through the file\'s round trip', () => {
  const t = normalizeFsm(TRAFFIC);
  assert.ok([...t.states, ...t.transitions].every((x) => !('look' in x)));
  assert.deepEqual(normalizeFsm(t), t);
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeFsm(newFsm('a')))), normalizeFsm(newFsm('a')));
  const m = clone(TRAFFIC);
  m.states[0].look = { fill: '#FFCC00', fontSize: 16, strokeWidth: 1.6 };
  m.transitions[0].look = { stroke: '#c00', dash: 'dashed', strokeWidth: 3, font: 'monospace', textStyle: 'bold' };
  m.transitions[1].look = { dash: 'solid' };
  const n = normalizeFsm(m);
  assert.deepEqual(n.states[0].look, { fill: '#ffcc00', fontSize: 16 });
  assert.deepEqual(n.transitions[0].look, { stroke: '#cc0000', strokeWidth: 3, dash: 'dashed', textStyle: 'bold' });
  assert.equal('look' in n.transitions[1], false);
  const back = normalizeFsm(JSON.parse(JSON.stringify(n, null, 2)));
  assert.deepEqual(back, n);
  assert.deepEqual(validateFsm(n), validateFsm(TRAFFIC));
  assert.ok(sameFsm(n, TRAFFIC));
});

test('#3883 the HDL made from a diagram is the same with looks or without, in VHDL and in Verilog', () => {
  const m = clone(TRAFFIC);
  for (const s of m.states) s.look = { fill: '#ffeeaa', stroke: '#333333', strokeWidth: 3, color: '#0000ff', fontSize: 18, textStyle: 'italic', font: 'serif' };
  for (const t of m.transitions) t.look = { stroke: '#ff0000', strokeWidth: 2, dash: 'dotted', color: '#008000', fontSize: 14, textStyle: 'bold', font: 'sans-serif' };
  for (const lang of ['vhdl', 'verilog']) {
    const a = generateFsm(normalizeFsm({ ...TRAFFIC, lang }), lang), b = generateFsm(normalizeFsm({ ...m, lang }), lang);
    assert.ok(a.code.length > 500);
    assert.deepEqual(b, a, lang);
  }
});

test('#3883 Check: a file\'s look not valid is an error of its state or transition (its other problems the same)', () => {
  const m = clone(TRAFFIC);
  m.states[6].look = { fill: 'blue', fontSize: 100 };
  m.transitions[0].look = { dash: 'wavy', fill: '#fff' };
  m.transitions[1].look = 'red';
  const d = validateFsm(m), base = validateFsm(TRAFFIC);
  assert.deepEqual(d.filter((x) => !base.some((y) => y.message === x.message)), [
    { severity: 'error', message: "State NIGHT: the fill colour 'blue' is not a colour: #rrggbb (e.g. #ffcc00)", state: 's7' },
    { severity: 'error', message: 'State NIGHT: the text size 100 must be a whole number from 6 to 48', state: 's7' },
    { severity: 'error', message: "Transition CARS → NIGHT: the line style 'wavy' must be one of solid, dashed, dotted", transition: 't1' },
    { severity: 'error', message: "Transition CARS → NIGHT: 'fill' is not a property of a transition's look (stroke, strokeWidth, dash, color, fontSize, textStyle, font)", transition: 't1' },
    { severity: 'error', message: 'Transition CARS → CARS_YELLOW: its look must be an object { stroke, strokeWidth, dash, color, fontSize, textStyle, font }', transition: 't2' },
  ]);
  // the example's own: no errors and no warnings, as before
  assert.deepEqual(base.filter((x) => x.severity !== 'info'), []);
  assert.equal(fsmErrors(m).length, 5);
});

function clone(x) { return JSON.parse(JSON.stringify(x)); }
