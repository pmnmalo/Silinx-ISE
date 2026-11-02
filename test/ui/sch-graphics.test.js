// UI: the schematic's graphics (#2593): drawings with no function that annotate the sheet, as ISE's Add ▸ Text, Line,
// Rectangle, Circle and Arc. The Add Graphics menu's tools: a rectangle and a circle dragged, an arc dragged then its
// bulge clicked, a text typed where the sheet is clicked (T); a drawing selected, its properties edited, moved,
// copied and pasted, deleted, undone; the circuit, its HDL and its check untouched; the menu and the hints in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

// screen position of a sheet point (through the view transform)
const at = (page, x, y) => page.eval((px, py) => {
  const svg = document.querySelector('.doc:not([hidden]) .se-svg');
  const r = svg.getBoundingClientRect();
  const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/.exec(svg.querySelector('.se-vp').getAttribute('transform'));
  return { x: r.left + +m[1] + px * +m[3], y: r.top + +m[2] + py * +m[3] };
}, x, y);
const graphics = page => page.eval(() => (window.Silinx.active.schEditor.getDoc().graphics || []).map(({ id, ...g }) => g));
const count = (page, n, what) => page.waitFor((k) => (window.Silinx.active.schEditor.getDoc().graphics || []).length === k, [n], { what });
const hint = page => page.eval((ed) => document.querySelector(`${ed} .se-status .hint`).textContent, ED);
const problems = page => page.eval(async () => (await import('/core/schdoc.js')).netlist(window.Silinx.active.schEditor.getDoc()).diagnostics.map((d) => `${d.severity}: ${d.message}`));
const tool = async (page, t) => {
  await page.click(`${ED} .se-btn[data-act=graphics]`);
  await page.waitFor((ed) => !document.querySelector(`${ed} .se-gfx-menu`).hidden, [ED], { what: 'the Add Graphics menu open' });
  await page.click(`${ED} .se-gfx-menu [data-gfx=${t}]`);
  await page.waitFor((ed, k) => document.querySelector(`${ed} .se-canvas`)?.dataset.tool === k && document.querySelector(`${ed} .se-gfx-menu`).hidden, [ED, t], { what: `tool ${t}` });
};

uiTest('#2593 schematic: text, rectangle, circle and arc drawn to annotate the sheet; selected, edited, moved, pasted, deleted; the circuit untouched', E, async (page) => {
  const doc = newDoc('ann', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 400, y: 300, rot: 0, mirror: false, name: 'XLXI_1', params: {} });
  // (a line the file has: drawn when it opens, the view fitted to it too)
  doc.graphics = [{ id: 'G1', kind: 'line', x1: 100, y1: 700, x2: 1000, y2: 700 }];
  await makeProject(env, { name: 'AnnPj', files: { 'src/ann.sch.json': JSON.stringify(doc) } });
  await page.openProject('AnnPj');
  await page.eval(() => window.SilinxApp.openSch('src/ann.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'drawn' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-content .g-line .gline`)?.getAttribute('d'), ED), 'M100,700 L1000,700');
  const problems0 = await problems(page);
  const hdl0 = await page.eval(async () => (await import('/core/schdoc.js')).generateHdl(window.Silinx.active.schEditor.getDoc(), { lang: 'vhdl' }).text);
  // the menu: its five tools, each with its title
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-gfx-menu [data-gfx]`)].map((b) => [b.dataset.gfx, b.querySelector('span').textContent, b.title]), ED),
    [['text', 'Text', 'Add Text (T)'], ['line', 'Line', 'Add Line'], ['rect', 'Rectangle', 'Add Rectangle'], ['circle', 'Circle', 'Add Circle'], ['arc', 'Arc', 'Add Arc']]);
  // a rectangle round the inverter, dragged from one corner to the other: the button on while a drawing tool is in use
  await tool(page, 'rect');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-btn[data-act=graphics]`).classList.contains('on'), ED), true);
  assert.equal(await hint(page), 'Add Rectangle: drag from one corner to the other. It does not change the circuit.');
  await page.drag(await at(page, 360, 260), await at(page, 520, 380));
  await count(page, 2, 'the rectangle');
  // a circle from its centre; an arc from its start to its end, then where it passes
  await tool(page, 'circle');
  await page.drag(await at(page, 700, 300), await at(page, 740, 300));
  await count(page, 3, 'the circle');
  await tool(page, 'arc');
  await page.drag(await at(page, 600, 500), await at(page, 680, 500));
  await page.waitFor((ed) => !!document.querySelector(`${ed} .se-overlay .ghost .graphic`), [ED], { what: 'the arc being drawn' });
  await page.click(await at(page, 640, 540));
  await count(page, 4, 'the arc');
  // a text: T, a click, typed
  await page.key('Escape');
  await page.key('t');
  assert.equal(await hint(page), 'Add Text: click where the text goes, then type it (its lines and size in the Properties panel). It does not change the circuit.');
  await page.click(await at(page, 370, 250));
  await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'the text prompt' });
  assert.equal(await page.eval(() => document.querySelector('.se-prompt label').textContent), 'Text');
  await page.type('Inverter');
  await page.key('Enter');
  await count(page, 5, 'the text');
  assert.deepEqual(await graphics(page), [
    { kind: 'line', x1: 100, y1: 700, x2: 1000, y2: 700 },
    { kind: 'rect', x: 360, y: 260, w: 160, h: 120 },
    { kind: 'circle', cx: 700, cy: 300, r: 40 },
    { kind: 'arc', x1: 600, y1: 500, x2: 640, y2: 540, x3: 680, y3: 500 },
    { kind: 'text', x: 370, y: 250, text: 'Inverter' },
  ]);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .se-content .graphic`).length, ED), 5);
  // the circuit, its HDL and its check as they were
  assert.deepEqual(await problems(page), problems0);
  assert.equal(await page.eval(async () => (await import('/core/schdoc.js')).generateHdl(window.Silinx.active.schEditor.getDoc(), { lang: 'vhdl' }).text), hdl0);
  // the text selected (Select): its properties; its size and lines changed there
  await page.key('Escape');
  await page.click(await at(page, 380, 245));
  await page.waitFor((ed) => document.querySelector(`${ed} .se-ptitle`)?.textContent === 'Text', [ED], { what: 'the text\'s properties' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-field > label`)].map((l) => l.textContent), ED), ['Text', 'Text size', 'Position']);
  await page.eval((ed) => { const f = [...document.querySelectorAll(`${ed} .se-field`)]; const ta = f[0].querySelector('textarea'); ta.value = 'Inverter\nU1'; ta.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().graphics[4].text === 'Inverter\nU1', [], { what: 'its lines' });
  await page.eval((ed) => { const i = [...document.querySelectorAll(`${ed} .se-field`)][1].querySelector('input'); i.value = '20'; i.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().graphics[4].size === 20, [], { what: 'its size' });
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .se-content .g-text tspan`).length, ED), 2);
  // the rectangle moved by its side (its inside picks the inverter, not the rectangle)
  await page.drag(await at(page, 440, 380), await at(page, 480, 400));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().graphics[1].x === 400, [], { what: 'the rectangle moved' });
  assert.deepEqual((await graphics(page))[1], { kind: 'rect', x: 400, y: 280, w: 160, h: 120 });
  assert.deepEqual(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols.map((s) => [s.x, s.y])), [[400, 300]]);
  // copied and pasted: a second rectangle, selected; deleted; undone
  await page.eval(async () => { const ed = window.Silinx.active.schEditor; ed.copy(); await ed.paste(undefined, { dx: 0, dy: 200 }); });
  await count(page, 6, 'pasted');
  assert.deepEqual((await graphics(page))[5], { kind: 'rect', x: 400, y: 480, w: 160, h: 120 });
  await page.key('Delete');
  await count(page, 5, 'deleted');
  await page.menu('Edit', 'Undo');
  await count(page, 6, 'undone');
  // saved with the schematic; its HDL as it was
  await page.waitFor(async () => ((JSON.parse(await (await fetch('/api/projects/AnnPj/file?path=src%2Fann.sch.json')).text()).graphics) || []).length === 6, [], { what: 'saved', timeout: 15000 });
  assert.deepEqual(JSON.parse(await readWs(env, 'AnnPj', 'src/ann.sch.json')).graphics.map((g) => g.kind), ['line', 'rect', 'circle', 'arc', 'text', 'rect']);
  assert.deepEqual(await problems(page), problems0);
  // in Portuguese: the menu and a hint
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor((ed) => document.querySelector(`${ed} .se-gfx-menu [data-gfx=rect] span`).textContent === 'Retângulo', [ED], { what: 'the menu in Portuguese' });
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-gfx-menu [data-gfx]`)].map((b) => [b.querySelector('span').textContent, b.title]), ED),
      [['Texto', 'Adicionar Texto (T)'], ['Linha', 'Adicionar Linha'], ['Retângulo', 'Adicionar Retângulo'], ['Círculo', 'Adicionar Círculo'], ['Arco', 'Adicionar Arco']]);
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-btn[data-act=graphics]`).title, ED), 'Adicionar Gráficos: texto, linhas, retângulos, círculos e arcos para anotar a folha');
    await tool(page, 'line');
    await page.waitFor((ed) => /^Adicionar Linha:/.test(document.querySelector(`${ed} .se-status .hint`).textContent), [ED], { what: 'the hint in Portuguese' });
    assert.equal(await hint(page), 'Adicionar Linha: arraste de uma ponta à outra. Não altera o circuito.');
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
    await page.key('Escape');
  }
});
