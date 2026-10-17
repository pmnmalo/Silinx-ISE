// UI: schematic editor (place symbols, wire them, I/O markers, save, its HDL), ASM chart
// editor (states, decision, case box, connections, its HDL; # Snap, </> Code and Copy, Reset
// route / Delete connection, Swap 1 / 0 exits, a case exit's ✕, Delete box, Zoom / Fit, ↶ ↷ and
// Edit ▸ Undo / Redo: #195), print preview of a diagram; the schematic editor's Rotate (Ctrl+R,
// toolbar, properties), zoom buttons, palette Place Symbol.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, waitDownload, chromeOnly } from './harness.js';
import { compile, elaborate } from '../../core/compile.js';
import { normalizeModel, generate } from '../../core/asm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const PROBLEMS_ASM_NO_E7 = ["error: State 'DONE' has no exit (next state path)"], PROBLEMS_ASM_NO_E5 = ["warning: State 'DONE' is unreachable from the initial state"];

// New Source wizard: a type of the list, a file name, then Next until Finish
async function newSource(page, type, name) {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.click('.dlg-overlay .src-types .st', { text: type });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  for (let i = 0; i < 4; i++) {
    const last = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].some((b) => b.textContent === 'Finish'));
    if (last) break;
    await page.dialogButton('Next >');
  }
  await page.dialogButton('Finish');
  await page.waitNoDialog();
}

// screen position of a pin of a schematic symbol (sheet coordinates through the view transform)
const SCH_PIN = `window.__schPin = async (symIndex, dir) => {
  const sd = await import('/core/schdoc.js');
  const doc = window.Silinx.active.schEditor.getDoc();
  const s = doc.symbols[symIndex];
  const p = sd.symbolPins(s, {}).find((q) => q.dir === dir);
  const svg = document.querySelector('.doc:not([hidden]) .se-svg');
  const r = svg.getBoundingClientRect();
  const m = /translate\\(([-\\d.]+),([-\\d.]+)\\) scale\\(([\\d.]+)\\)/.exec(svg.querySelector('.se-vp').getAttribute('transform'));
  return { x: r.left + +m[1] + p.x * +m[3], y: r.top + +m[2] + p.y * +m[3] };
};`;

uiTest('schematic editor: place two inverters, wire them, add I/O markers, save, its HDL generated from it', E, async (page) => {
  await makeProject(env, { name: 'SchPj' });
  await page.openProject('SchPj');
  await newSource(page, 'Schematic (Diagram)', 'chain');
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/chain.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'));
  await page.eval(SCH_PIN);
  // the palette: search, then click the symbol and click twice on the sheet
  await page.fill('.doc:not([hidden]) .se-search', 'inv');
  await page.click('.doc:not([hidden]) .se-symrow', { text: 'INV' });
  const c = await page.eval(() => { const r = document.querySelector('.doc:not([hidden]) .se-svg').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.click({ x: c.x - 120, y: c.y });
  await page.click({ x: c.x + 120, y: c.y });
  await page.key('Escape');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 2);
  assert.deepEqual(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols.map((s) => s.type)), ['inv', 'inv']);
  // wire: output of the first to the input of the second
  await page.click('.doc:not([hidden]) .se-btn[data-act=wire]');
  await page.click(await page.eval(() => window.__schPin(0, 'out')));
  await page.click(await page.eval(() => window.__schPin(1, 'in')));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 1);
  // I/O markers on the free pins (name asked in place)
  await page.click('.doc:not([hidden]) .se-btn[data-act=io]');
  for (const [i, dir, name] of [[0, 'in', 'din'], [1, 'out', 'dout']]) {
    await page.click(await page.eval((k, d) => window.__schPin(k, d), i, dir));
    await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'port name prompt focused' });
    await page.type(name);
    await page.key('Enter');
    await page.waitFor((n) => window.Silinx.active.schEditor.getDoc().ports.some((p) => p.name === n), [name]);
  }
  await page.key('Escape');
  const doc = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  assert.deepEqual(doc.ports.map((p) => `${p.name}:${p.dir}`).sort(), ['din:in', 'dout:out']);
  // the editor's Check has no errors
  await page.click('.doc:not([hidden]) .se-btn[data-act=check]');
  // saved automatically (the .sch.json on disk)
  await page.waitFor(async () => { const d = JSON.parse(await (await fetch('/api/projects/SchPj/file?path=src/chain.sch.json')).text()); return d.symbols.length === 2 && d.ports.length === 2; }, [], { what: 'schematic saved' });
  const saved = JSON.parse(await readWs(env, 'SchPj', 'src/chain.sch.json'));
  assert.equal(saved.symbols.length, 2);
  assert.equal(saved.wires.length, 1);
  assert.equal(saved.ports.length, 2);
  // its HDL src/chain.vhd, generated from it (no Generate HDL any more, #220), compiles to two inverters in series
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-btn[data-act=generate]')), null);
  await page.waitFor(async () => /dout/.test(await (await fetch('/api/projects/SchPj/file?path=src%2Fchain.vhd')).text()), [], { what: 'the HDL follows the schematic', timeout: 15000 });
  const vhd = await readWs(env, 'SchPj', 'src/chain.vhd');
  assert.match(vhd, /entity chain is/i);
  const lib = compile([{ path: 'src/chain.vhd', lang: 'vhdl', text: vhd }]);
  const d = elaborate(lib, 'chain');
  assert.deepEqual([...lib.errors, ...d.diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
  assert.deepEqual(d.top.ports.map((p) => `${p.name}:${p.dir}`).sort(), ['din:in', 'dout:out']);
  // in the hierarchy the schematic is the module, its views as badges: the schematic the base, then its HDL (#207, #220)
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl').textContent === 'chain' && /chain\.sch\.json/.test(r.querySelector('.meta')?.textContent)));
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.lbl').textContent === 'chain').map((r) => [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`))), [['Schematic*', 'VHDL']]);
  // (the HDL file there from the start: every source has its HDL)
  assert.match(await page.consoleText(), /src\/chain\.vhd generated from src\/chain\.sch\.json \(every source has its HDL\)/);
  // its HDL: the file of the Design pane (no View HDL button, #311)
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-btn[data-act=view]')), null);
  assert.match(await readWs(env, 'SchPj', 'src/chain.vhd'), /entity chain is/i);
});

