// UI: handwritten Boolean expressions (#1056), from the Development menu while a preview (#1098). A truth table
// made by the New Source wizard from a typed expression; the same expression written on the Handwritten Expression
// dialog's pad with the mouse, a finger and a pen (CDP input: pointer events of each type), filling the output's
// column; an expression with a stroke drawn by page.touchDrag; Undo, Redo (their keys too), Clear undone, a hand
// resting on the screen while the pen writes (ignored); Teach Silinx my handwriting (a sample saved, used,
// forgotten); the dialog in Portuguese, its warnings and its errors; the pad zoomed and moved. The console's lines are
// asserted; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';
import { writeText } from '../../core/ink/synth.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const T = '.doc:not([hidden]) .tt-editor';
// a development build: its Development menu has the handwritten input while it is a preview (#1098)
const DEV = { commit: 'abc1234', date: '2026-10-23 12:00', since: '15.12.0', changes: [] };
const D = '.dlg-overlay .ink-dialog';
const warnings = (page) => page.console.filter((m) => /^warn/.test(m.type)).map((m) => m.text);
const canvasAt = (page) => page.eval((d) => { const r = document.querySelector(`${d} .ink-canvas`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, D);
const recognized = (page) => page.eval((d) => document.querySelector(`${d} .ink-text`).value, D);
const message = (page) => page.eval((d) => document.querySelector(`${d} .ink-msg`).innerText.trim(), D);
const cells = (page, out) => page.eval((t, o) => [...document.querySelectorAll(`${t} .tt-cell[data-out="${o}"]`)].map((c) => c.textContent).join(''), T, out);

/** One stroke through the client points, with the mouse, a pen or a finger: its points sent at once, in order, each
 *  not waited for (#1906: Chrome handles one input event a frame, so a drawing of 1600 points waited for 1600 frames,
 *  90 s on a slow runner). */
async function stroke(page, pts, kind) {
  const p = pts.map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }));
  if (kind === 'touch') {
    const at = (q) => [{ x: q.x, y: q.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(p[0]) });
    await Promise.all(p.slice(1).map((q) => page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(q) })));
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  const ev = (type, q, buttons) => page.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1, pointerType: kind, force: kind === 'pen' ? 0.5 : undefined });
  await ev('mouseMoved', p[0], 0);
  await ev('mousePressed', p[0], 1);
  await Promise.all(p.slice(1).map((q) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y, button: 'left', buttons: 1, pointerType: kind })));
  await ev('mouseReleased', p.at(-1), 0);
}

/** Write a text on the pad (the font's hand, mildly): kind(i) is the tool of stroke i; returns the boxes of its characters (client). */
async function write(page, text, { kind = () => 'pen', seed = 3, bars = [] } = {}) {
  const c = await canvasAt(page);
  const w = writeText(text, { seed, amount: 0.4, size: 64, x: 24, y: 30, bars });
  for (const [i, s] of w.strokes.entries()) await stroke(page, s.map((q) => ({ x: c.x + q.x, y: c.y + q.y })), kind(i));
  return w.boxes.map((b) => b && { minX: c.x + b.minX, maxX: c.x + b.maxX, minY: c.y + b.minY, maxY: c.y + b.maxY });
}
const waitText = (page, text) => page.waitFor((d, t) => document.querySelector(`${d} .ink-text`)?.value === t, [D, text], { what: `recognized '${text}'` });

