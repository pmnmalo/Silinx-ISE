// UI: hand-drawn truth tables (#1066), Development ▸ Handwritten Boolean Algebra… while a preview (#1098): a table
// drawn on the pad with the mouse, a finger and a pen (CDP input) is read into its text, corrected there, and fills the editor's table
// (inputs, outputs, columns), one step of Undo; a table with no line between the inputs and the outputs (the
// warning), a cell left empty (the error, the dialog stays open); the dialog in Portuguese. No console warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, chromeOnly, makeProject } from './harness.js';
import { writeTable } from '../../core/ink/synth-table.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const T = '.doc:not([hidden]) .tt-editor';
// a development build: its Development menu has the handwritten input while it is a preview (#1098)
const DEV = { commit: 'abc1234', date: '2026-10-23 12:00', since: '15.12.0', changes: [] };
const D = '.dlg-overlay .ink-dialog';
const warnings = (page) => page.console.filter((m) => /^warn/.test(m.type)).map((m) => m.text);
const message = (page) => page.eval((d) => document.querySelector(`${d} .ink-msg`).innerText.trim(), D);
const cells = (page, out) => page.eval((t, o) => [...document.querySelectorAll(`${t} .tt-cell[data-out="${o}"]`)].map((c) => c.textContent).join(''), T, out);
const XOR = [['A', 'B', 'F'], ['0', '0', '0'], ['0', '1', '1'], ['1', '0', '1'], ['1', '1', '0']];