uiTest('schematic editor (#196): Rotate by Ctrl+R, the toolbar and the properties (rot saved in the .sch.json), Zoom In / Out / Full View buttons, the palette context menu Place Symbol', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  const doc = newDoc('rot', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'and2', x: 300, y: 100, rot: 0, mirror: false, name: 'U1', params: {} });
  await makeProject(env, { name: 'SchRot', files: { 'src/rot.sch.json': JSON.stringify(doc) }, top: '' });
  await page.openProject('SchRot');
  await page.eval(() => window.SilinxApp.openSch('src/rot.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/rot.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  const saved = async () => JSON.parse(await readWs(env, 'SchRot', 'src/rot.sch.json'));
  const waitRot = (rots) => page.waitFor(async (r) => JSON.stringify(JSON.parse(await (await fetch('/api/projects/SchRot/file?path=src%2Frot.sch.json')).text()).symbols.map((s) => s.rot)) === r, [JSON.stringify(rots)], { what: `saved rotations ${rots}` });
  // nothing selected: Rotate disabled
  assert.equal(await page.eval((d) => document.querySelector(`${d} .se-btn[data-act=rotate]`).disabled, D), true);
  // Ctrl+A selects the AND2; Ctrl+R: 90, the toolbar's Rotate: 180, Ctrl+R: 270, the toolbar: 0
  await page.click(`${D} .se-svg`);   // focus the editor (an empty spot of the sheet)
  await page.key('a', { modifiers: 2 });
  await page.waitFor((d) => !document.querySelector(`${d} .se-btn[data-act=rotate]`).disabled, [D], { what: 'Rotate enabled' });
  await page.key('r', { modifiers: 2 });
  await waitRot([90]);
  await page.click(`${D} .se-btn[data-act=rotate]`);
  await waitRot([180]);
  await page.key('r', { modifiers: 2 });
  await waitRot([270]);
  await page.click(`${D} .se-btn[data-act=rotate]`);
  await waitRot([0]);
  assert.deepEqual((await saved()).symbols.map((s) => [s.type, s.rot, s.mirror]), [['and2', 0, false]]);
  // zoom: In x1.25, Out x0.8 (back), Full View fits the drawing; the status bar shows the zoom
  const zoom = () => page.eval((d) => [+/scale\(([\d.]+)\)/.exec(document.querySelector(`${d} .se-vp`).getAttribute('transform'))[1], document.querySelector(`${d} .zoom`).textContent], D);
  const [s0] = await zoom();
  await page.click(`${D} .se-btn[data-act=zin]`);
  const [s1, t1] = await zoom();
  assert.ok(Math.abs(s1 / s0 - 1.25) < 1e-6, `${s0} -> ${s1}`);
  assert.equal(t1, `${Math.round(s1 * 100)}%`);
  await page.click(`${D} .se-btn[data-act=zout]`);
  await page.click(`${D} .se-btn[data-act=zout]`);
  const [s2] = await zoom();
  assert.ok(Math.abs(s2 / s0 - 0.8) < 1e-6, `${s0} -> ${s2}`);
  await page.click(`${D} .se-btn[data-act=fit]`);
  const [s3, t3] = await zoom();
  assert.ok(s3 <= 2 && s3 > s2, `fit: ${s3}`);
  assert.equal(t3, `${Math.round(s3 * 100)}%`);
  // the palette's context menu: Symbol Info… and Place Symbol; placing, Ctrl+R turns the symbol before the click
  await page.fill(`${D} .se-search`, 'inv');
  await page.rightClick(`${D} .se-symrow`, { text: 'INV' });
  await page.waitForSelector('body > .menu-popup');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((e) => e.textContent)), ['Symbol Info…', 'Place Symbol']);
  await page.click('body > .menu-popup .mi', { text: 'Place Symbol' });
  await page.waitFor((d) => document.querySelector(`${d} .se-symrow.active`)?.textContent === 'INV', [D], { what: 'INV being placed' });
  await page.key('r', { modifiers: 2 });
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 60 }; }, D);
  await page.click(c);
  await page.key('Escape');
  await waitRot([0, 90]);
  assert.deepEqual((await saved()).symbols.map((s) => [s.type, s.rot]), [['and2', 0], ['inv', 90]]);
  // both selected (Ctrl+A): the properties' Rotate turns each
  await page.key('a', { modifiers: 2 });
  await page.waitFor((d) => document.querySelector(`${d} .se-ptitle`)?.textContent === '2 objects selected', [D], { what: 'two selected' });
  await page.click(`${D} .se-pbtns .btn`, { text: 'Rotate' });
  await waitRot([90, 180]);
  assert.deepEqual(page.dialogs, []);
});

// #339 regression: every compile of the project gives the open schematics their modules again; the same modules
// no longer make the palette and the properties anew, so a click held across a compile (the save of the edit
// before it compiles the project) is not lost: the properties' Rotate and a palette row, pressed, a compile, released
uiTest('#339 schematic editor: a click on the properties\' Rotate or a palette row held across a compile of the project is not lost (the same modules make nothing anew)', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  const doc = newDoc('held', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'and2', x: 300, y: 100, rot: 0, mirror: false, name: 'U1', params: {} }, { id: 'S2', type: 'inv', x: 300, y: 300, rot: 0, mirror: false, name: 'U2', params: {} });
  await makeProject(env, { name: 'SchHeld', files: { 'src/held.sch.json': JSON.stringify(doc) }, top: '' });
  await page.openProject('SchHeld');
  await page.eval(() => window.SilinxApp.openSch('src/held.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/held.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  const waitRot = (rots) => page.waitFor(async (r) => JSON.stringify(JSON.parse(await (await fetch('/api/projects/SchHeld/file?path=src%2Fheld.sch.json')).text()).symbols.map((s) => s.rot)) === r, [JSON.stringify(rots)], { what: `saved rotations ${rots}` });
  // a compile of the project, its modules given to the editor (awaited): the element pressed still the same one
  const compileHeld = (sel) => page.eval(async (s) => {
    const el = document.querySelector(s), ed = window.SilinxApp.findDoc('sch:src/held.sch.json').schEditor, set = ed.setModules;
    const given = new Promise((res) => { ed.setModules = (m) => { ed.setModules = set; set(m); res(); }; });
    window.SilinxApp.compileProject();
    await given;
    return el.isConnected;
  }, sel);
  await page.click(`${D} .se-svg`);   // focus the editor (an empty spot of the sheet); Ctrl+A: both selected
  await page.key('a', { modifiers: 2 });
  await page.waitFor((d) => document.querySelector(`${d} .se-ptitle`)?.textContent === '2 objects selected', [D], { what: 'two selected' });
  const rot = await page.point(`${D} .se-pbtns .btn`, { text: 'Rotate' });
  await page.mouse('mouseMoved', rot.x, rot.y);
  await page.mouse('mousePressed', rot.x, rot.y);
  assert.equal(await compileHeld(`${D} .se-pbtns .btn`), true, 'the properties kept');
  await page.mouse('mouseReleased', rot.x, rot.y);
  await waitRot([90, 90]);
  // a palette row: pressed, a compile, released: the symbol being placed
  await page.fill(`${D} .se-search`, 'inv');
  const row = await page.point(`${D} .se-symrow`, { text: 'INV' });
  await page.mouse('mouseMoved', row.x, row.y);
  await page.mouse('mousePressed', row.x, row.y);
  assert.equal(await compileHeld(`${D} .se-symrow`), true, 'the palette kept');
  await page.mouse('mouseReleased', row.x, row.y);
  await page.waitFor((d) => document.querySelector(`${d} .se-symrow.active`)?.textContent === 'INV', [D], { what: 'INV being placed' });
  await page.key('Escape');
  assert.deepEqual(page.dialogs, []);
});