uiTest('Handwritten expressions: a truth table from the New Source wizard, the editor\'s column, Undo, Redo and Clear', E, async (page) => {
  await page.eval(() => localStorage.removeItem('silinx.ink.samples'));
  await makeProject(env, { name: 'Ink', files: {} });
  await page.openProject('Ink');
  await page.menu('Tools', 'Truth Table / Karnaugh Map…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'hand');
  // the expression row: a truth table's only
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main .form-grid > label')].map((l) => l.textContent)), ['Source type:', 'File name:', 'Location:', 'Expression:']);
  // (typed: written by hand from the Development menu only while a preview, #1098)
  await page.fill('.dlg-overlay .ns-tt-expr', "F = A·B' + C");
  assert.equal(await page.eval(() => document.querySelector('.ns-tt-expr').value), "F = A·B' + C");
  await page.dialogButton('Next >');
  const summary = await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main pre')?.textContent, [], { what: 'the summary' });
  assert.match(summary, /\nSource Type: Truth Table\nSource Name: hand\.tt\.json\n\nExpression: F = A·B' \+ C$/);
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/hand.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const doc = JSON.parse(await page.eval(async () => (await fetch('/api/projects/Ink/file?path=src%2Fhand.tt.json')).text()));
  assert.deepEqual([doc.inputs, doc.outputs, doc.table, doc.exprs], [['A', 'B', 'C'], ['F'], { F: '01011101' }, { F: "A·B' + C" }]);
  assert.equal(await cells(page, 'F'), '01011101');
  const lines = (await page.consoleText()).split('\n');
  assert.deepEqual(lines.slice(lines.findIndex((l) => /^Project ".*" opened/.test(l)) + 1), [
    'src/hand.vhd generated from src/hand.tt.json (every source has its HDL)',
    "Created Truth Table 'src/hand.tt.json'.",
  ]);

  // Development ▸ Handwritten Expression… (#1098): the same expression written with the mouse, a finger and a pen
  await page.menu('Development', 'Handwritten Expression…');
  await page.waitDialog('Handwritten Expression');
  // the pad: a finger writes on it, the page does not pan
  assert.equal(await page.eval((d) => getComputedStyle(document.querySelector(`${d} .ink-canvas`)).touchAction, D), 'none');
  // an iPad's pen (#1086): the dialog's text not selected by it, its fields still editable, the pad's touches' own
  // actions cancelled
  assert.deepEqual(await page.eval((d) => {
    const dlg = document.querySelector(d).closest('.dlg'), sel = (e) => getComputedStyle(e).userSelect;
    const t = document.querySelector(`${d} .ink-canvas`), r = t.getBoundingClientRect();
    const touch = new Touch({ identifier: 9, target: t, clientX: r.left + 20, clientY: r.top + 20 });
    const ev = (type) => { const e = new TouchEvent(type, { cancelable: true, bubbles: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }); t.dispatchEvent(e); return e.defaultPrevented; };
    return [sel(dlg.querySelector('.hint')), sel(dlg.querySelector('.ink-text')), ev('touchstart'), ev('touchmove')];
  }, D), ['none', 'text', true, true]);
  // no text field in focus (an on-screen keyboard would cover the pad)
  await page.waitFor((d) => !document.querySelector(d).contains(document.activeElement), [D], { what: 'nothing in focus' });
  // F and = with the mouse, A·B' with a finger, + C with a pen
  const text = "F=A·B'+C";
  const { owner } = writeText(text, { seed: 3, amount: 0.4 });
  const tool = (k) => (owner[k] < 2 ? 'mouse' : owner[k] < 6 ? 'touch' : 'pen');
  assert.deepEqual([...new Set(owner.map((_, k) => tool(k)))], ['mouse', 'touch', 'pen']);
  await write(page, text, { kind: tool });
  await waitText(page, 'F = A./B + C');
  assert.equal(await message(page), '');
  // a hand resting on the screen while the pen writes: no stroke
  const c = await canvasAt(page);
  await stroke(page, [{ x: c.x + c.w - 40, y: c.y + 30 }, { x: c.x + c.w - 30, y: c.y + 120 }], 'touch');
  await page.eval(() => new Promise((r) => setTimeout(r, 400)));
  assert.equal(await recognized(page), 'F = A./B + C');
  // a stroke more, undone, redone, undone by the keys (#1092)
  const states = () => page.eval((d) => ['ink-undo', 'ink-redo', 'ink-clear'].map((k) => !document.querySelector(`${d} .${k}`).disabled), D);
  assert.deepEqual(await states(), [true, false, true]);
  await stroke(page, [{ x: c.x + c.w - 60, y: c.y + 40 }, { x: c.x + c.w - 60, y: c.y + 110 }], 'pen');
  // (C| does not parse: the text as written, #2001)
  const more = await page.waitFor((d) => { const v = document.querySelector(`${d} .ink-text`).value; return /^F = A·B' \+ C.+/.test(v) && v; }, [D], { what: 'a character more' });
  await page.click(`${D} .ink-undo`);
  await waitText(page, 'F = A./B + C');
  assert.deepEqual(await states(), [true, true, true]);
  await page.click(`${D} .ink-redo`);
  await waitText(page, more);
  assert.deepEqual(await states(), [true, false, true]);
  await page.key('z', { modifiers: 2 });
  await waitText(page, 'F = A./B + C');
  await page.key('y', { modifiers: 2 });
  await waitText(page, more);
  await page.key('z', { modifiers: 2 });
  await waitText(page, 'F = A./B + C');
  // Clear empties the pad; undone, the drawing is back; redone, gone again; a stroke written then: nothing to redo
  await page.click(`${D} .ink-clear`);
  await waitText(page, '');
  assert.deepEqual(await states(), [true, false, false]);
  await page.click(`${D} .ink-undo`);
  await waitText(page, 'F = A./B + C');
  await page.click(`${D} .ink-redo`);
  await waitText(page, '');
  await page.click(`${D} .ink-undo`);
  await waitText(page, 'F = A./B + C');
  await page.click(`${D} .ink-redo`);
  await waitText(page, '');
  await write(page, text, { kind: () => 'pen' });
  await waitText(page, 'F = A./B + C');
  assert.deepEqual(await states(), [true, false, true]);
  await page.dialogButton('Insert');
  await page.waitNoDialog();
  await page.waitFor((t) => document.querySelector(`${t} .tt-expr-in`).value === 'A./B + C', [T], { what: 'the expression written' });
  assert.equal(await cells(page, 'F'), '01011101');

  // the editor: F = A | C, its | drawn by a finger with page.touchDrag
  await page.menu('Development', 'Handwritten Expression…');
  await page.waitDialog('Handwritten Expression');
  const boxes = await write(page, 'F=A C', { kind: () => 'mouse', seed: 5 });
  const x = (boxes[2].maxX + boxes[4].minX) / 2;
  await page.touchDrag({ x, y: boxes[2].minY - 6 }, { x, y: boxes[2].maxY + 4 }, { steps: 10 });
  await waitText(page, 'F = A + C');
  await page.dialogButton('Insert');
  await page.waitNoDialog();
  await page.waitFor((t) => document.querySelector(`${t} .tt-expr-in`).value === 'A + C', [T], { what: 'the expression inserted' });
  assert.equal(await cells(page, 'F'), '01011111');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-err`).textContent, T), '');
  // an expression with an input the table does not have: the parser's error, the dialog stays open
  await page.menu('Development', 'Handwritten Expression…');
  await page.waitDialog('Handwritten Expression');
  await write(page, 'F=A+D', { seed: 2 });
  await waitText(page, 'F = A + D');
  assert.equal(await message(page), "unknown variable 'D' (the inputs are A, B, C) (at position 5)");
  await page.dialogButton('Insert');
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay').length), 1);
  // corrected by hand in the text
  await page.fill(`${D} .ink-text`, 'F = A + B');
  assert.equal(await message(page), '');
  await page.dialogButton('Insert');
  await page.waitNoDialog();
  await page.waitFor((t) => document.querySelector(`${t} .tt-expr-in`).value === 'A + B', [T], { what: 'the corrected expression' });
  assert.equal(await cells(page, 'F'), '00111111');
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, build: DEV });

uiTest('Handwritten expressions: Teach Silinx my handwriting, and the dialog in Portuguese with its warnings and errors', E, async (page) => {
  await page.eval(() => localStorage.removeItem('silinx.ink.samples'));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    void page.eval(async () => { window.__ink = (await import('/js/ink-dialog.js')).handwrittenExpression(); });
    await page.waitDialog('Expressão Manuscrita');
    const labels = await page.eval((d) => [...document.querySelector(d).closest('.dlg').querySelectorAll('button:not(.dlg-x), summary, label, .hint')].map((e) => e.textContent.trim()).filter(Boolean), D);
    assert.deepEqual(labels, [
      "Escreva a expressão com uma caneta, um dedo ou o rato, p.ex. F = A·B' + C. Uma barra sobre letras é NOT; um ponto ou um * é AND.",
      'Apagar', 'Mover', 'Ajustar', 'Anular', 'Refazer', 'Limpar', 'Copiar Desenho', 'Colar Desenho', 'Reconhecido:', 'Ensinar ao Silinx a minha letra',
      'Escreva um símbolo na área de escrita, escreva-o aqui e guarde-o: o Silinx passa a ler também a sua maneira de o escrever. As amostras ficam só neste navegador.',
      'Símbolo:', 'Guardar Amostra', 'Esquecer as Minhas Amostras', 'Inserir', 'Cancelar',
    ]);
    assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-count`).textContent, D), 'Amostras da sua letra: 0');
    // nothing written: Insert says what to do
    await page.dialogButton('Inserir');
    assert.equal(await message(page), "Escreva uma expressão, p.ex. F = A·B' + C.");
    // an A written as a star: not a symbol of the set, until it is taught
    const c = await canvasAt(page);
    // five straight strokes from point j of a circle to the point 2.5 rad further
    const at = (x0, y0, r, a) => ({ x: c.x + x0 + r * Math.cos(a), y: c.y + y0 + r * Math.sin(a) });
    const star = (x0, y0, r) => Array.from({ length: 5 }, (_, j) => {
      const [p, q] = [at(x0, y0, r, j * 1.2566), at(x0, y0, r, j * 1.2566 + 2.5)];
      return Array.from({ length: 9 }, (_, k) => ({ x: p.x + (q.x - p.x) * k / 8, y: p.y + (q.y - p.y) * k / 8 }));
    });
    for (const s of star(60, 70, 34)) await stroke(page, s, 'pen');
    await waitText(page, '?');
    assert.equal(await message(page), 'Um símbolo não foi reconhecido (mostrado como ?): escreva-o de novo, ou ensine ao Silinx a sua letra.\nunexpected character \'?\' (at position 1)');
    await page.click(`${D} .ink-teach summary`);
    await page.fill(`${D} .ink-sym`, 'é');
    await page.click(`${D} .ink-save`);
    assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-teach .ink-msg`).textContent, D),
      "Escreva um símbolo do conjunto: A B C D E F G H I J K L M N O P Q R S T U V W X Y Z a b c d e f g h i j k l m n o p q r s t u v w x y z 0 1 2 3 4 5 6 7 8 9 & ' ( ) * + = ^ _ | ~ ¬ · ⊕");
    await page.fill(`${D} .ink-sym`, 'A');
    await page.click(`${D} .ink-save`);
    assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-teach .ink-msg`).textContent, D), "Amostra de 'A' guardada.");
    assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-count`).textContent, D), 'Amostras da sua letra: 1');
    await waitText(page, '');
    const kept = await page.eval(() => JSON.parse(localStorage.getItem('silinx.ink.samples')));
    assert.deepEqual([kept.length, kept[0].c, kept[0].s.length], [1, 'A', 5]);
    // nothing on the pad: no sample
    await page.click(`${D} .ink-save`);
    assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-teach .ink-msg`).textContent, D), 'Escreva primeiro o símbolo na área de escrita.');
    // the star now reads as A
    for (const s of star(60, 70, 30)) await stroke(page, s, 'pen');
    const plusB = writeText('+B', { seed: 2, amount: 0.3, size: 64, x: 120, y: 38 }).strokes;
    for (const s of plusB) await stroke(page, s.map((q) => ({ x: c.x + q.x, y: c.y + q.y })), 'pen');
    await waitText(page, 'A + B');
    assert.equal(await message(page), '');
    // forgotten
    await page.click(`${D} .ink-forget`);
    assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-teach .ink-msg`).textContent, D), 'As suas amostras foram esquecidas.');
    assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-count`).textContent, D), 'Amostras da sua letra: 0');
    assert.equal(await page.eval(() => localStorage.getItem('silinx.ink.samples')), '[]');
    // two '=': the warning
    await page.click(`${D} .ink-clear`);
    await write(page, 'F=A=B', { seed: 1 });
    await waitText(page, 'F = A = B');
    assert.equal(await message(page), "Mais de um '=': só o primeiro separa o nome da expressão.\nunexpected character '=' (at position 3)");
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    assert.equal(await page.eval(() => window.__ink), null);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

