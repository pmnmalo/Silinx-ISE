// UI: hand-drawn schematics (#1067, flip-flops #1083), Development ▸ Handwritten Schematic… while a preview
// (#1098): a half adder drawn on the pad with the mouse, a finger and a pen (CDP input) is read (its gates listed with their types, its names), a gate's type and a
// name corrected, and made into the editor's drawing in one edit (Undo brings the drawing before back): its netlist
// clean, its HDL simulating to the corrected circuit's truth table. The dialog in Portuguese, with a drawing that is
// not a circuit (its errors) and a name at no wire's end (its warning). No console warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, chromeOnly, makeProject } from './harness.js';
import { writeSchematic } from '../../core/ink/synth-schematic.js';
import { writeText } from '../../core/ink/synth.js';
import { newDoc, netlist, generateHdl } from '../../core/schdoc.js';
import { truthTableFromModule } from '../../core/logic.js';
import { compileDesign } from '../../core/compiled-sim.js';
import { yosysNode } from '../../packages/silinx-fpga/src/synth-open-node.js';
import { designOf } from '../compiled-diff.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ED = '.doc:not([hidden]) .sch-editor';
// a development build: its Development menu has the handwritten input while it is a preview (#1098)
const DEV = { commit: 'abc1234', date: '2026-10-23 12:00', since: '15.12.0', changes: [] };
const D = '.dlg-overlay .ink-dialog';
const warnings = (page) => page.console.filter((m) => /^warn/.test(m.type)).map((m) => m.text);
const message = (page) => page.eval((d) => document.querySelector(`${d} .ink-msg`).innerText.trim(), D);
const HALF_ADDER = { gates: [{ type: 'xor', x: 2.6, y: 0, n: 2 }, { type: 'and', x: 2.6, y: 2.0, n: 2 }], nets: [
  { name: 'A', at: [0.5, -0.2], to: [[0, 0], [1, 0]], j: 0.4 }, { name: 'B', at: [0.5, 1.0], to: [[0, 1], [1, 1]], j: 0.7 },
  { from: 0, name: 'S' }, { from: 1, name: 'C' }] };

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
const canvasAt = (page) => page.eval((d) => { const r = document.querySelector(`${d} .ink-canvas`).getBoundingClientRect(); return { x: r.left, y: r.top }; }, D);
/** Draw strokes (pad pixels) on the pad: the first third with the mouse, then a finger, then a pen (or tools[i]). */
async function draw(page, strokes, tools = null) {
  const c = await canvasAt(page);
  for (const [i, s] of strokes.entries()) {
    await stroke(page, s.map((q) => ({ x: Math.round((c.x + q.x) * 10) / 10, y: Math.round((c.y + q.y) * 10) / 10 })), tools?.[i % tools.length] ?? (i < strokes.length / 3 ? 'mouse' : i < 2 * strokes.length / 3 ? 'touch' : 'pen'));
  }
}
const listed = (page) => page.eval((d) => ({
  gates: [...document.querySelectorAll(`${d} .ink-gate`)].map((r) => `${r.querySelector('b').textContent} ${r.querySelector('select').value} ${r.querySelector('code').textContent}`),
  names: [...document.querySelectorAll(`${d} .ink-net-name`)].map((i) => i.value),
}), D);