// #296: the I/O markers turned (Ctrl+R, the toolbar, the properties: a quarter turn clockwise around their
// connection point) and mirrored (to the opposite side); the side saved in the .sch.json (none when it is
// the default one), the marker drawn there; with a symbol selected too, both turn; one Undo
uiTest('#296 schematic editor: I/O markers rotated and mirrored (Ctrl+R / Ctrl+M, the toolbar, the properties), drawn and saved on their side', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  const doc = newDoc('io', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 300, y: 100, rot: 0, mirror: false, name: 'U1', params: {} });
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 200, y: 300 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 500, y: 300 });
  await makeProject(env, { name: 'SchIo', files: { 'src/io.sch.json': JSON.stringify(doc) }, top: '' });
  await page.openProject('SchIo');
  await page.eval(() => window.SilinxApp.openSch('src/io.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/io.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  const waitSides = (sides) => page.waitFor(async (want) => JSON.stringify(JSON.parse(await (await fetch('/api/projects/SchIo/file?path=src%2Fio.sch.json')).text()).ports.map((q) => q.side ?? null)) === want,
    [JSON.stringify(sides)], { what: `saved sides ${sides}` });
  // the marker as drawn: where its body is from the connection point, and its name upright or turned
  const drawn = (id) => page.eval((d, i) => {
    const g = document.querySelector(`${d} g.port[data-id="${i}"]`), b = g.querySelector('.iomark').getBBox(), t = g.querySelector('.ioname');
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), turned: /rotate\(-90/.test(t.getAttribute('transform') || '') };
  }, D, id);
  assert.deepEqual(await drawn('P1'), { x: 170, y: 293, w: 27, h: 14, turned: false });
  // the input selected: Rotate and Mirror enabled
  await page.click(`${D} g.port[data-id="P1"] .iomark`);
  await page.waitFor((d) => !document.querySelector(`${d} .se-btn[data-act=rotate]`).disabled && !document.querySelector(`${d} .se-btn[data-act=mirror]`).disabled, [D], { what: 'Rotate, Mirror enabled' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} .se-ptitle`)?.textContent, D), 'I/O Marker');
  // Ctrl+R: above (N), the name turned; the toolbar: E; Ctrl+R: S; the toolbar: W, the default again
  await page.key('r', { modifiers: 2 });
  await waitSides(['N', null]);
  assert.deepEqual(await drawn('P1'), { x: 193, y: 270, w: 14, h: 27, turned: true });
  await page.click(`${D} .se-btn[data-act=rotate]`);
  await waitSides(['E', null]);
  assert.deepEqual(await drawn('P1'), { x: 203, y: 293, w: 27, h: 14, turned: false });
  await page.key('r', { modifiers: 2 });
  await waitSides(['S', null]);
  assert.deepEqual(await drawn('P1'), { x: 193, y: 303, w: 14, h: 27, turned: true });
  await page.click(`${D} .se-btn[data-act=rotate]`);
  await waitSides([null, null]);
  // Ctrl+M: the opposite side (E); the properties' Mirror: back (W); the properties' Rotate: N; Undo: W
  // (then Ctrl+A on the sheet: the focus there again)
  await page.key('m', { modifiers: 2 });
  await waitSides(['E', null]);
  await page.click(`${D} .se-pbtns .btn`, { text: 'Mirror' });
  await waitSides([null, null]);
  await page.click(`${D} .se-pbtns .btn`, { text: 'Rotate' });
  await waitSides(['N', null]);
  await page.click(`${D} [data-act=undo]`);
  await waitSides([null, null]);
  // everything selected: the inverter and both markers turn (the output's default E -> S)
  await page.click(`${D} .se-svg`);
  await page.key('a', { modifiers: 2 });
  await page.waitFor((d) => document.querySelector(`${d} .se-ptitle`)?.textContent === '3 objects selected', [D], { what: 'three selected' });
  await page.key('r', { modifiers: 2 });
  await waitSides(['N', 'S']);
  assert.deepEqual(JSON.parse(await readWs(env, 'SchIo', 'src/io.sch.json')).symbols.map((x) => x.rot), [90]);
  assert.deepEqual(page.dialogs, []);
});

// #301: the palette's multiplexers and demultiplexers, with and without the enable E (M2_1 … M16_1,
// DEMUX1_2 … DEMUX1_16), the decoders and encoders by their presets only; a M4_1 placed has S1 and S0
uiTest('#301 #313 #334 schematic palette: one MUX and one DEMUX (no M4_1 … / DEMUX1_n / E entries; one DECODER / ENCODER); a MUX with Select bits 2 is M4_1 with S1 S0, its type drawn; E and the bus widths; Select as a bus; a DEMUX with 3 select bits', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  await makeProject(env, { name: 'SchMux', files: { 'src/mx.sch.json': JSON.stringify(newDoc('mx', 'vhdl')) }, top: '' });
  await page.openProject('SchMux');
  await page.eval(() => window.SilinxApp.openSch('src/mx.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/mx.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  const rows = () => page.eval((d) => [...document.querySelectorAll(`${d} .se-symrow`)].map((r) => r.textContent.trim()), D);
  // (#334: one MUX, one DEMUX: their select bits in their properties)
  await page.fill(`${D} .se-cat`, 'Mux');
  assert.deepEqual(await rows(), ['MUX', 'DEMUX']);
  await page.fill(`${D} .se-cat`, '<all>');
  await page.fill(`${D} .se-search`, 'CODER');
  const coders = await rows();
  // (#324: one DECODER and one ENCODER, no D2_4E … / ENC / PENC entries)
  assert.ok(coders.includes('DECODER') && coders.includes('ENCODER'), coders.join(' '));
  assert.deepEqual(coders.filter((t) => /^(D\d+_\d+E?|P?ENC\d+_\d+)$/.test(t)), [], 'no preset entries');
  // a MUX placed (the M2_1), Select bits 2: a M4_1, its select pins S1 and S0 (the drawing's pin names), saved with selBus false
  await page.fill(`${D} .se-search`, 'MUX');
  await page.click(`${D} .se-symrow`, { text: 'MUX' });
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, D);
  await page.click(c);
  await page.key('Escape');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchMux/file?path=src%2Fmx.sch.json')).text()).symbols.length === 1, [], { what: 'MUX saved' });
  const sid = JSON.parse(await readWs(env, 'SchMux', 'src/mx.sch.json')).symbols[0].id;
  await page.click(`${D} g.sym[data-id="${sid}"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=muxSel]`), [D], { what: 'Select bits' });
  assert.deepEqual(await page.eval((d) => { const e = document.querySelector(`${d} [data-param=muxSel]`); return [e.value, [...e.options].map((o) => o.value), e.closest('.se-field').querySelector('label').textContent, !!document.querySelector(`${d} [data-param=selBus]`)]; }, D), ['1', ['1', '2', '3', '4'], 'Select bits', false]);
  await page.fill(`${D} [data-param=muxSel]`, '2');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchMux/file?path=src%2Fmx.sch.json')).text()).symbols[0].type === 'mux4', [], { what: 'M4_1 saved' });
  await page.key('Escape');
  const saved = JSON.parse(await readWs(env, 'SchMux', 'src/mx.sch.json'));
  assert.deepEqual([saved.version, saved.symbols[0].type, saved.symbols[0].params.selBus, saved.symbols[0].params.en], [2, 'mux4', false, false]);
  const texts = (cls) => page.eval((d, c) => [...document.querySelectorAll(`${d} .se-svg g.sym ${c}`)].map((t) => t.textContent), D, cls);
  const names = await texts('text');
  for (const n of ['S1', 'S0']) assert.ok(names.includes(n), names.join(' '));
  // its type drawn (#313); no bus pin: no width
  assert.deepEqual([await texts('.stype'), await texts('.pwidth')], [['M4_1'], []]);
  // the enable E and an 8-bit width (its properties): M4_1E, E drawn, the width by the bus pins
  await page.click(`${D} g.sym[data-id="${saved.symbols[0].id}"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=en]`), [D], { what: 'its properties' });
  await page.click(`${D} [data-param=en]`);
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchMux/file?path=src%2Fmx.sch.json')).text()).symbols[0].params.en === true, [], { what: 'E saved' });
  await page.fill(`${D} [data-param=width]`, '8');
  await page.waitFor((d) => [...document.querySelectorAll(`${d} .se-svg g.sym .pwidth`)].length === 5, [D], { what: 'the bus widths' });
  assert.deepEqual(await texts('.stype'), ['M4_1E']);
  assert.ok((await texts('text')).includes('E'));
  assert.deepEqual([...new Set(await texts('.pwidth'))], ['8'], 'D0..D3 and O: 8');
  // Select as a bus: one pin S (2 bits) instead of S1 S0
  await page.waitFor((d) => document.querySelector(`${d} [data-param=selBus]`), [D], { what: 'Select as a bus' });
  await page.click(`${D} [data-param=selBus]`);
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchMux/file?path=src%2Fmx.sch.json')).text()).symbols[0].params.selBus === true, [], { what: 'selBus saved' });
  await page.waitFor((d) => [...document.querySelectorAll(`${d} .se-svg g.sym text`)].some((t) => t.textContent === 'S'), [D], { what: 'the bus S drawn' });
  assert.ok(!(await texts('text')).includes('S1'));
  // Select bits 3: M8_1E, the width, the enable and the select bus kept
  await page.waitFor((d) => document.querySelector(`${d} [data-param=muxSel]`)?.value === '2', [D], { what: 'Select bits 2' });
  await page.fill(`${D} [data-param=muxSel]`, '3');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchMux/file?path=src%2Fmx.sch.json')).text()).symbols[0].type === 'mux8', [], { what: 'M8_1 saved' });
  const p8 = JSON.parse(await readWs(env, 'SchMux', 'src/mx.sch.json')).symbols[0].params;
  assert.deepEqual([p8.width, p8.en, p8.selBus], [8, true, true]);
  await page.waitFor((d) => [...document.querySelectorAll(`${d} .se-svg g.sym .stype`)].map((t) => t.textContent).join() === 'M8_1E', [D], { what: 'M8_1E drawn' });
  await page.key('Escape');
  // a DEMUX placed (the DEMUX1_2), its Select bits 3: DEMUX1_8
  await page.fill(`${D} .se-search`, 'DEMUX');
  await page.click(`${D} .se-symrow`, { text: 'DEMUX' });
  const c2 = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.3 }; }, D);
  await page.click(c2);
  await page.key('Escape');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchMux/file?path=src%2Fmx.sch.json')).text()).symbols.length === 2, [], { what: 'DEMUX saved' });
  const dm = JSON.parse(await readWs(env, 'SchMux', 'src/mx.sch.json')).symbols[1];
  assert.deepEqual([dm.type, dm.params.sel], ['demux', 1]);
  await page.click(`${D} g.sym[data-id="${dm.id}"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=sel]`), [D], { what: 'its Select bits' });
  await page.fill(`${D} [data-param=sel]`, '3');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchMux/file?path=src%2Fmx.sch.json')).text()).symbols[1].params.sel === 3, [], { what: 'sel 3 saved' });
  await page.waitFor((d) => [...document.querySelectorAll(`${d} .se-svg g.sym .stype`)].map((t) => t.textContent).includes('DEMUX1_8'), [D], { what: 'DEMUX1_8 drawn' });
  assert.deepEqual(page.dialogs, []);
});

// #304 / #317: the adder of two 1-, 2-, 4-bit numbers with a pin per bit is the palette's ADD with its options
// (no ADD1 / ADD2 / ADD4 entries): Width 4, the carries and Pins per bit make it ADD4, its pins drawn
uiTest('#304 #317 schematic palette: ADD only; Width 4, carries and Pins per bit in its properties: ADD4 with A0..A3, B0..B3, CI, S0..S3, CO', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  await makeProject(env, { name: 'SchAdd', files: { 'src/ad.sch.json': JSON.stringify(newDoc('ad', 'vhdl')) }, top: '' });
  await page.openProject('SchAdd');
  await page.eval(() => window.SilinxApp.openSch('src/ad.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/ad.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  await page.fill(`${D} .se-search`, 'ADD');
  const rows = await page.eval((d) => [...document.querySelectorAll(`${d} .se-symrow`)].map((r) => r.textContent.trim()), D);
  assert.ok(rows.includes('ADD'), rows.join(' '));
  assert.deepEqual(rows.filter((r) => /^ADD\d/.test(r)), [], 'no ADD1 / ADD2 / ADD4');
  await page.click(`${D} .se-symrow`, { text: 'ADD' });
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; }, D);
  await page.click(c);
  await page.key('Escape');
  const file = async () => JSON.parse(await page.eval(async () => (await fetch('/api/projects/SchAdd/file?path=src%2Fad.sch.json')).text()));
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchAdd/file?path=src%2Fad.sch.json')).text()).symbols.length === 1, [], { what: 'ADD saved' });
  const id = (await file()).symbols[0].id;
  await page.click(`${D} g.sym[data-id="${id}"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=width]`), [D], { what: 'its properties' });
  await page.fill(`${D} [data-param=width]`, '4');
  for (const q of ['cin', 'cout', 'bits']) {
    await page.waitFor((d, x) => document.querySelector(`${d} [data-param=${x}]`), [D, q], { what: q });
    await page.click(`${D} [data-param=${q}]`);
    await page.waitFor(async (x) => JSON.parse(await (await fetch('/api/projects/SchAdd/file?path=src%2Fad.sch.json')).text()).symbols[0].params[x] === true, [q], { what: `${q} saved` });
  }
  const p = (await file()).symbols[0].params;
  assert.deepEqual([p.width, p.cin, p.cout, p.bits], [4, true, true, true]);
  const names = await page.eval((d) => [...document.querySelectorAll(`${d} .se-svg g.sym text`)].map((t) => t.textContent), D);
  for (const n of ['ADD4', 'A0', 'A3', 'B0', 'B3', 'CI', 'S0', 'S3', 'CO']) assert.ok(names.includes(n), names.join(' '));
  assert.deepEqual(page.dialogs, []);
});

uiTest('#315 schematic flip-flops: FD / FT / FJK in the palette; CE and CLR in an FD\'s properties make it FDCE; R then unavailable', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  await makeProject(env, { name: 'SchFf', files: { 'src/ff.sch.json': JSON.stringify(newDoc('ff', 'vhdl')) }, top: '' });
  await page.openProject('SchFf');
  await page.eval(() => window.SilinxApp.openSch('src/ff.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/ff.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  await page.fill(`${D} .se-cat`, 'Flip-Flops');
  const rows = await page.eval((d) => [...document.querySelectorAll(`${d} .se-symrow`)].map((r) => r.textContent.trim()), D);
  assert.deepEqual(rows, ['FD', 'FT', 'FJK']);
  await page.click(`${D} .se-symrow`, { text: 'FD' });
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; }, D);
  await page.click(c);
  await page.key('Escape');
  const saved = async () => JSON.parse(await (await page.eval(async () => (await fetch('/api/projects/SchFf/file?path=src%2Fff.sch.json')).text())));
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchFf/file?path=src%2Fff.sch.json')).text()).symbols.length === 1, [], { what: 'FD saved' });
  const id = (await saved()).symbols[0].id;
  await page.click(`${D} g.sym[data-id="${id}"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-ff=ce]`), [D], { what: 'its inputs' });
  const waitType = (t) => page.waitFor(async (x) => JSON.parse(await (await fetch('/api/projects/SchFf/file?path=src%2Fff.sch.json')).text()).symbols[0].type === x, [t], { what: `the type ${t}` });
  await page.click(`${D} [data-ff=ce]`);
  await waitType('fde');
  await page.waitFor((d) => document.querySelector(`${d} [data-ff=clr]`), [D], { what: 'the inputs again' });
  await page.click(`${D} [data-ff=clr]`);
  await waitType('fdce');
  await page.waitFor((d) => document.querySelector(`${d} [data-ff=r]`), [D], { what: 'the inputs again' });
  assert.deepEqual(await page.eval((d) => ['ce', 'clr', 'pre', 'r', 's'].map((q) => { const e = document.querySelector(`${d} [data-ff=${q}]`); return `${q}:${e.checked ? 1 : 0}${e.disabled ? '-' : ''}`; }), D), ['ce:1', 'clr:1', 'pre:0', 'r:0-', 's:0-']);
  const names = await page.eval((d) => [...document.querySelectorAll(`${d} .se-svg g.sym .stype`)].map((t) => t.textContent), D);
  assert.deepEqual(names, ['FDCE']);
  assert.deepEqual(page.dialogs, []);
});

// #328: the gates' inverted-input variants (AND3B2…) are the basic gate's Inverted inputs, not palette entries;
// #330: one entry a gate (AND, OR, NAND, NOR, XOR, XNOR), its Inputs making AND3, AND4…
uiTest('#328 #330 schematic gates: AND, OR, NAND, NOR, XOR, XNOR only in the palette; an AND\'s Inputs 3 make it AND3, Inverted inputs 2 AND3B2, 0 AND3 again, Inputs 2 AND2; the labels in Portuguese', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  await makeProject(env, { name: 'SchGb', files: { 'src/g.sch.json': JSON.stringify(newDoc('g', 'vhdl')) }, top: '' });
  await page.openProject('SchGb');
  await page.eval(() => window.SilinxApp.openSch('src/g.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/g.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  await page.fill(`${D} .se-cat`, 'Logic');
  const rows = await page.eval((d) => [...document.querySelectorAll(`${d} .se-symrow .nm`)].map((r) => r.textContent.trim()), D);
  assert.deepEqual(rows.filter((r) => /^X?N?(AND|OR)/.test(r)), ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'], 'one entry a gate, no AND3 / ANDnBk…');
  await page.click(`${D} .se-symrow`, { text: 'AND' });
  await page.waitFor((d) => /^AND: /.test(document.querySelector(`${d} .se-syminfo`)?.textContent || ''), [D], { what: 'AND info box' });
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; }, D);
  await page.click(c);
  await page.key('Escape');
  const file = async () => JSON.parse(await page.eval(async () => (await fetch('/api/projects/SchGb/file?path=src%2Fg.sch.json')).text()));
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchGb/file?path=src%2Fg.sch.json')).text()).symbols.length === 1, [], { what: 'AND saved' });
  const id = (await file()).symbols[0].id;
  assert.equal((await file()).symbols[0].type, 'and2');
  const waitType = (t) => page.waitFor(async (x) => JSON.parse(await (await fetch('/api/projects/SchGb/file?path=src%2Fg.sch.json')).text()).symbols[0].type === x, [t], { what: `the type ${t}` });
  await page.click(`${D} g.sym[data-id="${id}"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=inputs]`), [D], { what: 'Inputs' });
  assert.deepEqual(await page.eval((d) => { const e = document.querySelector(`${d} [data-param=inputs]`); return [e.value, [...e.options].map((o) => o.value), e.closest('.se-field').querySelector('label').textContent]; }, D), ['2', ['2', '3', '4'], 'Inputs']);
  await page.fill(`${D} [data-param=inputs]`, '3');
  await waitType('and3');
  await page.waitFor((d) => document.querySelector(`${d} [data-param=invIn]`)?.options.length === 4, [D], { what: 'Inverted inputs 0..3' });
  assert.deepEqual(await page.eval((d) => { const e = document.querySelector(`${d} [data-param=invIn]`); return [e.value, [...e.options].map((o) => o.value), e.closest('.se-field').querySelector('label').textContent]; }, D), ['0', ['0', '1', '2', '3'], 'Inverted inputs']);
  await page.fill(`${D} [data-param=invIn]`, '2');
  await waitType('and3b2');
  const stype = () => page.eval((d) => [...document.querySelectorAll(`${d} .se-svg g.sym .stype`)].map((t) => t.textContent), D);
  await page.waitFor(async (d) => [...document.querySelectorAll(`${d} .se-svg g.sym .stype`)].map((t) => t.textContent).join() === 'AND3B2', [D], { what: 'AND3B2 drawn' });
  // two bubbles (I0, I1) on the drawing
  assert.equal(await page.eval((d, x) => document.querySelectorAll(`${d} g.sym[data-id="${x}"] circle`).length, D, id), 2);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=invIn]`)?.value === '2', [D], { what: 'the field shows 2' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((d) => document.querySelector(`${d} [data-param=invIn]`)?.closest('.se-field').querySelector('label').textContent === 'Entradas invertidas', [D], { what: 'the label in Portuguese' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-param=inputs]`).closest('.se-field').querySelector('label').textContent, D), 'Entradas');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.fill(`${D} [data-param=invIn]`, '0');
  await waitType('and3');
  assert.deepEqual(await stype(), ['AND3']);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=inputs]`)?.value === '3', [D], { what: 'Inputs 3' });
  await page.fill(`${D} [data-param=inputs]`, '2');
  await waitType('and2');
  // #337: the XNOR has its Inverted inputs too (XNOR2B1, a Silinx symbol)
  await page.key('Escape');
  await page.fill(`${D} .se-search`, 'XNOR');
  await page.click(`${D} .se-symrow`, { text: 'XNOR' });
  const c2 = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width * 0.75, y: r.top + r.height * 0.7 }; }, D);
  await page.click(c2);
  await page.key('Escape');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchGb/file?path=src%2Fg.sch.json')).text()).symbols.length === 2, [], { what: 'XNOR saved' });
  const xid = (await file()).symbols[1].id;
  await page.click(`${D} g.sym[data-id="${xid}"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=invIn]`)?.options.length === 3, [D], { what: 'XNOR Inverted inputs 0..2' });
  await page.fill(`${D} [data-param=invIn]`, '1');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchGb/file?path=src%2Fg.sch.json')).text()).symbols[1].type === 'xnor2b1', [], { what: 'XNOR2B1 saved' });
  assert.deepEqual(page.dialogs, []);
});

