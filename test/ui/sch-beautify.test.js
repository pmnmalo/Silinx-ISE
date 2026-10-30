// UI (#1481, #1506, #1730): the schematic editor's Rearrange Wires and Rearrange Schematic (Beautify, as two commands).
// Rearrange Wires: the wires drawn again, the symbols and markers where they are; with a selection, its wires only.
// Rearrange Schematic: the whole sheet laid out again, the markers moved (the inputs on the left, the outputs on the
// right). One undo step each; nothing to do said so; their labels, tooltips and notes in Portuguese; hidden in a
// read-only view.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });
const TITLE_W = 'Rearrange Wires: draw the wires again with few bends and crossings, the symbols, I/O markers and net names where they are; with a selection, only its wires. The connections stay the same';
const TITLE_S = 'Rearrange Schematic: lay the whole schematic out again, easier to read (the inputs on the left, the outputs on the right, the symbols moved in the order of the signals, the wires with few bends and crossings). The connections stay the same';
const TITLE_W_PT = 'Reorganizar fios: desenhar de novo os fios com poucas dobras e cruzamentos, os símbolos, marcadores de E/S e nomes de rede onde estão; com uma seleção, só os seus fios. As ligações ficam iguais';
const TITLE_S_PT = 'Reorganizar esquemático: dispor de novo todo o esquemático, mais fácil de ler (as entradas à esquerda, as saídas à direita, os símbolos deslocados pela ordem dos sinais, os fios com poucas dobras e cruzamentos). As ligações ficam iguais';

// two wires drawn with a detour: a -> y and c -> x, the output marker x on the left of the input c
function design() {
  const doc = newDoc('tidy', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 100 },
    { id: 'P3', name: 'c', dir: 'in', width: 1, x: 400, y: 300 }, { id: 'P4', name: 'x', dir: 'out', width: 1, x: 100, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(150, 100), P(150, 200), P(250, 200), P(250, 100), P(400, 100)] },
    { id: 'W2', points: [P(400, 300), P(300, 300), P(300, 350), P(200, 350), P(200, 300), P(100, 300)] });
  return doc;
}
const DETOUR1 = design().wires[0].points, DETOUR2 = design().wires[1].points;