async function openSchematic(page, project) {
  await makeProject(env, { name: project, files: { 'src/hand.sch.json': JSON.stringify(newDoc('hand', 'vhdl')) } });
  await page.openProject(project);
  await page.eval(() => window.SilinxApp.openSch('src/hand.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-act=check]`), [ED], { what: 'the schematic editor' });
  // (no Handwritten… in its toolbar: in the Development menu while a preview, #1098)
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-act=ink]`), ED), null);
}

uiTest('Handwritten… (schematic): a half adder drawn with the mouse, a finger and a pen, corrected, made into the drawing; Undo', E, async (page) => {
  await openSchematic(page, 'InkSch');
  await page.menu('Development', 'Handwritten Schematic…');
  await page.waitDialog('Handwritten Schematic');
  // the whole page (#1088): the dialog over all of the window, the pad most of it
  const size = await page.eval((d) => { const r = document.querySelector(d).closest('.dlg').getBoundingClientRect(), p = document.querySelector(`${d} .ink-canvas`).getBoundingClientRect(); return [r.width / innerWidth, r.height / innerHeight, p.width / r.width, p.height / r.height]; }, D);
  assert.ok(size[0] > 0.98 && size[1] > 0.98 && size[2] > 0.5 && size[3] > 0.5, String(size));
  // (an empty schematic: nothing replaced, nothing said of it)
  assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-replaces`), D), null);
  await draw(page, writeSchematic(HALF_ADDER, { seed: 9, amount: 0.4, size: 60, x: 30, y: 30 }).strokes);
  // (read after the last stroke)
  await page.waitFor((d) => [...document.querySelectorAll(`${d} .ink-gate code`)].map((c) => c.textContent).join() === '(A, B) → S,(A, B) → C', [D], { what: 'the circuit read', timeout: 15000 });
  assert.deepEqual(await listed(page), { gates: ['U1 xor2 (A, B) → S', 'U2 and2 (A, B) → C'], names: ['A', 'B', 'S', 'C'] });
  assert.equal(await message(page), '');
  // corrected: the AND an OR, the carry named Cout; while the pad's reading is still pending (Undo and Redo read the pad
  // again, a moment later), then Create Schematic at once: the corrections kept, not the reading made over them (#2389)
  assert.equal(await page.eval((d) => {
    const q = (s) => document.querySelector(`${d} ${s}`);
    q('.ink-undo').click(); q('.ink-redo').click();
    const sel = q('.ink-gate:nth-of-type(2) select'), name = document.querySelectorAll(`${d} .ink-net-name`)[3];
    sel.value = 'or2'; sel.dispatchEvent(new Event('change'));
    name.value = 'Cout'; name.dispatchEvent(new Event('input'));
    const msg = q('.ink-msg').innerText.trim();
    [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].find((b) => b.textContent.trim() === 'Create Schematic').click();
    return msg;
  }, D), '');
  await page.waitNoDialog();
  const doc = await page.waitFor(() => { const d = window.Silinx.active.schEditor.getDoc(); return d.symbols.length === 2 && d; }, [], { what: 'the drawing made' });
  assert.deepEqual(doc.symbols.map((s) => [s.name, s.type]), [['U1', 'xor2'], ['U2', 'or2']]);
  assert.deepEqual(doc.ports.map((p) => [p.name, p.dir]).sort(), [['A', 'in'], ['B', 'in'], ['Cout', 'out'], ['S', 'out']]);
  assert.equal(doc.name, 'hand');
  assert.deepEqual(netlist(doc).diagnostics, []);
  const tt = truthTableFromModule([{ path: 'hand.vhd', text: generateHdl(doc, { lang: 'vhdl' }).code }], 'hand');
  assert.deepEqual([tt.inputs, tt.table], [['a', 'b'], { s: '0110', cout: '0111' }]);
  // saved, then one Undo: the empty schematic again
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/InkSch/file?path=src%2Fhand.sch.json')).text()).symbols.length === 2, [], { what: 'saved', timeout: 15000 });
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 0, [], { what: 'undone' });
  // drawn again over a drawing: the dialog says it replaces it
  await page.click(`${ED} [data-act=redo]`);
  await page.menu('Development', 'Handwritten Schematic…');
  await page.waitDialog('Handwritten Schematic');
  assert.equal(await page.eval((d) => document.querySelector(`${d} .ink-replaces`).textContent, D), 'The schematic drawn replaces the one in the editor (Undo brings it back).');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols.length), 2);
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, build: DEV });