// #319: COMP and CNT with Pins per bit (their properties); #320: the category General (was I/O)
uiTest('#319 #320 schematic: COMP and CNT with Pins per bit (A0.. B0.., Q0..); the palette category General', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  await makeProject(env, { name: 'SchBits', files: { 'src/b.sch.json': JSON.stringify(newDoc('b', 'vhdl')) }, top: '' });
  await page.openProject('SchBits');
  await page.eval(() => window.SilinxApp.openSch('src/b.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/b.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  const cats = await page.eval((d) => [...document.querySelectorAll(`${d} .se-cat option`)].map((o) => o.textContent), D);
  assert.ok(cats.some((c) => /^General/.test(c)) && !cats.some((c) => /^I\/O/.test(c)), cats.join(' | '));
  const file = async () => JSON.parse(await page.eval(async () => (await fetch('/api/projects/SchBits/file?path=src%2Fb.sch.json')).text()));
  const place = async (title, n, dy) => {
    await page.fill(`${D} .se-search`, title);
    await page.click(`${D} .se-symrow`, { text: title });
    const c = await page.eval((d, y) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * y }; }, D, dy);
    await page.click(c);
    await page.key('Escape');
    await page.waitFor(async (k) => JSON.parse(await (await fetch('/api/projects/SchBits/file?path=src%2Fb.sch.json')).text()).symbols.length === k, [n], { what: `${title} saved` });
    const id = (await file()).symbols[n - 1].id;
    await page.click(`${D} g.sym[data-id="${id}"] .hitbox`);
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: 'Pins per bit' });
    await page.fill(`${D} [data-param=width]`, '3');
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: 'Pins per bit again' });
    await page.click(`${D} [data-param=bits]`);
    await page.waitFor(async (k) => JSON.parse(await (await fetch('/api/projects/SchBits/file?path=src%2Fb.sch.json')).text()).symbols[k - 1].params.bits === true, [n], { what: 'bits saved' });
    return id;
  };
  const comp = await place('COMP', 1, 0.25);
  const cnt = await place('CNT', 2, 0.65);
  const pins = (id) => page.eval((d, i) => [...document.querySelectorAll(`${d} .se-svg g.sym[data-id="${i}"] text`)].map((t) => t.textContent), D, id);
  for (const n of ['A0', 'A2', 'B0', 'B2', 'O']) assert.ok((await pins(comp)).includes(n), (await pins(comp)).join(' '));
  for (const n of ['Q0', 'Q1', 'Q2']) assert.ok((await pins(cnt)).includes(n), (await pins(cnt)).join(' '));
  assert.deepEqual(page.dialogs, []);
});

