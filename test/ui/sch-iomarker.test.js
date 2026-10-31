// UI: I/O markers placed on empty space (#680): the Add I/O Marker tool on the void asks the name with the
// next free one (in1, out1), the marker is a port of the generated HDL, a wire drawn later from its tip
// connects it; the hint and the name prompt in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newDoc, symbolPins, normalizeDoc } from '../../core/schdoc.js';

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
const getDoc = page => page.eval(() => window.Silinx.active.schEditor.getDoc());
const prompt = page => page.eval(() => ({ label: document.querySelector('.se-prompt label')?.textContent, value: document.querySelector('.se-prompt input')?.value }));
const problems = page => page.eval(async () => (await import('/core/schdoc.js')).netlist(window.Silinx.active.schEditor.getDoc()).diagnostics.map((d) => `${d.severity}: ${d.message}`));
const hint = page => page.eval((ed) => document.querySelector(`${ed} .se-status .hint`).textContent, ED);

uiTest('#680 schematic: I/O markers placed on empty space (the next free name), wired later from their tips', E, async (page) => {
  const doc = newDoc('vd', 'vhdl');
  const inv = { id: 'S1', type: 'inv', x: 200, y: 200, rot: 0, mirror: false, name: 'XLXI_1', params: {} };
  doc.symbols.push(inv);
  const pin = n => symbolPins(normalizeDoc({ ...doc, symbols: [inv] }).symbols[0], {}).find((p) => p.name === n);
  const I = pin('I'), O = pin('O');
  const A = { x: I.x - 40, y: I.y + 60 }, Y = { x: O.x + 40, y: O.y + 60 };   // empty space, both sides
  await makeProject(env, { name: 'VoidPj', files: { 'src/vd.sch.json': JSON.stringify(doc) } });
  await page.openProject('VoidPj');
  await page.eval(() => window.SilinxApp.openSch('src/vd.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'drawn' });
  await page.click(`${ED} .se-btn[data-act=io]`);
  assert.equal(await hint(page), 'Add I/O Marker: click a wire end, a pin or empty space to add a port marker (a wire to its tip connects it later).');
  // an input on empty space: in1 proposed, Enter keeps it
  await page.click(await at(page, A.x, A.y));
  await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'port name prompt focused' });
  assert.deepEqual(await prompt(page), { label: 'Input port name', value: 'in1' });
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 1, [], { what: 'in1 placed' });
  // another on empty space: an input too (no direction to choose in the toolbar, #1180), named out1 by the user; wired to
  // the inverter's output below, it becomes an output (#1109)
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-opts`).childElementCount, ED), 0, 'no options');
  await page.click(await at(page, Y.x, Y.y));
  await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'port name prompt focused' });
  assert.deepEqual(await prompt(page), { label: 'Input port name', value: 'in2' });
  await page.eval(() => { const i = document.querySelector('.se-prompt input'); i.value = 'out1'; i.dispatchEvent(new Event('input')); });
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 2, [], { what: 'out1 placed' });
  let d = await getDoc(page);
  assert.deepEqual(d.ports.map((p) => [p.name, p.dir, p.width, p.x, p.y]), [['in1', 'in', 1, A.x, A.y], ['out1', 'in', 1, Y.x, Y.y]]);
  assert.deepEqual(d.wires, []);
  // the editor's problems: both markers unconnected (warnings, no error)
  assert.deepEqual(await problems(page), ['warning: input pin I of XLXI_1 (inv) is not connected', "warning: I/O marker 'in1' is not connected", "warning: I/O marker 'out1' is not connected"]);
  // wired later: from in1's tip to the inverter's input, from its output to out1's tip
  await page.click(`${ED} .se-btn[data-act=wire]`);
  await page.click(await at(page, A.x, A.y));
  await page.click(await at(page, I.x, I.y));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 1, [], { what: 'first wire' });
  await page.click(await at(page, O.x, O.y));
  await page.click(await at(page, Y.x, Y.y));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 2, [], { what: 'second wire' });
  assert.deepEqual((await getDoc(page)).ports.map((p) => [p.name, p.dir]), [['in1', 'in'], ['out1', 'out']]);
  assert.deepEqual(await problems(page), []);
  // the HDL generated from it: the two ports, the inverter between them
  await page.waitFor(async () => /out1 <= not in1;/.test(await (await fetch('/api/projects/VoidPj/file?path=src%2Fvd.vhd')).text()), [], { what: 'the HDL follows the schematic', timeout: 15000 });
  assert.match(await readWs(env, 'VoidPj', 'src/vd.vhd'), /in1 : in std_logic;\s*out1 : out std_logic/);
  // in Portuguese: the hint and the prompt; Escape places nothing
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.click(`${ED} .se-btn[data-act=io]`);
    await page.waitFor((ed) => /^Adicionar Marcador de E\/S:/.test(document.querySelector(`${ed} .se-status .hint`).textContent), [ED], { what: 'the hint in Portuguese' });
    assert.equal(await hint(page), 'Adicionar Marcador de E/S: clique na ponta de um fio, num pino ou num espaço vazio para adicionar um marcador de porto (um fio até à sua ponta liga-o depois).');
    await page.click(await at(page, (A.x + Y.x) / 2, A.y + 40));
    await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'port name prompt focused' });
    await page.waitFor(() => document.querySelector('.se-prompt label')?.textContent === 'Nome do porto de saída', [], { what: 'the prompt in Portuguese' });
    // (the direction of the marker added last, out1: #2170)
    assert.deepEqual(await prompt(page), { label: 'Nome do porto de saída', value: 'out2' });
    await page.key('Escape');
    await page.waitFor(() => !document.querySelector('.se-prompt'), [], { what: 'prompt closed' });
    d = await getDoc(page);
    assert.equal(d.ports.length, 2);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
    await page.key('Escape');
  }
});

uiTest('#1109 schematic: an input marker wired to an inverter\'s output becomes an output, an output marker wired to its input an input; one Undo reverts both; the HDL follows', E, async (page) => {
  const doc = newDoc('dr', 'vhdl');
  const inv = { id: 'S1', type: 'inv', x: 200, y: 200, rot: 0, mirror: false, name: 'XLXI_1', params: {} };
  doc.symbols.push(inv);
  const pin = n => symbolPins(normalizeDoc({ ...doc, symbols: [inv] }).symbols[0], {}).find((p) => p.name === n);
  const I = pin('I'), O = pin('O');
  // the markers the wrong way round, on empty space: an input on the output's side, an output on the input's
  const Y = { x: O.x + 60, y: O.y }, A = { x: I.x - 60, y: I.y };
  doc.ports.push({ id: 'P1', name: 'y', dir: 'in', width: 1, ...Y }, { id: 'P2', name: 'a', dir: 'out', width: 1, ...A });
  await makeProject(env, { name: 'DirPj', files: { 'src/dr.sch.json': JSON.stringify(doc) } });
  await page.openProject('DirPj');
  await page.eval(() => window.SilinxApp.openSch('src/dr.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'drawn' });
  const dirs = async () => (await getDoc(page)).ports.map((p) => [p.name, p.dir]);
  await page.click(`${ED} .se-btn[data-act=wire]`);
  await page.click(await at(page, O.x, O.y));
  await page.click(await at(page, Y.x, Y.y));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 1, [], { what: 'the wire to y' });
  assert.deepEqual(await dirs(page), [['y', 'out'], ['a', 'out']]);
  await page.click(await at(page, A.x, A.y));
  await page.click(await at(page, I.x, I.y));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 2, [], { what: 'the wire from a' });
  assert.deepEqual(await dirs(page), [['y', 'out'], ['a', 'in']]);
  assert.deepEqual(await problems(page), []);
  await page.waitFor(async () => /y <= not a;/.test(await (await fetch('/api/projects/DirPj/file?path=src%2Fdr.vhd')).text()), [], { what: 'the HDL follows the schematic', timeout: 15000 });
  assert.match(await readWs(env, 'DirPj', 'src/dr.vhd'), /a : in std_logic;\s*y : out std_logic|y : out std_logic;\s*a : in std_logic/);
  // one Undo: the last wire and a's direction together
  await page.eval(() => window.Silinx.active.schEditor.undo());
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 1, [], { what: 'undone' });
  assert.deepEqual(await dirs(page), [['y', 'out'], ['a', 'out']]);
});