uiTest('Handwritten… (schematic): in Portuguese, a drawing that is not a circuit, a name at no wire\'s end', E, async (page) => {
  await openSchematic(page, 'InkSch2');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Desenvolvimento', 'Esquemático Manuscrito…');
    await page.waitDialog('Esquemático Manuscrito');
    const labels = await page.eval((d) => [...document.querySelector(d).closest('.dlg').querySelectorAll('button:not(.dlg-x), label, .hint')].map((e) => e.textContent.trim()), D);
    assert.deepEqual(labels, [
      'Desenhe o circuito com uma caneta, um dedo ou o rato: as portas (AND, OR, XOR, um triângulo para um buffer, um pequeno círculo na saída para NOT) maiores do que os nomes, as suas entradas à esquerda, fios em esquadria, e o nome de cada entrada e saída na ponta do seu fio.',
      'Um flip-flop: uma caixa com os seus pinos escritos dentro, à esquerda D, T, ou J e K, o relógio (C, CLK ou uma cunha), CE, CLR, PRE; à direita Q, e Q com uma barra.',
      'Apagar', 'Mover', 'Ajustar', 'Anular', 'Refazer', 'Limpar', 'Copiar Desenho', 'Colar Desenho', 'Reconhecido:', 'Criar Esquemático', 'Cancelar',
    ]);
    await page.dialogButton('Criar Esquemático');
    assert.equal(await message(page), 'Nada desenhado: desenhe o circuito na área de escrita.');
    // names only: no gate
    await draw(page, writeText('AB', { seed: 1, amount: 0.3, size: 40, x: 40, y: 40 }).strokes);
    await page.waitFor((d) => /^Nenhuma porta/.test(document.querySelector(`${d} .ink-msg`).innerText), [D], { what: 'no gate', timeout: 15000 });
    assert.equal(await message(page), 'Nenhuma porta encontrada: desenhe as portas maiores do que os nomes, as suas entradas à esquerda.');
    // an AND with no wire from its output, and a name far from every wire (with the mouse and the pen: a pen has
    // written, a finger is now a hand resting on the screen)
    await page.click(`${D} .ink-clear`);
    const spec = { gates: [{ type: 'and', x: 2.6, y: 0.5, n: 2 }], nets: [{ name: 'A', at: [0.5, 0.2], to: [[0, 0]] }, { name: 'B', at: [0.5, 1.6], to: [[0, 1]] }] };
    await draw(page, [...writeSchematic(spec, { seed: 9, amount: 0.4, size: 60, x: 30, y: 30 }).strokes, ...writeText('Q', { seed: 2, amount: 0.3, size: 27, x: 420, y: 200 }).strokes], ['mouse', 'pen']);
    await page.waitFor((d) => document.querySelectorAll(`${d} .ink-gate`).length === 1 && /Q/.test(document.querySelector(`${d} .ink-msg`).innerText), [D], { what: 'the circuit read', timeout: 15000 });
    await page.eval(() => new Promise((r) => setTimeout(r, 600)));
    assert.equal(await message(page), 'U1 (AND): nenhum fio sai da sua saída.\nO nome Q não está na ponta de nenhum fio.');
    await page.dialogButton('Criar Esquemático');
    assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay').length), 1);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    assert.equal(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols.length), 0);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, build: DEV });

// a 2-bit counter of T flip-flops (#1083): q0 toggles while en is 1, q1 when q0 is 1 too
const COUNTER = { gates: [{ type: 'ff', x: 2.4, y: 0, ins: ['T', 'C'], outs: ['Q'], wedge: true }, { type: 'and', x: 5.2, y: 1.2, n: 2 }, { type: 'ff', x: 7.4, y: 1.6, ins: ['T', 'C'], outs: ['Q'], wedge: true }], nets: [
  { name: 'en', at: [0.6, -0.3], to: [[0, 'T'], [1, 0]], j: 0.3 }, { name: 'clk', at: [0.6, 3.1], to: [[0, 'C'], [2, 'C']], j: 0.25 },
  { from: 0, out: 'Q', name: 'q0', to: [[1, 1]] }, { from: 1, to: [[2, 'T']] }, { from: 2, out: 'Q', name: 'q1' }] };

uiTest('Handwritten… (schematic): a counter of flip-flops drawn with the mouse, a finger and a pen, made into the drawing; clocked', E, async (page) => {
  await openSchematic(page, 'InkSch3');
  await page.menu('Development', 'Handwritten Schematic…');
  await page.waitDialog('Handwritten Schematic');
  await draw(page, writeSchematic(COUNTER, { seed: 9, amount: 0.4, size: 48, x: 24, y: 30 }).strokes);
  const rows = () => page.eval((d) => [...document.querySelectorAll(`${d} .ink-gate`)].map((r) => `${r.querySelector('b').textContent} ${r.querySelector('.ink-ff-type')?.textContent ?? r.querySelector('select').value} ${r.querySelector('code').textContent}`), D);
  await page.waitFor((d) => /\(.*\) → Q: q1$/.test([...document.querySelectorAll(`${d} .ink-gate`)].map((r) => r.querySelector("code").textContent).join("|")), [D], { what: 'the circuit read', timeout: 20000 });
  const [u1, u2, u3] = await rows();
  assert.match(u1, /^U1 FT \(T: en, C: clk\) → Q: q0$/);
  assert.match(u2, /^U2 and2 \(en, q0\) → n\d+$/);
  assert.match(u3, /^U3 FT \((C: clk, T: n\d+|T: n\d+, C: clk)\) → Q: q1$/);
  assert.equal(await message(page), '');
  await page.dialogButton('Create Schematic');
  await page.waitNoDialog();
  const doc = await page.waitFor(() => { const d = window.Silinx.active.schEditor.getDoc(); return d.symbols.length === 3 && d; }, [], { what: 'the drawing made' });
  assert.deepEqual(doc.symbols.map((s) => [s.name, s.type]), [['U1', 'ft'], ['U2', 'and2'], ['U3', 'ft']]);
  assert.deepEqual(doc.ports.map((p) => [p.name, p.dir]).sort(), [['clk', 'in'], ['en', 'in'], ['q0', 'out'], ['q1', 'out']]);
  assert.deepEqual(netlist(doc).diagnostics, []);
  // clocked: it counts while en is 1, holds while 0
  const sim = await compileDesign(designOf([{ path: 'hand.v', lang: 'verilog', role: 'design', text: generateHdl(doc, { lang: 'verilog' }).code }], 'hand'), { run: yosysNode, clock: 'clk' });
  const seen = [];
  for (const en of [1, 1, 1, 1, 0, 0, 1]) { sim.set('en', en); sim.cycle(1); seen.push(Number(sim.get('q1')) * 2 + Number(sim.get('q0'))); }
  assert.deepEqual(seen, [1, 2, 3, 0, 0, 0, 1]);
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, build: DEV });
