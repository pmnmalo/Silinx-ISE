// UI: live schematic simulation — Simulate in the schematic editor, click inputs, watch the wires and
// outputs change, step a clock and see a flip-flop store the value, edit a bus value, module symbol pins,
// Portuguese labels, Esc back to editing.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const HALF = 'library ieee; use ieee.std_logic_1164.all;\nentity half is port (x, y : in std_logic; s, c : out std_logic); end;\narchitecture a of half is begin s <= x xor y; c <= x and y; end;\n';
const MODULES = { half: { name: 'half', lang: 'vhdl', ports: [{ name: 'x', dir: 'in', width: 1 }, { name: 'y', dir: 'in', width: 1 }, { name: 's', dir: 'out', width: 1 }, { name: 'c', dir: 'out', width: 1 }] } };

// an AND gate, a D flip-flop, a 4-bit adder and an instance of the 'half' module, each with I/O markers
function schematic() {
  const doc = newDoc('live', 'vhdl');
  let wid = 0;
  const sym = (type, x, y, params = {}, name) => { const s = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: name || `U${doc.symbols.length + 1}`, params }; doc.symbols.push(s); return s; };
  const pin = (s, n) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], MODULES).find((q) => q.name === n);
  const io = (s, n, name, dir, width = 1) => {
    const p = pin(s, n), at = { x: p.x + (dir === 'in' ? -60 : 60), y: p.y };
    doc.ports.push({ id: `P${doc.ports.length + 1}`, name, dir, width, x: at.x, y: at.y });
    doc.wires.push({ id: `W${++wid}`, points: [at, { x: p.x, y: p.y }] });
  };
  const g = sym('and2', 300, 100);
  io(g, 'I0', 'a', 'in'); io(g, 'I1', 'b', 'in'); io(g, 'O', 'y', 'out');
  const ff = sym('fd', 300, 250);
  io(ff, 'D', 'd', 'in'); io(ff, 'C', 'clk', 'in'); io(ff, 'Q', 'q', 'out');
  const ad = sym('add', 300, 400, { width: 4 });
  io(ad, 'A', 'p', 'in', 4); io(ad, 'B', 'n', 'in', 4); io(ad, 'S', 'r', 'out', 4);
  const m = sym('module', 300, 560, { module: 'half', generics: {} }, 'u_half');
  io(m, 'x', 'x1', 'in'); io(m, 'y', 'x2', 'in'); io(m, 's', 'sum', 'out');
  return doc;
}

const ED = '.doc:not([hidden]) .sch-editor';
const portId = (doc, name) => doc.ports.find((p) => p.name === name).id;
// class of the wire drawn from an I/O marker (its value level)
const wireLevel = (page, wireId) => page.eval((sel, id) => [...document.querySelector(`${sel} g.wire[data-id="${id}"]`).classList].find((c) => c.startsWith('lv-')) || null, ED, wireId);