// a stroke's points sent at once, in order, each not waited for (#1906: Chrome handles one input event a frame, so a
// drawing of 1600 points waited for 1600 frames, 90 s on a slow runner)
async function stroke(page, p, kind) {
  if (kind === 'touch') {
    const at = (q) => [{ x: q.x, y: q.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(p[0]) });
    await Promise.all(p.slice(1).map((q) => page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(q) })));
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  const ev = (type, q, buttons) => page.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1, pointerType: kind });
  await ev('mouseMoved', p[0], 0);
  await ev('mousePressed', p[0], 1);
  await Promise.all(p.slice(1).map((q) => ev('mouseMoved', q, 1)));
  await ev('mouseReleased', p.at(-1), 0);
}
/** Draw a table on the pad (a careful hand): the first third of the strokes with the mouse, then a finger, then a pen. */
async function draw(page, rows, opts = {}) {
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .ink-canvas`).getBoundingClientRect(); return { x: r.left, y: r.top }; }, D);
  const { strokes } = writeTable(rows, { seed: 9, amount: 0.4, size: 40, x: 30, y: 16, ...opts });
  for (const [i, s] of strokes.entries()) {
    await stroke(page, s.map((q) => ({ x: Math.round((c.x + q.x) * 10) / 10, y: Math.round((c.y + q.y) * 10) / 10 })), i < strokes.length / 3 ? 'mouse' : i < 2 * strokes.length / 3 ? 'touch' : 'pen');
  }
}
const waitText = (page, text) => page.waitFor((d, t) => document.querySelector(`${d} .ink-table-text`)?.value === t, [D, text], { what: `recognized '${text}'`, timeout: 15000 });

async function newTable(page, name) {
  await makeProject(env, { name, files: {} });
  await page.openProject(name);
  await page.menu('Tools', 'Boolean Algebra / Karnaugh Map…');
  await page.waitDialog('New Source');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'drawn');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/drawn.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
}

uiTest('Handwritten Table…: a table drawn with the mouse, a finger and a pen fills the editor\'s table; corrected; Undo', E, async (page) => {
  await newTable(page, 'InkTable');
  await page.menu('Development', 'Handwritten Boolean Algebra…');
  await page.waitDialog('Handwritten Boolean Algebra');
  // the pad tall, on the left; the hint, the buttons and the table read on its right (#2007)
  const [pad, side] = await page.eval((d) => ['.ink-pad-table', '.ink-side'].map((k) => { const r = document.querySelector(`${d} ${k}`).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, w: r.width, h: r.height }; }), D);
  assert.ok(pad.h > pad.w && side.left >= pad.right && Math.abs(side.top - pad.top) < 2, JSON.stringify({ pad, side }));
  assert.equal(await page.eval((d) => [...document.querySelector(`${d} .ink-side`).children].map((e) => e.className || e.tagName).join(' '), D), 'hint ink-row LABEL ink-table-text ink-msg');
  await draw(page, XOR);
  await waitText(page, 'A B | F\n0 0 | 0\n0 1 | 1\n1 0 | 1\n1 1 | 0');
  assert.equal(await message(page), '');
  // corrected in the text: an XNOR, an output more
  await page.fill(`${D} .ink-table-text`, 'A B | F G\n0 0 | 1 0\n0 1 | 0 1\n1 0 | 0 1\n1 1 | 1 X');
  assert.equal(await message(page), '');
  await page.dialogButton('Fill Table');
  await page.waitNoDialog();
  await page.waitFor((t) => document.querySelector(`${t} .tt-inputs`).value === 'A, B' && document.querySelector(`${t} .tt-outputs`).value === 'F, G', [T], { what: 'the names' });
  assert.equal(await cells(page, 'F'), '1001');
  assert.equal(await cells(page, 'G'), '011X');
  await page.waitFor(async () => (await (await fetch('/api/projects/InkTable/file?path=src%2Fdrawn.tt.json')).json()).table.G === '011X', [], { what: 'saved', timeout: 15000 });
  // one step of Undo: the table before
  await page.click(`${T} .tt-undo`);
  await page.waitFor((t) => document.querySelector(`${t} .tt-inputs`).value === 'a, b, c', [T], { what: 'undone' });
  assert.equal(await cells(page, 'f'), '00000000');
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, build: DEV });

uiTest('Handwritten Table…: no line between the inputs and the outputs, a cell left empty, a reserved name; in Portuguese', E, async (page) => {
  await newTable(page, 'InkTable2');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Desenvolvimento', 'Álgebra Booleana Manuscrita…');
    await page.waitDialog('Álgebra Booleana Manuscrita');
    const labels = await page.eval((d) => [...document.querySelector(d).closest('.dlg').querySelectorAll('button:not(.dlg-x), label, .hint')].map((e) => e.textContent.trim()), D);
    assert.deepEqual(labels, [
      'Apagar', 'Mover', 'Ajustar',
      'Desenhe a tabela de verdade com uma caneta, um dedo ou o rato: os nomes num cabeçalho, uma linha por baixo dele, uma linha entre as entradas e as saídas, depois uma linha de 0, 1 ou X (indiferente) para cada combinação.',
      'Anular', 'Refazer', 'Limpar', 'Copiar Desenho', 'Colar Desenho', 'Reconhecido:', 'Preencher Tabela', 'Cancelar',
    ]);
    // nothing drawn
    await page.dialogButton('Preencher Tabela');
    assert.equal(await message(page), 'A tabela está vazia.');
    // no lines, the last output left empty
    await draw(page, [...XOR.slice(0, 4), ['1', '1', ' ']], { lines: false });
    await waitText(page, 'A B | F\n0 0 | 0\n0 1 | 1\n1 0 | 1\n1 1 | ?');
    assert.equal(await message(page), "Linha 4, coluna 3: sem valor.\nLinha 5: uma saída é '?': só 0, 1 ou X.\nNenhuma linha entre as entradas e as saídas: a última coluna é a saída.");
    await page.dialogButton('Preencher Tabela');
    assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay').length), 1);
    // corrected: a row left out (the warning), then a name the HDL reserves (refused)
    await page.fill(`${D} .ink-table-text`, 'A B | F\n0 0 | 0\n0 1 | 1\n1 0 | 1');
    assert.equal(await message(page), 'Fora da tabela: 11 (as suas saídas são 0).');
    await page.fill(`${D} .ink-table-text`, 'A B | out\n0 0 | 0\n0 1 | 1\n1 0 | 1\n1 1 | 0');
    assert.match(await message(page), /^'out' /);
    await page.dialogButton('Preencher Tabela');
    assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay').length), 1);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    assert.equal(await cells(page, 'f'), '00000000');
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, build: DEV });