// #322: the subtractor's borrow in / out and its pins per bit, from its properties
uiTest('#322 schematic SUB: Borrow in, Borrow out and Pins per bit in its properties (A0.., B0.., BI, D0.., BO)', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  await makeProject(env, { name: 'SchSub', files: { 'src/s.sch.json': JSON.stringify(newDoc('s', 'vhdl')) }, top: '' });
  await page.openProject('SchSub');
  await page.eval(() => window.SilinxApp.openSch('src/s.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/s.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  await page.fill(`${D} .se-search`, 'SUB');
  await page.click(`${D} .se-symrow`, { text: 'SUB' });
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; }, D);
  await page.click(c);
  await page.key('Escape');
  const params = () => page.eval(async () => JSON.parse(await (await fetch('/api/projects/SchSub/file?path=src%2Fs.sch.json')).text()).symbols[0]?.params);
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/SchSub/file?path=src%2Fs.sch.json')).text()).symbols.length === 1, [], { what: 'SUB saved' });
  const id = await page.eval(async () => JSON.parse(await (await fetch('/api/projects/SchSub/file?path=src%2Fs.sch.json')).text()).symbols[0].id);
  await page.click(`${D} g.sym[data-id="${id}"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=width]`), [D], { what: 'its properties' });
  await page.fill(`${D} [data-param=width]`, '2');
  for (const q of ['bin', 'bout', 'bits']) {
    await page.waitFor((d, x) => document.querySelector(`${d} [data-param=${x}]`), [D, q], { what: q });
    await page.click(`${D} [data-param=${q}]`);
    await page.waitFor(async (x) => JSON.parse(await (await fetch('/api/projects/SchSub/file?path=src%2Fs.sch.json')).text()).symbols[0].params[x] === true, [q], { what: `${q} saved` });
  }
  const p = await params();
  assert.deepEqual([p.width, p.bin, p.bout, p.bits], [2, true, true, true]);
  const names = await page.eval((d) => [...document.querySelectorAll(`${d} .se-svg g.sym text`)].map((t) => t.textContent), D);
  for (const n of ['SUB2', 'A0', 'A1', 'B0', 'B1', 'BI', 'D0', 'D1', 'BO']) assert.ok(names.includes(n), names.join(' '));
  assert.deepEqual(page.dialogs, []);
});