uiTest('live schematic simulation: toggle inputs, wire colours, outputs, clock step, bus editor, module pins, Esc', E, async (page) => {
  const doc = schematic();
  await makeProject(env, { name: 'LivePj', files: { 'src/half.vhd': HALF, 'src/live.sch.json': JSON.stringify(doc) } });
  await page.openProject('LivePj');
  await page.eval(() => window.SilinxApp.openSch('src/live.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/live.sch.json' && document.querySelector(`${sel} .se-btn[data-act=sim]`), [ED]);
  // Simulate
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel)?.classList.contains('sim-mode') && document.querySelector(`${sel} .se-simlayer .lv-ctl`), [ED], { what: 'simulation mode' });
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.simulating), true);
  // the wire of input a is low (dark green), the output y LED is off
  const wA = 'W1', wY = 'W3';
  assert.equal(await wireLevel(page, wA), 'lv-0');
  assert.equal(await wireLevel(page, wY), 'lv-0');
  const ledY = `${ED} .se-simlayer .lv-out[data-port="${portId(doc, 'y')}"]`;
  assert.ok(await page.eval((s) => document.querySelector(s).classList.contains('lv-0'), ledY));
  // click the switches of a and b: the wires turn bright green, y lights up
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'a')}"]`);
  await page.waitFor((sel, id) => document.querySelector(`${sel} g.wire[data-id="${id}"]`).classList.contains('lv-1'), [ED, wA], { what: 'wire a = 1' });
  assert.equal(await wireLevel(page, wY), 'lv-0');
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'b')}"]`);
  await page.waitFor((s) => document.querySelector(s).classList.contains('lv-1'), [ledY], { what: 'y = 1' });
  assert.equal(await wireLevel(page, wY), 'lv-1');
  // the sheet is read-only: Delete does nothing, the palette is disabled
  await page.key('Delete');
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols.length), 4);
  // the flip-flop: clk is a clock (step control), d = 1, one step -> q = 1, the FD shows its stored value
  const ledQ = `${ED} .se-simlayer .lv-out[data-port="${portId(doc, 'q')}"]`;
  assert.ok(await page.eval((sel, id) => !!document.querySelector(`${sel} .lv-clk[data-port="${id}"]`), ED, portId(doc, 'clk')), 'clk drawn as a clock control');
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'd')}"]`);
  await page.waitFor((sel, id) => document.querySelector(`${sel} g.wire[data-id="${id}"]`).classList.contains('lv-1'), [ED, 'W4'], { what: 'd = 1' });
  assert.ok(await page.eval((s) => document.querySelector(s).classList.contains('lv-0'), ledQ), 'q still 0 before the clock');
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .lv-store .lv-val`)?.textContent, ED), '0');
  await page.click(`${ED} .se-simbar .lv-step`);
  await page.waitFor((s) => document.querySelector(s).classList.contains('lv-1'), [ledQ], { what: 'q = 1 after one clock step' });
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .lv-store .lv-val`).textContent, ED), '1');
  assert.match(await page.eval((sel) => document.querySelector(`${sel} .lv-time`).textContent, ED), /^t = /);
  // the bus adder: click the value of p, type 5, Enter; n = 0x3 with +1 three times; r = 8
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'p')}"]`);
  await page.waitFor(() => document.activeElement?.matches('.lv-edit-in'), [], { what: 'bus editor focused' });
  await page.eval(() => { document.activeElement.value = ''; });
  await page.type('5');
  await page.key('Enter');
  await page.waitFor((sel) => !document.querySelector(`${sel} .lv-editor`), [ED]);
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'n')}"]`);
  for (let i = 0; i < 3; i++) await page.click(`${ED} .lv-editor .btn`, { text: '+1' });
  await page.click(`${ED} .lv-editor .lv-x`);
  const rVal = `${ED} .se-simlayer .lv-out[data-port="${portId(doc, 'r')}"] .lv-val`;
  await page.waitFor((s) => document.querySelector(s)?.textContent === '8', [rVal], { what: 'r = 5 + 3' });
  // bus values on the wires
  assert.ok(await page.eval((sel) => [...document.querySelectorAll(`${sel} .lv-busval`)].some((t) => t.textContent === '5'), ED));
  // the module instance: its inputs drive its output; clicking it lists the pin values
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'x1')}"]`);
  const ledSum = `${ED} .se-simlayer .lv-out[data-port="${portId(doc, 'sum')}"]`;
  await page.waitFor((s) => document.querySelector(s).classList.contains('lv-1'), [ledSum], { what: 'sum = 1' });
  // the whole sheet in view (the simulation bar made the canvas shorter): Zoom to Full View
  await page.click(`${ED} .se-btn[data-act="fit"]`);
  await page.click(`${ED} g.sym[data-id="S4"] .hitbox`);
  await page.waitFor((sel) => document.querySelectorAll(`${sel} .lv-ports tr`).length === 4, [ED], { what: 'instance pin table' });
  assert.deepEqual(await page.eval((sel) => [...document.querySelectorAll(`${sel} .lv-ports tr`)].map((r) => [...r.cells].map((c) => c.textContent).join(' ')), ED), ['x in 1', 'y in 0', 's out 1', 'c out 0']);
  // hovering a wire shows its value
  const mid = await page.eval((sel) => { const b = document.querySelector(`${sel} g.wire[data-id="W1"] .wline`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, ED);
  await page.hover(mid);
  await page.waitFor((sel) => /^a = 1/.test(document.querySelector(`${sel} .lv-tip`)?.textContent || ''), [ED], { what: 'hover tooltip' });
  // Run the clock at 1 kHz: time advances on its own until Pause
  await page.fill(`${ED} .se-simbar .lv-rate`, '1000');
  const now = () => page.eval(() => window.Silinx.active.schEditor.liveSim.now);
  const t0 = await now();
  await page.click(`${ED} .se-simbar .lv-run`);
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .se-simbar .lv-run`).textContent, ED), 'Pause');
  await page.waitFor((t) => window.Silinx.active.schEditor.liveSim.now > t + 20 * 100000, [t0], { what: 'clock running' });
  await page.click(`${ED} .se-simbar .lv-run`);
  const t1 = await now();
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await now(), t1, 'paused');
  // Reset (power cycle): q back to its INIT value 0, the switches keep their positions
  await page.click(`${ED} .se-simbar .lv-reset`);
  await page.waitFor((s) => document.querySelector(s).classList.contains('lv-0'), [ledQ], { what: 'q = 0 after reset' });  assert.ok(await page.eval((s) => document.querySelector(s).classList.contains('lv-1'), ledY));
  // in Portuguese: no untranslated label in the simulation strip and panels
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const texts = () => page.eval((sel) => ['.se-simbar', '.se-props', '.se-status', '[data-act=sim]'].flatMap((p) => window.__uiTexts(document.querySelector(`${sel} ${p}`))), ED);
  const en = await texts();
  await setLang('pt');
  const pt = await texts();
  await setLang('en');
  assert.ok(en.includes('Stop Simulation') && pt.includes('Parar Simulação'));
  assert.ok(en.includes('Simulate') && pt.includes('Simular'));
  assert.deepEqual(untranslated(en, pt, [/^@?(Hex|Decimal|Reset)$/, /symbols?, \d+ nets/]), []);
  // Esc leaves the simulation: wires back to normal, editing possible again
  await page.click(`${ED} .se-canvas`, { });
  await page.key('Escape');
  await page.waitFor((sel) => !document.querySelector(sel).classList.contains('sim-mode'), [ED], { what: 'simulation left' });
  assert.equal(await wireLevel(page, wA), null);
  assert.equal(await page.eval((sel) => document.querySelectorAll(`${sel} .se-simlayer *`).length, ED), 0);
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.simulating), false);
});

uiTest('live schematic simulation is refused with the errors listed (two drivers on a net)', E, async (page) => {
  const doc = newDoc('bad', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: {} }, { id: 'S2', type: 'inv', x: 200, y: 200, rot: 0, mirror: false, name: 'U2', params: {} });
  const pins = doc.symbols.map((s) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]));
  const o1 = pins[0].find((p) => p.name === 'O'), o2 = pins[1].find((p) => p.name === 'O');
  doc.wires.push({ id: 'W1', points: [{ x: o1.x, y: o1.y }, { x: o1.x + 30, y: o1.y }, { x: o1.x + 30, y: o2.y }, { x: o2.x, y: o2.y }] });
  await makeProject(env, { name: 'BadPj', files: { 'src/bad.sch.json': JSON.stringify(doc) } });
  await page.openProject('BadPj');
  await page.eval(() => window.SilinxApp.openSch('src/bad.sch.json'));
  await page.waitFor((sel) => document.querySelector(`${sel} .se-btn[data-act=sim]`), [ED]);
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => { const d = document.querySelector(`${sel} .se-diags`); return d && !d.hidden && /Simulation refused/.test(d.textContent); }, [ED], { what: 'refusal listed' });
  assert.match(await page.eval((sel) => document.querySelector(`${sel} .se-diags`).textContent, ED), /2 drivers/);
  assert.equal(await page.eval((sel) => document.querySelector(sel).classList.contains('sim-mode'), ED), false);
});