uiTest('#1730 schematic: Rearrange Wires draws the wires again (the selected ones), the markers where they are; Rearrange Schematic moves them; one undo step each; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TidyPj', files: { 'src/tidy.sch.json': JSON.stringify(design()) } });
  await page.openProject('TidyPj');
  await page.eval(() => window.SilinxApp.openSch('src/tidy.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 4, [ED], { what: 'drawn' });
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const wires = async () => (await getDoc()).wires.map((w) => w.points);
  const hint = (t) => page.waitFor((ed, x) => { const e = document.querySelector(`${ed} .se-hint`); return !!e && !e.hidden && e.textContent === x; }, [ED, t], { what: `the note: ${t}` });
  const button = (act) => page.eval((ed, a) => { const b = document.querySelector(`${ed} .se-toolbar [data-act=${a}]`); return b && [b.textContent.trim(), b.title, getComputedStyle(b).display !== 'none']; }, ED, act);
  const WIRES = `${ED} .se-toolbar [data-act=rewire]`, SHEET = `${ED} .se-toolbar [data-act=relayout]`, MORE = `${ED} .se-btn[data-act=more]`;
  assert.deepEqual(await button('rewire'), ['Rearrange Wires', TITLE_W, true]);
  assert.deepEqual(await button('relayout'), ['Rearrange Schematic', TITLE_S, true]);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-toolbar [data-act=beautify]`), ED), null, 'no Beautify button any more');
  assert.deepEqual(await wires(), [DETOUR1, DETOUR2]);
  const doc0 = await getDoc();
  const length = (pts) => pts.reduce((n, q, i) => n + (i ? Math.abs(q.x - pts[i - 1].x) + Math.abs(q.y - pts[i - 1].y) : 0), 0);

  // the selection: c -> x's wire clicked (on its first segment), then Rearrange Wires: that wire only
  const at = (p) => page.eval((ed, x, y) => { const l = document.querySelector(`${ed} svg .port`); const q = l.ownerSVGElement.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(l.getScreenCTM()); return { x: r.x, y: r.y }; }, ED, p.x, p.y);
  const clickAt = async (p) => { const q = await at(p); await page.mouse('mouseMoved', q.x, q.y); await page.mouse('mousePressed', q.x, q.y); await page.mouse('mouseReleased', q.x, q.y); };
  const select = async () => {
    await clickAt(P(250, 350));
    await page.waitFor((ed) => document.querySelector(`${ed} svg .wire.sel[data-id="W2"]`), [ED], { what: 'W2 selected' });
  };
  const deselect = async () => {
    await clickAt(P(200, 250));
    await page.waitFor((ed) => !document.querySelector(`${ed} svg .sel`), [ED], { what: 'nothing selected' });
  };
  await select();
  await page.click(MORE);
  await page.click(WIRES);
  await hint('Rearrange Wires: 1 wire drawn again');
  const sel1 = await wires();
  assert.deepEqual(sel1[0], DETOUR1, 'the selected wire only');
  assert.notDeepEqual(sel1[1], DETOUR2);
  assert.deepEqual([sel1[1][0], sel1[1].at(-1)], [P(400, 300), P(100, 300)], 'its ends where they were');
  assert.ok(length(sel1[1]) < length(DETOUR2), 'shorter');
  assert.deepEqual((await getDoc()).ports, doc0.ports, 'the markers where they were');

  // no selection: every wire drawn again (the other one now), the markers where they were
  await deselect();
  await page.click(MORE);
  await page.click(WIRES);
  await hint('Rearrange Wires: 1 wire drawn again');
  const all = await wires();
  assert.deepEqual(all[1], sel1[1]);
  assert.deepEqual([all[0][0], all[0].at(-1)], [P(100, 100), P(400, 100)]);
  assert.ok(length(all[0]) < length(DETOUR1), 'shorter');
  assert.deepEqual((await getDoc()).ports, doc0.ports, 'the markers where they were');
  await page.click(MORE);
  await page.click(WIRES);
  await hint('Rearrange Wires: the wires are already as clear as they can be');

  // Rearrange Schematic: the whole sheet laid out, the markers moved (the inputs on the left), every wire straight
  await page.click(MORE);
  await page.click(SHEET);
  await hint('Rearrange Schematic: the schematic laid out again');
  const laid = await getDoc();
  const px = (d, n) => d.ports.find((p) => p.name === n);
  assert.ok(px(laid, 'a').x < px(laid, 'y').x && px(laid, 'c').x < px(laid, 'x').x, JSON.stringify(laid.ports));
  assert.notDeepEqual(laid.ports, doc0.ports, 'the markers moved');
  assert.deepEqual(laid.wires.map((w) => w.points.length), [2, 2], 'straight');
  const ends = laid.wires.map((w) => [w.points[0], w.points[1]].map((q) => laid.ports.find((p) => p.x === q.x && p.y === q.y)?.name).sort().join('-')).sort();
  assert.deepEqual(ends, ['a-y', 'c-x'], 'the same connections');
  await page.click(MORE);
  await page.click(SHEET);
  await hint('Rearrange Schematic: the schematic is already laid out this way');
  // one undo step each
  for (const back of [all, sel1]) {
    await page.click(`${ED} [data-act=undo]`);
    await page.waitFor((w) => JSON.stringify(window.Silinx.active.schEditor.getDoc().wires.map((x) => x.points)) === w, [JSON.stringify(back)], { what: 'undone' });
  }
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor((d) => JSON.stringify(window.Silinx.active.schEditor.getDoc()) === d, [JSON.stringify(doc0)], { what: 'undone' });
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, 'nothing more to undo');
  await page.click(`${ED} [data-act=fit]`);   // (the view was fitted to the sheet laid out)

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((b) => document.querySelector(b)?.textContent.trim() === 'Reorganizar fios', [WIRES], { what: 'Portuguese' });
    assert.deepEqual(await button('rewire'), ['Reorganizar fios', TITLE_W_PT, true]);
    assert.deepEqual(await button('relayout'), ['Reorganizar esquemático', TITLE_S_PT, true]);
    await select();
    await page.click(MORE);
    await page.click(WIRES);
    await hint('Reorganizar fios: 1 fio desenhado de novo');
    await page.click(MORE);
    await page.click(WIRES);
    await hint('Reorganizar fios: os fios já estão tão claros quanto possível');
    await deselect();
    await page.click(MORE);
    await page.click(SHEET);
    await hint('Reorganizar esquemático: esquemático disposto de novo');
    await page.click(MORE);
    await page.click(SHEET);
    await hint('Reorganizar esquemático: o esquemático já está disposto assim');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});

uiTest('#1481 schematic: a read-only view (RTL schematic) has neither Rearrange button', E, async (page) => {
  await makeProject(env, { name: 'TidyRoPj', files: { 'src/tidy.sch.json': JSON.stringify(design()) } });
  await page.openProject('TidyRoPj');
  // a read-only editor mounted on its own, as the RTL view mounts it
  const shown = await page.eval(async () => {
    const { mountSchEditor } = await import('/js/sch-editor.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:500px';
    document.body.append(host);
    const ed = mountSchEditor(host, { readOnly: true });
    const r = [...host.querySelectorAll('.se-toolbar [data-act=rewire], .se-toolbar [data-act=relayout]')].map((b) => getComputedStyle(b).display !== 'none');
    ed.destroy(); host.remove();
    return r;
  });
  assert.deepEqual(shown, [false, false]);
});