uiTest('ASM chart editor: add a state, a decision and a case box, connect them, its VHDL generated from it', E, async (page) => {
  await makeProject(env, { name: 'AsmPj' });
  await page.openProject('AsmPj');
  // Tools ▸ ASM State Machine Editor… opens the New Source wizard on the ASM type
  await page.menu('Tools', 'ASM State Machine Editor…');
  await page.waitDialog('New Source Wizard');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .src-types .st.sel').textContent), 'State Machine (ASM)');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ctrl');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctrl.asm.json' && document.querySelector('.doc:not([hidden]) [data-node]'));
  const model = () => page.eval(() => window.Silinx.active.asmEditor.getModel());
  const ids0 = new Set((await model()).nodes.map((n) => n.id));
  // (Undo / Redo: the main toolbar's buttons, #220)
  const tool = (label) => (/^[↶↷]$/.test(label) ? page.click(`.doc:not([hidden]) .asm-toolbar .tb-btn[title=${label === '↶' ? 'Undo' : 'Redo'}]`) : page.click('.doc:not([hidden]) .asm-toolbar .asm-btn', { text: label }));
  // a point inside a node / port that is really on top (boxes may touch)
  const at = (sel) => page.eval((s) => {
    const e = document.querySelector(`.doc:not([hidden]) ${s}`);
    const r = e.getBoundingClientRect();
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.3], [0.3, 0.5], [0.7, 0.5], [0.5, 0.7]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === e || e.contains(hit) || hit.closest(s) === e)) return { x, y };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  const arrange = async () => { await tool('Arrange'); await tool('Fit'); };
  // wait until the node stops moving (Arrange / Fit lay out over several frames on a slow machine)
  const settled = async (sel) => {
    let last = '';
    for (let i = 0; i < 40; i++) {
      const p = JSON.stringify(await at(sel));
      if (p === last) return JSON.parse(p);
      last = p;
      await new Promise((r) => setTimeout(r, 100));
    }
    return JSON.parse(last);
  };
  const isSel = (id) => page.eval((i) => !!document.querySelector(`.doc:not([hidden]) [data-node="${i}"]`)?.classList.contains('sel'), id);
  const select = async (id) => {
    await arrange();
    for (let k = 0; k < 3 && !await isSel(id); k++) {
      await page.click(await settled(`[data-node="${id}"]`));
      await page.waitFor((i) => document.querySelector(`.doc:not([hidden]) [data-node="${i}"]`)?.classList.contains('sel'), [id], { timeout: 3000 }).catch(() => {});
    }
    assert.ok(await isSel(id), `node ${id} selected`);
  };
  const newest = async (type) => (await model()).nodes.filter((n) => n.type === type && !ids0.has(n.id)).map((n) => n.id);
  // nothing selected: a free state
  await page.click('.doc:not([hidden]) .asm-canvas', {});
  await page.key('Escape');
  await tool('State');
  const [s0] = await newest('state');
  // with the new state selected: a decision on its exit, then a case box on the decision's 1 exit
  await tool('Decision');
  const [d0] = await newest('decision');
  await tool('Case');
  const [c0] = await newest('case');
  let m = await model();
  assert.ok(m.edges.some((e) => e.from === s0 && e.to === d0 && e.port === 'next'));
  assert.ok(m.edges.some((e) => e.from === d0 && e.to === c0 && e.port === 'true'));
  // two states on the case exits (one per value of the 1-bit input), one on the decision's 0 exit
  await select(c0); await tool('State');
  await select(c0); await tool('State');
  await select(d0); await tool('State');
  const added = await newest('state');
  assert.equal(added.length, 4);
  m = await model();
  assert.deepEqual(m.edges.filter((e) => e.from === c0).map((e) => e.port).sort(), ['0', '1']);
  assert.ok(m.edges.some((e) => e.from === d0 && e.port === 'false'));
  // the new end states go back to the initial state: drag from their free exit to IDLE
  const idle = m.nodes.find((n) => n.name === 'IDLE').id;
  for (const s of added.filter((x) => x !== s0)) {
    await arrange();
    await page.drag(await settled(`[data-node="${s}"] [data-port="next"]`), await settled(`[data-node="${idle}"]`));
    await page.waitFor((a, b) => window.Silinx.active.asmEditor.getModel().edges.some((e) => e.from === a && e.to === b), [s, idle], { what: `${s} -> IDLE` });
  }
  // the free state S0 is unreachable, and so are the states it leads to: warnings, not errors
  await page.click('.doc:not([hidden]) .asm-btn', { text: '✓ Validate' });
  await page.waitFor(() => /· 7 states · 0 errors/.test(document.querySelector('.doc:not([hidden]) .asm-status')?.textContent || ''), [], { what: 'chart valid' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .asm-problems .asm-prob')].map((li) => [li.className, li.textContent])), [
    ['asm-prob warning link', "▲State 'S0' is unreachable from the initial state"],
    ['asm-prob warning link', "▲State 'S1' is unreachable from the initial state"],
    ['asm-prob warning link', "▲State 'S2' is unreachable from the initial state"],
    ['asm-prob warning link', "▲State 'S3' is unreachable from the initial state"],
  ]);
  const final = await model();
  // its HDL src/ctrl.vhd, generated from it (no Generate HDL any more, #220): every state in it
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .asm-btn')].map((b) => b.textContent))).some((t) => /Generate/.test(t)));
  const states = ['IDLE', 'RUN', 'FINISH', ...final.nodes.filter((n) => added.includes(n.id)).map((n) => n.name)];
  await page.waitFor(async (sts) => { const t = await (await fetch('/api/projects/AsmPj/file?path=src%2Fctrl.vhd')).text(); return sts.every((x) => new RegExp(`\\b${x}\\b`).test(t)); }, [states], { what: 'the HDL follows the chart', timeout: 15000 });
  const vhd = await readWs(env, 'AsmPj', 'src/ctrl.vhd');
  assert.match(vhd, /entity ctrl is/i);
  assert.match(vhd, /case/i);
  const lib = compile([{ path: 'src/ctrl.vhd', lang: 'vhdl', text: vhd }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'ctrl').diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
  const saved = JSON.parse(await readWs(env, 'AsmPj', 'src/ctrl.asm.json'));
  assert.equal(saved.generatedFile, 'src/ctrl.vhd');
  assert.equal(saved.nodes.length, final.nodes.length);
  // the hierarchy shows the chart as the module
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .meta')].some((e) => e.textContent === '(ctrl.asm.json)'));
});