// #1088: the pad's view: two fingers pinch and move it, the wheel zooms it, Fit shows the whole drawing; what is
// written is the same at any zoom (the strokes kept in the pad's own coordinates)
const view = (page) => page.eval((d) => document.querySelector(`${d} .ink-canvas`).dataset.view.split(' ').map(Number), D);
uiTest('Handwritten expressions: the pad zoomed and moved with two fingers and the wheel; Fit; the same text at any zoom', E, async (page) => {
  void page.eval(async () => { window.__ink = (await import('/js/ink-dialog.js')).handwrittenExpression(); });
  await page.waitDialog('Handwritten Expression');
  const c = await canvasAt(page);
  const mid = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  assert.deepEqual(await view(page), [1, 0, 0]);
  // two fingers spread from 80 to 160 px apart about the middle: zoom 2 about it, no stroke left by the first finger
  await page.touchGesture([[{ x: mid.x - 40, y: mid.y }, { x: mid.x - 80, y: mid.y }], [{ x: mid.x + 40, y: mid.y }, { x: mid.x + 80, y: mid.y }]], { steps: 10 });
  const [s, ox, oy] = await view(page);
  assert.ok(Math.abs(s - 2) < 0.05, String(s));
  assert.ok(Math.abs(ox + (mid.x - c.x)) < 4 && Math.abs(oy + (mid.y - c.y)) < 4, `${ox} ${oy}`);
  assert.equal(await recognized(page), '');
  // moved: both fingers 30 px right, 20 down
  await page.touchGesture([[{ x: mid.x - 40, y: mid.y }, { x: mid.x - 10, y: mid.y + 20 }], [{ x: mid.x + 40, y: mid.y }, { x: mid.x + 70, y: mid.y + 20 }]], { steps: 10 });
  const [s2, ox2, oy2] = await view(page);
  assert.ok(Math.abs(s2 - s) < 0.02 && Math.abs(ox2 - ox - 30) < 3 && Math.abs(oy2 - oy - 20) < 3, `${s2} ${ox2} ${oy2}`);
  // written zoomed out by the wheel, the strokes where the pen was: the same text as at zoom 1
  await page.click(`${D} .ink-fit`);
  assert.deepEqual(await view(page), [1, 0, 0]);
  for (let i = 0; i < 3; i++) await page.eval((p) => document.elementFromPoint(p.x, p.y).dispatchEvent(new WheelEvent('wheel', { deltaY: 150, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true })), { x: c.x + 10, y: c.y + 10 });
  const [s3] = await view(page);
  assert.ok(s3 < 0.6 && s3 >= 0.25, String(s3));
  await write(page, 'F=A+B', { seed: 2 });
  await waitText(page, 'F = A + B');
  // Fit: the whole drawing in view, larger
  await page.click(`${D} .ink-fit`);
  const [s4] = await view(page);
  assert.ok(s4 > s3, `${s4} ${s3}`);
  assert.equal(await recognized(page), 'F = A + B');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

// #2003: Move: on, a drag with the mouse or a pen moves the drawing in the pad (the view), no stroke, the same text;
// the mouse's middle button drags it with Move off; off, a drag writes again
uiTest('Handwritten expressions: Move, the drawing dragged in the pad with the mouse and a pen, the middle button; the same text', E, async (page) => {
  void page.eval(async () => { window.__ink = (await import('/js/ink-dialog.js')).handwrittenExpression(); });
  await page.waitDialog('Handwritten Expression');
  await write(page, 'F=A+B', { seed: 2 });
  await waitText(page, 'F = A + B');
  const c = await canvasAt(page);
  const mid = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  const pressed = () => page.eval((d) => document.querySelector(`${d} .ink-move`).getAttribute('aria-pressed'), D);
  const undoable = () => page.eval((d) => !document.querySelector(`${d} .ink-undo`).disabled, D);
  assert.equal(await pressed(), 'false');
  await page.click(`${D} .ink-move`);
  assert.equal(await pressed(), 'true');
  // the mouse: 40 px right, 30 down
  await stroke(page, [mid, { x: mid.x + 20, y: mid.y + 15 }, { x: mid.x + 40, y: mid.y + 30 }], 'mouse');
  assert.deepEqual(await view(page), [1, 40, 30]);
  // a pen: 25 px left
  await stroke(page, [mid, { x: mid.x - 10, y: mid.y }, { x: mid.x - 25, y: mid.y }], 'pen');
  assert.deepEqual(await view(page), [1, 15, 30]);
  await page.eval(() => new Promise((r) => setTimeout(r, 500)));
  assert.equal(await recognized(page), 'F = A + B');
  // Move off: the middle button still drags, 10 px up
  await page.click(`${D} .ink-move`);
  assert.equal(await pressed(), 'false');
  const ev = (type, q, buttons) => page.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: type === 'mouseMoved' && !buttons ? 'none' : 'middle', buttons, clickCount: 1 });
  await ev('mouseMoved', mid, 0);
  await ev('mousePressed', mid, 4);
  await ev('mouseMoved', { x: mid.x, y: mid.y - 5 }, 4);
  await ev('mouseMoved', { x: mid.x, y: mid.y - 10 }, 4);
  await ev('mouseReleased', { x: mid.x, y: mid.y - 10 }, 0);
  assert.deepEqual(await view(page), [1, 15, 20]);
  assert.equal(await recognized(page), 'F = A + B');
  // a drag writes again: a stroke more, undone
  await stroke(page, [{ x: c.x + c.w - 60, y: c.y + 40 }, { x: c.x + c.w - 60, y: c.y + 110 }], 'pen');
  await page.waitFor((d) => document.querySelector(`${d} .ink-text`).value !== 'F = A + B', [D], { what: 'a character more' });
  await page.click(`${D} .ink-undo`);
  await waitText(page, 'F = A + B');
  assert.equal(await undoable(), true);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

// #2004: Erase: on, a drag rubs out the ink under it (the B written, rubbed out in zigzags), read again; one Undo brings
// it back, Redo rubs it out again; Erase and Move one at a time
uiTest('Handwritten expressions: Erase, the ink under a drag rubbed out, read again; one step of Undo; Erase or Move', E, async (page) => {
  void page.eval(async () => { window.__ink = (await import('/js/ink-dialog.js')).handwrittenExpression(); });
  await page.waitDialog('Handwritten Expression');
  const boxes = await write(page, 'F=A+B', { seed: 2 });
  await waitText(page, 'F = A + B');
  const pressed = () => page.eval((d) => ['ink-erase', 'ink-move'].map((k) => document.querySelector(`${d} .${k}`).getAttribute('aria-pressed')), D);
  await page.click(`${D} .ink-erase`);
  assert.deepEqual(await pressed(), ['true', 'false']);
  // the B, rubbed out with a pen in a zigzag across its box, a row every 10 px
  const b = boxes[4], zig = [];
  for (let y = b.minY - 4, k = 0; y <= b.maxY + 4; y += 10, k++) zig.push({ x: k % 2 ? b.maxX + 4 : b.minX - 4, y });
  const path = zig.flatMap((q, i) => (i ? Array.from({ length: 8 }, (_, j) => ({ x: zig[i - 1].x + (q.x - zig[i - 1].x) * (j + 1) / 8, y: zig[i - 1].y + (q.y - zig[i - 1].y) * (j + 1) / 8 })) : [q]));
  await stroke(page, path, 'pen');
  await waitText(page, 'F = A +');
  // the rest untouched: the A and the + read as before; one Undo brings the B back, Redo rubs it out again
  await page.click(`${D} .ink-undo`);
  await waitText(page, 'F = A + B');
  await page.click(`${D} .ink-redo`);
  await waitText(page, 'F = A +');
  // Move on: Erase off; Erase on: Move off; off, a drag writes
  await page.click(`${D} .ink-move`);
  assert.deepEqual(await pressed(), ['false', 'true']);
  await page.click(`${D} .ink-erase`);
  assert.deepEqual(await pressed(), ['true', 'false']);
  await page.click(`${D} .ink-erase`);
  assert.deepEqual(await pressed(), ['false', 'false']);
  await page.click(`${D} .ink-undo`);
  await waitText(page, 'F = A + B');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

// #1749: Copy Drawing (the pad's drawing as text, its kind, devices, what was read) and Paste Drawing (loaded back,
// read again, one step of Undo; a drawing of another kind refused); a browser that does not let the page copy: the text
// shown to copy by hand
uiTest('Handwritten expressions: Copy Drawing and Paste Drawing; a drawing of another kind refused', E, async (page) => {
  await page.eval(() => { window.__copied = []; navigator.clipboard.writeText = async (t) => { window.__copied.push(t); }; navigator.clipboard.readText = async () => window.__copied.at(-1) ?? ''; });
  void page.eval(async () => { window.__ink = (await import('/js/ink-dialog.js')).handwrittenExpression({ vars: ['A', 'B'] }); });
  await page.waitDialog('Handwritten Expression');
  assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-copy`).disabled, D), true);
  await write(page, 'F=A+B', { seed: 2, kind: () => 'pen' });
  await waitText(page, 'F = A + B');
  await page.click(`${D} .ink-copy`);
  const copied = await page.waitFor(() => window.__copied.at(-1), [], { what: 'the drawing copied' });
  const d = JSON.parse(copied);
  assert.deepEqual([d.silinx, d.version, d.kind, d.devices, d.vars, d.read], ['ink-drawing', 1, 'expression', ['pen'], ['A', 'B'], 'F = A + B']);
  // every point sent reached the pad, in its place and order (the points sent not waited for, #1906)
  const c = await canvasAt(page), r1 = (v) => Math.round(v * 10) / 10;
  const sent = writeText('F=A+B', { seed: 2, amount: 0.4, size: 64, x: 24, y: 30 }).strokes.map((st) => st.flatMap((q) => [r1(r1(c.x + q.x) - c.x), r1(r1(c.y + q.y) - c.y)]));
  assert.equal(d.strokes.length, sent.length);
  for (const [i, st] of d.strokes.entries()) {
    assert.equal(st.length, sent[i].length, `stroke ${i}`);
    assert.ok(st.every((v, k) => Math.abs(v - sent[i][k]) <= 0.2), `stroke ${i}: ${st} / ${sent[i]}`);
  }
  await page.waitFor(() => /^Drawing copied/.test(document.querySelector('.toast')?.textContent || ''), [], { what: 'the toast' });
  // pasted back after a Clear: read again; Undo: the pad empty again
  await page.click(`${D} .ink-clear`);
  await waitText(page, '');
  await page.click(`${D} .ink-paste`);
  await page.waitDialog('Paste Drawing');
  await page.waitFor(() => document.querySelector('.dlg-overlay:last-child .ink-drawing-text')?.value.startsWith('{"silinx"'), [], { what: 'the clipboard read' });
  await page.dialogButton('Load');
  await page.waitDialog('Handwritten Expression');
  await waitText(page, 'F = A + B');
  await page.click(`${D} .ink-undo`);
  await waitText(page, '');
  // a schematic's drawing: refused, with its message; not a drawing at all, too
  await page.click(`${D} .ink-paste`);
  await page.waitDialog('Paste Drawing');
  await page.fill('.dlg-overlay:last-child .ink-drawing-text', JSON.stringify({ ...d, kind: 'schematic' }));
  await page.dialogButton('Load');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay:last-child .ink-msg').textContent), 'This is a drawing of a schematic, not of an expression.');
  await page.fill('.dlg-overlay:last-child .ink-drawing-text', 'hello');
  await page.dialogButton('Load');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay:last-child .ink-msg').textContent), 'Not a Silinx drawing: the text is not one copied with Copy Drawing.');
  await page.dialogButton('Cancel');
  await page.waitDialog('Handwritten Expression');
  // the page not allowed to copy: the drawing's text shown, selected
  await page.click(`${D} .ink-redo`);
  await waitText(page, 'F = A + B');
  await page.eval(() => { navigator.clipboard.writeText = async () => { throw new Error('not allowed'); }; });
  await page.click(`${D} .ink-copy`);
  await page.waitDialog('Copy Drawing');
  const shown = await page.waitFor(() => { const a = document.querySelector('.dlg-overlay:last-child .ink-drawing-text'); return a && a.value && a.selectionStart === 0 && a.selectionEnd === a.value.length ? a.value : null; }, [], { what: 'the drawing\'s text selected' });
  assert.equal(JSON.parse(shown).read, 'F = A + B');
  await page.dialogButton('Close');
  await page.waitDialog('Handwritten Expression');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });
