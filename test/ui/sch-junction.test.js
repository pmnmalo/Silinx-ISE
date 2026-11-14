// UI (#3806): a schematic's junction dots: a wire selected, the dots on it highlighted with it (not the others); a dot
// dragged by the mouse, the wires ending on it following, square, the connections and the generated HDL the same, no
// warnings; the arrows move a selected dot; one Undo each; a finger and a pen drag one too (Chrome).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';
import { newDoc, netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });
const port = (id, name, dir, x, y) => ({ id, name, dir, width: 1, x, y });

// the input a to the outputs y and z, a dot at (200, 200); the input b to the output w, a dot at (500, 200)
function tees() {
  const doc = newDoc('tees', 'vhdl');
  doc.ports.push(port('P1', 'a', 'in', 100, 200), port('P2', 'y', 'out', 300, 100), port('P3', 'z', 'out', 300, 300),
    port('P4', 'b', 'in', 400, 200), port('P5', 'w', 'out', 600, 100), port('P6', 'v', 'out', 600, 300));
  doc.wires.push({ id: 'W1', points: [P(100, 200), P(200, 200)] }, { id: 'W2', points: [P(200, 200), P(200, 100), P(300, 100)] },
    { id: 'W3', points: [P(200, 200), P(200, 300), P(300, 300)] }, { id: 'W4', points: [P(400, 200), P(500, 200)] },
    { id: 'W5', points: [P(500, 200), P(500, 100), P(600, 100)] }, { id: 'W6', points: [P(500, 200), P(500, 300), P(600, 300)] });
  return doc;
}
async function open(page, name) {
  const doc = tees();
  await makeProject(env, { name, files: { 'src/tees.sch.json': JSON.stringify(doc) } });
  await page.openProject(name);
  await page.eval(() => window.SilinxApp.openSch('src/tees.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .jdot`).length === 2, [ED], { what: 'the dots drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const wires = async () => Object.fromEntries((await getDoc()).wires.filter((w) => /^W[123]$/.test(w.id)).map((w) => [w.id, w.points.map((p) => `${p.x},${p.y}`).join(' ')]));
  const hdl0 = generateHdl(doc, { lang: 'vhdl' }).code;
  const same = async (what) => {
    const d = await getDoc();
    assert.deepEqual(netlist(d).diagnostics.map((x) => x.message), [], `${what}: no warnings`);
    assert.equal(generateHdl(d, { lang: 'vhdl' }).code, hdl0, `${what}: the same HDL`);
  };
  const dots = () => page.eval((ed) => [...document.querySelectorAll(`${ed} svg .jdot`)].map((g) => `${g.dataset.id}${g.classList.contains('sel') ? ' sel' : ''}`), ED);
  const waitW1 = (pts) => page.waitFor((s) => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W1').points.map((p) => `${p.x},${p.y}`).join(' ') === s, [pts], { what: `W1: ${pts}` });
  return { at, wires, same, dots, waitW1 };
}

uiTest('#3806 schematic: a selected wire\'s junction dots highlighted; a dot dragged and moved by the arrows, its wires following; Undo', E, async (page) => {
  const { at, wires, same, dots, waitW1 } = await open(page, 'JunctionPj');
  assert.deepEqual(await dots(), ['200,200', '500,200']);
  // a wire of the first net selected: its dot highlighted, the other net's not
  await page.click(await at(250, 100));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .wire.sel`), [ED], { what: 'the wire selected' });
  assert.deepEqual(await dots(), ['200,200 sel', '500,200']);
  await page.click(await at(550, 300));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .jdot[data-id="500,200"].sel`), [ED], { what: 'the other wire selected' });
  assert.deepEqual(await dots(), ['200,200', '500,200 sel']);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(`${ed} svg .jdot.sel`), [ED], { what: 'nothing selected' });

  // the dot dragged by the mouse to (250, 220): its three wires follow, square
  await page.drag(await at(200, 200), await at(250, 220));
  await waitW1('100,200 100,220 250,220');
  assert.deepEqual(await wires(), { W1: '100,200 100,220 250,220', W2: '250,220 250,100 300,100', W3: '250,220 250,300 300,300' });
  assert.deepEqual(await dots(), ['250,220 sel', '500,200'], 'the dot moved, selected');
  await same('dragged');
  // the arrows: 10 to the right
  await page.key('ArrowRight');
  await waitW1('100,200 100,220 260,220');
  assert.deepEqual(await wires(), { W1: '100,200 100,220 260,220', W2: '260,220 260,100 300,100', W3: '260,220 260,300 300,300' });
  assert.deepEqual(await dots(), ['260,220 sel', '500,200']);
  await same('moved by the arrows');
  // one Undo each
  await page.menu('Edit', 'Undo');
  await waitW1('100,200 100,220 250,220');
  await page.menu('Edit', 'Undo');
  await waitW1('100,200 200,200');
  assert.deepEqual(await wires(), { W1: '100,200 200,200', W2: '200,200 200,100 300,100', W3: '200,200 200,300 300,300' });
  await same('undone');
});

uiTest('#3806 schematic: a junction dot dragged by a finger and by a pen', E, async (page) => {
  const { at, same, waitW1 } = await open(page, 'JunctionTouchPj');
  await page.touchDrag(await at(200, 200), await at(200, 250));
  await waitW1('100,200 100,250 200,250');
  await same('a finger');
  const a = await at(200, 250), b = await at(150, 250);
  const pen = (type, q, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: 'left', clickCount: 1, pointerType: 'pen', ...extra });
  await pen('mouseMoved', a, { button: 'none', buttons: 0 });
  await pen('mousePressed', a, { buttons: 1 });
  for (let i = 1; i <= 6; i++) await pen('mouseMoved', { x: a.x + (b.x - a.x) * i / 6, y: a.y }, { buttons: 1 });
  await pen('mouseReleased', b, { buttons: 0 });
  await waitW1('100,200 100,250 150,250');
  await same('a pen');
}, { skip: chromeOnly });