uiTest('ASM chart editor: Zoom / Fit, </> Code and Copy, Reset route / Delete connection, Swap 1 / 0 exits, a case exit\'s ✕, Delete box, # Snap, ↶ ↷ and Edit ▸ Undo / Redo (#195)', E, async (page) => {
  const chart = normalizeModel({
    name: 'ctl', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: false }, encoding: 'binary',
    inputs: [{ name: 'start', width: 1 }, { name: 'op', width: 2 }], outputs: [{ name: 'busy', width: 1, default: '0' }],
    nodes: [
      { id: 's1', type: 'state', name: 'IDLE', x: 200, y: 80, actions: [] },
      { id: 'd1', type: 'decision', x: 200, y: 190, cond: 'start' },
      { id: 's2', type: 'state', name: 'RUN', x: 200, y: 300, actions: ['busy = 1'] },
      { id: 'c1', type: 'case', x: 200, y: 410, expr: 'op' },
      { id: 's3', type: 'state', name: 'DONE', x: 200, y: 540, actions: [] },
    ],
    edges: [
      { id: 'e1', from: 's1', to: 'd1', port: 'next' }, { id: 'e2', from: 'd1', to: 's2', port: 'true' }, { id: 'e3', from: 'd1', to: 's1', port: 'false' },
      { id: 'e4', from: 's2', to: 'c1', port: 'next' }, { id: 'e5', from: 'c1', to: 's3', port: '01' }, { id: 'e6', from: 'c1', to: 's1', port: 'others' },
      { id: 'e7', from: 's3', to: 's1', port: 'next', points: [{ x: 400, y: 540 }, { x: 400, y: 80 }] },
    ],
    initial: 's1',
  });
  await makeProject(env, { name: 'AsmEd', files: { 'src/ctl.asm.json': JSON.stringify(chart, null, 2) } });
  await page.openProject('AsmEd');
  // (the chart gets its HDL file when the project opens: every source has its HDL, #207)
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.asm.json', [], { what: 'the chart linked to its HDL' });
  await page.eval(() => window.SilinxApp.openAsm('src/ctl.asm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctl.asm.json' && document.querySelector('.doc:not([hidden]) [data-node=s3]'), [], { what: 'ASM editor' });
  const D = '.doc:not([hidden])';
  const model = () => page.eval(() => window.Silinx.active.asmEditor.getModel());
  const problems = () => page.eval(() => window.Silinx.active.asmEditor.validate().map((d) => `${d.severity}: ${d.message}`));
  // (Undo / Redo: the main toolbar's buttons, #220)
  const tool = (label) => (/^[↶↷]$/.test(label) ? page.click(`${D} .asm-toolbar .tb-btn[title=${label === '↶' ? 'Undo' : 'Redo'}]`) : page.click(`${D} .asm-toolbar .asm-btn`, { text: label }));
  const side = (label) => page.click(`${D} .asm-selection .asm-btn`, { text: label });
  const edges = async () => (await model()).edges.map((e) => `${e.id}:${e.from}>${e.to}:${e.port}`).join(' ');
  const E0 = 'e1:s1>d1:next e2:d1>s2:true e3:d1>s1:false e4:s2>c1:next e5:c1>s3:01 e6:c1>s1:others e7:s3>s1:next';
  const zoom = () => page.eval((d) => document.querySelector(`${d} .asm-zoom`).textContent, D);
  assert.equal(await edges(), E0);
  assert.deepEqual(await problems(), []);
  // a point on top in a node (boxes may touch), or in the middle of a connection
  const nodeAt = (id) => page.eval((d, i) => {
    const e = document.querySelector(`${d} [data-node="${i}"]`);
    const r = e.getBoundingClientRect();
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.3], [0.3, 0.5], [0.7, 0.5], [0.5, 0.7]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y)?.closest('[data-node]') === e) return { x, y };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, D, id);
  const edgeAt = (id) => page.eval((d, i) => {
    const p = document.querySelector(`${d} [data-edge="${i}"] .asm-edge-hit`);
    const c = p.getScreenCTM(), L = p.getTotalLength();
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const q = p.getPointAtLength(L * f);
      const x = c.a * q.x + c.c * q.y + c.e, y = c.b * q.x + c.d * q.y + c.f;
      if (document.elementFromPoint(x, y)?.closest('[data-edge]')?.dataset.edge === i) return { x, y };
    }
    return null;
  }, D, id);
  const pick = async (what, id) => {
    for (let k = 0; k < 20; k++) {
      const ok = await page.eval((d, w, i) => (w === 'edge' ? !!document.querySelector(`${d} [data-edge="${i}"].sel`) : !!document.querySelector(`${d} [data-node="${i}"].sel`)), D, what, id);
      if (ok) return;
      const p = what === 'edge' ? await edgeAt(id) : await nodeAt(id);
      if (p) await page.click(p);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`${what} ${id} not selected`);
  };

  // ---- Zoom / Fit: the zoom label follows the buttons; Fit gives the fitted zoom back
  await new Promise((r) => setTimeout(r, 300));   // (the fit when it opened)
  await tool('Fit');
  const fitted = await zoom();
  const k = parseFloat(await page.eval((d) => /scale\(([\d.]+)\)/.exec(document.querySelector(`${d} .asm-vp`).getAttribute('transform'))[1], D));
  assert.equal(fitted, `${Math.round(k * 100)}%`);
  await tool('+');
  assert.equal(await zoom(), `${Math.round(k * 120)}%`);
  await tool('−'); await tool('−');
  assert.equal(await zoom(), `${Math.round(k * 100 / 1.2)}%`);
  await tool('Fit');
  assert.equal(await zoom(), fitted);

  // ---- </> Code: the HDL of the chart; Copy puts it on the clipboard; ✕ hides it
  await page.eval(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } }); });
  await tool('</> Code');
  await page.waitForSelector(`${D} .asm-codepanel .asm-code`);
  const code = generate(chart).code;
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-code-title`).textContent, D), 'ctl.vhd');
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-code`).textContent, D), code);
  await page.click(`${D} .asm-codebar .asm-btn`, { text: 'Copy' });
  await page.waitFor(() => window.__copied != null, [], { what: 'code copied' });
  assert.equal(await page.eval(() => window.__copied), code);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-status-msg`).textContent, D), 'Code copied to clipboard');
  await page.click(`${D} .asm-codebar .asm-btn`, { text: '✕' });
  assert.ok(await page.eval((d) => document.querySelector(`${d} .asm-codepanel`).hidden, D));

  // ---- a connection with a route: Reset route, ↶ ↷; Delete connection, Edit ▸ Undo / Redo
  await pick('edge', 'e7');
  await side('Reset route');
  assert.ok(!('points' in (await model()).edges.find((e) => e.id === 'e7')));
  assert.equal(await page.eval((d) => [...document.querySelectorAll(`${d} .asm-selection .asm-btn`)].some((b) => b.textContent === 'Reset route'), D), false, 'no route: no Reset route button (#202)');
  await tool('↶');
  assert.deepEqual((await model()).edges.find((e) => e.id === 'e7').points, [{ x: 400, y: 540 }, { x: 400, y: 80 }]);
  await tool('↷');
  assert.ok(!('points' in (await model()).edges.find((e) => e.id === 'e7')));
  await tool('↶');
  await pick('edge', 'e7');
  await side('Delete connection');
  assert.equal(await edges(), E0.replace(' e7:s3>s1:next', ''));
  assert.deepEqual(await problems(), PROBLEMS_ASM_NO_E7);
  await page.menu('Edit', 'Undo');
  assert.equal(await edges(), E0);
  await page.menu('Edit', 'Redo');
  assert.equal(await edges(), E0.replace(' e7:s3>s1:next', ''));
  await page.menu('Edit', 'Undo');
  assert.deepEqual((await model()).edges.find((e) => e.id === 'e7').points, [{ x: 400, y: 540 }, { x: 400, y: 80 }]);

  // ---- Swap 1 / 0 exits of the decision, and back with ↶
  await pick('node', 'd1');
  await side('Swap 1 / 0 exits');
  assert.equal(await edges(), E0.replace('e2:d1>s2:true e3:d1>s1:false', 'e2:d1>s2:false e3:d1>s1:true'));
  await tool('↶');
  assert.equal(await edges(), E0);

  // ---- the ✕ of a case exit: 01 -> DONE removed (DONE unreachable); ↶ brings it back
  await pick('node', 'c1');
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .asm-case-list .asm-row`)].map((r) => `${r.querySelector('input').value} ${r.querySelector('.asm-muted').textContent}`), D), ['01 → DONE', 'others → IDLE']);
  await page.click(`${D} .asm-case-list .asm-row .asm-btn`, { text: '✕' });
  assert.equal(await edges(), E0.replace(' e5:c1>s3:01', ''));
  assert.deepEqual(await page.eval((d) => document.querySelectorAll(`${d} .asm-case-list .asm-row`).length, D), 1);
  assert.deepEqual(await problems(), PROBLEMS_ASM_NO_E5);
  await tool('↶');
  assert.equal(await edges(), E0);

  // ---- Delete box: DONE and its connections; ↶ / ↷ with the toolbar
  await pick('node', 's3');
  await side('Delete box');
  let m = await model();
  assert.deepEqual([m.nodes.map((n) => n.id), m.edges.map((e) => e.id)], [['s1', 'd1', 's2', 'c1'], ['e1', 'e2', 'e3', 'e4', 'e6']]);
  await tool('↶');
  m = await model();
  assert.deepEqual([m.nodes.map((n) => n.id), m.edges.map((e) => e.id)], [chart.nodes.map((n) => n.id), chart.edges.map((e) => e.id)]);
  await tool('↷');
  assert.equal((await model()).nodes.length, 4);
  await page.menu('Edit', 'Undo');
  assert.deepEqual(await model(), { ...chart, generatedFile: 'src/ctl.vhd' });   // (and the link to its HDL file, #207)

  // ---- # Snap: a box dragged lands on the 20-unit grid; with snapping off, where it is dropped
  const drag = async (id, dx, dy) => {
    const before = (await model()).nodes.find((n) => n.id === id);
    await pick('node', id);
    const p = await nodeAt(id);
    await page.drag(p, { x: p.x + dx, y: p.y + dy });
    await page.waitFor((i, x, y) => { const n = window.Silinx.active.asmEditor.getModel().nodes.find((q) => q.id === i); return n.x !== x || n.y !== y; }, [id, before.x, before.y], { what: `${id} moved` });
    return (await model()).nodes.find((n) => n.id === id);
  };
  assert.ok(await page.eval((d) => [...document.querySelectorAll(`${d} .asm-toolbar .asm-btn`)].find((b) => b.textContent === '# Snap').classList.contains('on'), D));
  let n = await drag('s3', 47, 0);
  assert.deepEqual([n.x % 20, n.y], [0, 540]);
  await tool('# Snap');
  assert.ok(!await page.eval((d) => [...document.querySelectorAll(`${d} .asm-toolbar .asm-btn`)].find((b) => b.textContent === '# Snap').classList.contains('on'), D));
  const x1 = n.x;
  n = await drag('s3', 7, 0);
  assert.ok(n.x % 20 !== 0 && n.x > x1 && n.x < x1 + 20, `x = ${n.x}`);
  assert.equal(n.y, 540);
  // saved as edited
  await page.waitFor(async (x) => (await (await fetch('/api/projects/AsmEd/file?path=src%2Fctl.asm.json')).json()).nodes.find((q) => q.id === 's3').x === x, [n.x], { what: 'saved', timeout: 15000 });
  assert.deepEqual(JSON.parse(await readWs(env, 'AsmEd', 'src/ctl.asm.json')), await model());
});

uiTest('print preview of a diagram: File ▸ Print… dialog, Save SVG, Print… opens the print page', E, async (page) => {
  await makeProject(env, { name: 'PrintPj', template: 'blinky' });
  await page.openProject('PrintPj');
  await page.eval(() => window.SilinxApp.openAsm('src/speed_ctrl.asm.json'));
  await page.waitFor(() => window.Silinx.active?.asmEditor && document.querySelector('.doc:not([hidden]) [data-node]'));
  await page.menu('File', 'Print…');
  await page.waitDialog('Print — ASM chart speed_ctrl');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /\d+ pages? \(\d+ across × \d+ down\), A4 (landscape|portrait)/);
  // two pages across: the page count follows
  await page.eval(() => { const i = document.querySelector('.dlg-overlay input[type=number]'); i.value = '2'; i.dispatchEvent(new Event('input')); });
  await page.waitFor(() => /\(2 across/.test(document.querySelector('.dlg-overlay').innerText));
  await page.dialogButton('Save SVG');
  const svgFile = await waitDownload(page, 'speed_ctrl_asm.svg');
  const fs = await import('node:fs/promises');
  assert.match(await fs.readFile(svgFile, 'utf8'), /^<svg[\s\S]*IDLE[\s\S]*<\/svg>\s*$/);
  // Print…: a new page with the drawing (Ctrl+P does the same)
  await page.send('Target.setDiscoverTargets', { discover: true }).catch(() => {});
  const pages = async () => (await env.cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page' && t.browserContextId === page.contextId);
  const before = (await pages()).length;
  await page.key('p', { modifiers: 2 });
  await page.waitDialog('Print — ASM chart speed_ctrl');
  await page.dialogButton('Print…');
  await page.waitNoDialog();
  const t0 = Date.now();
  let opened = false;
  while (Date.now() - t0 < 5000 && !opened) {
    opened = (await pages()).length > before || await page.eval(() => !!document.querySelector('iframe'));
    if (!opened) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(opened, 'the print page was opened');
}, { skip: chromeOnly });   // (the new page is found with Target.getTargets)

// #303: a schematic that cannot generate its HDL any more (two constants on the net of an output: two
// drivers), its HDL file as it was: Check Syntax, and so the simulation, stop on that file instead of
// running the old HDL silently; once the schematic is fixed, its HDL generated again, they run
uiTest('#303 a schematic with two drivers on a net: its old HDL file is not simulated (Check Syntax and Simulate stop and say why); fixed, they run', E, async (page) => {
  const { newDoc, normalizeDoc, symbolPins } = await import('../../core/schdoc.js');
  const doc = newDoc('s', 'vhdl');
  doc.generatedFile = 'src/s.vhd';
  doc.symbols.push({ id: 'S1', type: 'constant', x: 100, y: 100, rot: 0, mirror: false, name: 'U1', params: { value: '1', width: 1 } },
    { id: 'S2', type: 'constant', x: 100, y: 200, rot: 0, mirror: false, name: 'U2', params: { value: '0', width: 1 } });
  const out = (id) => symbolPins(normalizeDoc({ ...doc, symbols: [doc.symbols.find((s) => s.id === id)] }).symbols[0]).find((p) => p.name === 'O');
  const o1 = out('S1'), o2 = out('S2');
  doc.ports.push({ id: 'P1', name: 'y', dir: 'out', width: 1, x: o1.x + 60, y: o1.y });
  doc.wires.push({ id: 'W1', points: [o1, { x: o1.x + 60, y: o1.y }] }, { id: 'W2', points: [o2, { x: o1.x + 30, y: o2.y }, { x: o1.x + 30, y: o1.y }] });
  const OLD = "library ieee;\nuse ieee.std_logic_1164.all;\nentity s is\n  port (y : out std_logic);\nend s;\narchitecture rtl of s is\nbegin\n  y <= '1';\nend rtl;\n";
  await makeProject(env, { name: 'StaleSch', files: { 'src/s.vhd': OLD, 'src/s.sch.json': JSON.stringify(doc) }, top: 's' });
  await page.openProject('StaleSch');
  const run = async (proc, re) => {
    const before = (await page.consoleText()).length;
    await page.treeRow('#procs', proc, { dbl: true, exact: true });
    await page.waitFor((b, r) => new RegExp(r).test(document.getElementById('console-log').innerText.slice(b)), [before, re.source], { what: proc, timeout: 60000 });
    return (await page.consoleText()).slice(before);
  };
  const WHY = "src/s.vhd is not up to date: src/s.sch.json cannot generate it, it has errors: net 'y' has 2 drivers (U1.O, U2.O). Fix src/s.sch.json (its HDL is then generated again).";
  await page.treeRow('#hier', 's');
  let log = await run('Check Syntax', /Process "Check Syntax" (failed|completed)/);
  assert.ok(log.includes(`ERROR:Silinx - "src/s.vhd" Line 1: ${WHY}`), log);
  assert.match(log, /Process "Check Syntax" failed \(1 error\(s\)/);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent), '(1)');
  // the simulation: stopped by its Check Syntax, not run on the old HDL
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 's');
  log = await run('Simulate Behavioral Model', /Process "Check Syntax" failed|Launching ISim/);
  assert.ok(log.includes(WHY), log);
  assert.doesNotMatch(log, /Launching ISim/);
  // fixed in the editor (U2 deleted): its HDL generated again, the check passes
  await page.click('input[name=view][value=impl]');
  await page.eval(() => window.SilinxApp.openSch('src/s.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/s.sch.json' && document.querySelector('.doc:not([hidden]) g.sym[data-id="S2"]'), [], { what: 'schematic editor' });
  await page.click('.doc:not([hidden]) g.sym[data-id="S2"] .hitbox, .doc:not([hidden]) g.sym[data-id="S2"]');
  await page.key('Delete');
  await page.waitFor(async () => !/<= '0'/.test(await (await fetch('/api/projects/StaleSch/file?path=src%2Fs.vhd')).text()) && /Generated by Silinx/.test(await (await fetch('/api/projects/StaleSch/file?path=src%2Fs.vhd')).text()), [], { what: 'the HDL generated again', timeout: 15000 });
  await page.treeRow('#hier', 's');
  log = await run('Check Syntax', /Process "Check Syntax" (failed|completed)/);
  assert.match(log, /Process "Check Syntax" completed successfully/, log);
  assert.ok(!log.includes('is not up to date'), log);
});

// #332: the palette's Project modules are the design modules, not the test benches (a Simulation-only source, a
// module without ports)
uiTest('#332 schematic palette: Project modules lists the design modules, no test bench (Simulation-only, or without ports)', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  const vhd = (n) => `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity ${n} is\n  port (a : in std_logic; y : out std_logic);\nend ${n};\n\narchitecture rtl of ${n} is\nbegin\n  y <= not a;\nend rtl;\n`;
  const tbv = (n) => `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity ${n} is\nend ${n};\n\narchitecture sim of ${n} is\n  signal a, y : std_logic := '0';\nbegin\n  uut : entity work.inv1 port map (a => a, y => y);\n  a <= '1' after 10 ns;\nend sim;\n`;
  await makeProject(env, {
    name: 'SchTb', top: '',
    files: { 'src/inv1.vhd': vhd('inv1'), 'src/buf_sim.vhd': vhd('buf_sim'), 'src/inv1_tb.vhd': tbv('inv1_tb'), 'src/all_tb.vhd': tbv('all_tb'), 'src/p.sch.json': JSON.stringify(newDoc('p', 'vhdl')) },
    roles: { 'src/inv1_tb.vhd': 'sim', 'src/buf_sim.vhd': 'sim' },
  });
  await page.openProject('SchTb');
  await page.eval(() => window.SilinxApp.openSch('src/p.sch.json'));
  const D = '.doc:not([hidden])';
  await page.waitFor((d) => window.Silinx.active?.id === 'sch:src/p.sch.json' && document.querySelector(`${d} .se-symrow`), [D], { what: 'schematic editor' });
  await page.fill(`${D} .se-cat`, 'Project modules');
  await page.waitFor((d) => [...document.querySelectorAll(`${d} .se-symrow .nm`)].some((e) => e.textContent === 'inv1'), [D], { what: 'the project modules' });
  // inv1_tb (Simulation), all_tb (All, no ports) and buf_sim (a Simulation-only module) are not offered
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .se-symrow .nm`)].map((e) => e.textContent), D), ['inv1']);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .se-cathead`).textContent, D), 'Project modules (1)');
  assert.deepEqual(page.dialogs, []);
});
