// UI: the parts of the schematic's Try it (#405: out of liveController in web/js/sch-live.js): the inputs
// (sch-live-inputs.js: a bus's value editor, its header, a bad value refused, the radix, +1, 0, Set, Escape; a clock's
// Run and Pause, Step stopping it) and the panel (sch-live-instance.js: its title and notes, a module instance's pins);
// the inputs' values kept from one Try it to the next, Reset setting them back (#2106).
// The whole Try it: test/ui/livesim.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
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

uiTest('#405 Try it parts: the bus value editor, the clock\'s Run and Pause, the panel and a module instance\'s pins', E, async (page) => {
  const doc = schematic();
  await makeProject(env, { name: 'LiveParts', files: { 'src/half.vhd': HALF, 'src/live.sch.json': JSON.stringify(doc) } });
  await page.openProject('LiveParts');
  await page.eval(() => window.SilinxApp.openSch('src/live.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/live.sch.json' && document.querySelector(`${sel} .se-btn[data-act=sim]`), [ED]);
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(`${sel} .se-simlayer .lv-ctl`), [ED], { what: 'Try it' });
  const ev = (fn, ...a) => page.eval(fn, ED, ...a);
  // ---- the panel: its title and notes; no instance yet
  assert.equal(await ev((sel) => document.querySelector(`${sel} .se-props .se-ptitle`).textContent), 'Trying it out');
  assert.match(await ev((sel) => document.querySelector(`${sel} .se-props .se-note`).textContent), /^Click an input to change it: 1-bit inputs toggle/);
  assert.equal(await ev((sel) => document.querySelector(`${sel} .lv-inst`).innerHTML), '');
  // ---- the bus editor of p (4 bits): its header, a bad value refused, the radix, +1, 0, Set
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'p')}"]`);
  await page.waitFor(() => document.activeElement?.matches('.lv-edit-in'), [], { what: 'bus editor focused' });
  assert.equal(await ev((sel) => document.querySelector(`${sel} .lv-editor .lv-edit-head`).textContent), 'p (4 bits)×');
  assert.deepEqual(await ev((sel) => [...document.querySelectorAll(`${sel} .lv-editor .btn`)].map((b) => b.textContent)), ['−1', '+1', '0', 'Set']);
  await page.eval(() => { document.activeElement.value = 'zz'; });
  await page.key('Enter');
  assert.deepEqual(await ev((sel) => [!!document.querySelector(`${sel} .lv-editor`), document.querySelector(`${sel} .lv-edit-in`).classList.contains('bad')]), [true, true]);
  await page.eval(() => { document.activeElement.value = '0x5'; });
  await page.click(`${ED} .lv-editor .btn`, { text: '+1' });
  const field = () => ev((sel) => document.querySelector(`${sel} .lv-edit-in`).value);
  assert.equal(await field(), '1');
  await page.eval((sel) => { const s = document.querySelector(`${sel} .lv-editor select`); s.value = 'bin'; s.dispatchEvent(new Event('change')); }, ED);
  assert.equal(await field(), '0001');
  await page.click(`${ED} .lv-editor .btn`, { text: '0' });
  assert.equal(await field(), '0000');
  await page.eval((sel) => { document.querySelector(`${sel} .lv-edit-in`).value = '0110'; }, ED);
  await page.click(`${ED} .lv-editor .btn`, { text: 'Set' });
  await page.waitFor((sel) => !document.querySelector(`${sel} .lv-editor`), [ED], { what: 'the editor closed' });
  const rVal = `${ED} .se-simlayer .lv-out[data-port="${portId(doc, 'r')}"] .lv-val`;
  await page.waitFor((s) => document.querySelector(s)?.textContent === '6', [rVal], { what: 'r = 6 + 0' });
  // Escape closes it, the value kept
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'p')}"]`);
  await page.waitFor(() => document.activeElement?.matches('.lv-edit-in'), [], { what: 'bus editor again' });
  await page.key('Escape');
  await page.waitFor((sel) => !document.querySelector(`${sel} .lv-editor`), [ED], { what: 'closed by Escape' });
  assert.equal(await page.eval((s) => document.querySelector(s).textContent, rVal), '6');
  // ---- the bus values' readings (#2015): the bar's formats, a bus's bits and their value (#2064); p typed as -1 in one's
  // complement, r read so
  assert.deepEqual(await ev((sel) => [...document.querySelectorAll(`${sel} .lv-radix option`)].map((o) => o.textContent)),
    ['Hex', 'Binary', 'Binary (Unsigned)', "Binary (Two's Complement)", "Binary (One's Complement)"]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual(await ev((sel) => [...document.querySelectorAll(`${sel} .lv-radix option`)].slice(2).map((o) => o.textContent)),
    ['Binário (sem sinal)', 'Binário (complemento para 2)', 'Binário (complemento para 1)']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.eval((sel) => { const s = document.querySelector(`${sel} .lv-radix`); s.value = 'c1dec'; s.dispatchEvent(new Event('change')); }, ED);
  await page.click(`${ED} .lv-ctl[data-port="${portId(doc, 'p')}"]`);
  await page.waitFor(() => document.activeElement?.matches('.lv-edit-in'), [], { what: 'bus editor, one\'s complement' });
  assert.equal(await ev((sel) => document.querySelector(`${sel} .lv-editor select`).value), 'c1dec');
  await page.eval((sel) => { document.querySelector(`${sel} .lv-edit-in`).value = '-1'; }, ED);
  await page.click(`${ED} .lv-editor .btn`, { text: 'Set' });
  await page.waitFor((s) => document.querySelector(s)?.textContent === '1110 = -1', [rVal], { what: 'r = 1110, -1 in one\'s complement' });
  await page.eval((sel) => { const s = document.querySelector(`${sel} .lv-radix`); s.value = 'sdec'; s.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor((s) => document.querySelector(s)?.textContent === '1110 = -2', [rVal], { what: 'r = 1110, -2 in two\'s complement' });
  await page.eval((sel) => { const s = document.querySelector(`${sel} .lv-radix`); s.value = 'dec'; s.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor((s) => document.querySelector(s)?.textContent === '1110 = 14', [rVal], { what: 'r = 1110, 14 unsigned' });
  await page.eval((sel) => { const s = document.querySelector(`${sel} .lv-radix`); s.value = 'hex'; s.dispatchEvent(new Event('change')); }, ED);
  // ---- the clock: Run (Pause shown, on), Step stops it
  const run = `${ED} .se-simbar .lv-run`;
  const runState = () => page.eval((s) => [document.querySelector(s).textContent, document.querySelector(s).classList.contains('on')], run);
  assert.deepEqual(await runState(), ['Run', false]);
  await page.click(run);
  assert.deepEqual(await runState(), ['Pause', true]);
  await page.click(run);
  assert.deepEqual(await runState(), ['Run', false]);
  await page.click(run);
  await page.click(`${ED} .se-simbar .lv-step`);
  assert.deepEqual(await runState(), ['Run', false]);
  // ---- a module instance clicked: its pins in the panel
  await page.click(`${ED} .se-btn[data-act="fit"]`);
  await page.click(`${ED} g.sym[data-id="S4"] .hitbox`);
  await page.waitFor((sel) => document.querySelectorAll(`${sel} .lv-ports tr`).length === 4, [ED], { what: 'instance pin table' });
  assert.equal(await ev((sel) => document.querySelector(`${sel} .lv-inst .se-ptitle`).textContent), 'u_half : half');
  assert.deepEqual(await ev((sel) => [...document.querySelectorAll(`${sel} .lv-ports tr`)].map((r) => [...r.cells].map((c) => c.textContent).join(' '))), ['x in 0', 'y in 0', 's out 0', 'c out 0']);
});

uiTest('#2106 Try it keeps the inputs\' values of the last Try it; Reset sets them back to 0; a marker removed in between', E, async (page) => {
  const doc = schematic();
  await makeProject(env, { name: 'LiveKeep', files: { 'src/half.vhd': HALF, 'src/live.sch.json': JSON.stringify(doc) } });
  await page.openProject('LiveKeep');
  await page.eval(() => window.SilinxApp.openSch('src/live.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/live.sch.json' && document.querySelector(`${sel} .se-btn[data-act=sim]`), [ED]);
  const tryIt = async () => {
    await page.click(`${ED} .se-btn[data-act=sim]`);
    await page.waitFor((sel) => document.querySelector(`${sel} .se-simlayer .lv-ctl`), [ED], { what: 'Try it' });
  };
  const stop = async () => {
    await page.click(`${ED} .se-simbar .lv-exit`);
    await page.waitFor((sel) => !document.querySelector(`${sel} .se-simlayer .lv-ctl`), [ED], { what: 'Try it stopped' });
  };
  const ctl = (n) => `${ED} .se-simlayer .lv-ctl[data-port="${portId(doc, n)}"]`;
  const out = (n) => `${ED} .se-simlayer .lv-out[data-port="${portId(doc, n)}"]`;
  // the switches' and the buses' values, the output y's level and r's value
  const state = () => page.eval((sel, ids) => {
    const q = (id, c) => document.querySelector(`${sel} .se-simlayer [data-port="${id}"]${c}`);
    return {
      a: q(ids.a, '.lv-ctl').classList.contains('lv-1'), b: q(ids.b, '.lv-ctl').classList.contains('lv-1'),
      p: q(ids.p, '.lv-ctl .lv-val').textContent, n: q(ids.n, '.lv-ctl .lv-val').textContent,
      y: q(ids.y, '.lv-out').classList.contains('lv-1'), r: q(ids.r, '.lv-out .lv-val').textContent,
    };
  }, ED, Object.fromEntries(['a', 'b', 'p', 'n', 'y', 'r'].map((n) => [n, portId(doc, n)])));
  await tryIt();
  assert.deepEqual(await state(), { a: false, b: false, p: '0', n: '0', y: false, r: '0' });
  // a, b on; p = 5 (typed), n = 2
  await page.click(ctl('a'));
  await page.click(ctl('b'));
  for (const [n, v] of [['p', '5'], ['n', '2']]) {
    await page.click(ctl(n));
    await page.waitFor(() => document.activeElement?.matches('.lv-edit-in'), [], { what: `${n}'s editor` });
    await page.eval((x) => { document.activeElement.value = x; }, v);
    await page.key('Enter');
    await page.waitFor((sel) => !document.querySelector(`${sel} .lv-editor`), [ED], { what: 'the editor closed' });
  }
  const set = { a: true, b: true, p: '5', n: '2', y: true, r: '7' };
  assert.deepEqual(await state(), set);
  // stop Try it, start it again: the same values, the circuit on them
  await stop();
  await tryIt();
  assert.deepEqual(await state(), set);
  assert.equal(await page.eval((id) => String(window.Silinx.active.schEditor.liveSim.input(id).value), portId(doc, 'p')), '5');
  // Reset: the inputs back to their initial values
  await page.click(`${ED} .se-simbar .lv-reset`);
  await page.waitFor((s) => document.querySelector(s)?.textContent === '0', [`${out('r')} .lv-val`], { what: 'r = 0 after Reset' });
  assert.deepEqual(await state(), { a: false, b: false, p: '0', n: '0', y: false, r: '0' });
  // and so they stay in the next Try it
  await stop();
  await tryIt();
  assert.deepEqual(await state(), { a: false, b: false, p: '0', n: '0', y: false, r: '0' });
  // a set again, then its marker removed between two Try its: no error, the others kept
  await page.click(ctl('a'));
  await page.click(ctl('n'));
  await page.waitFor(() => document.activeElement?.matches('.lv-edit-in'), [], { what: 'n\'s editor' });
  await page.eval(() => { document.activeElement.value = '3'; });
  await page.key('Enter');
  await stop();
  await page.click(`${ED} g.port[data-id="${portId(doc, 'a')}"] .iomark`);
  await page.key('Delete');
  await page.waitFor((sel, id) => !document.querySelector(`${sel} g.port[data-id="${id}"]`), [ED, portId(doc, 'a')], { what: 'marker a removed' });
  await tryIt();
  assert.equal(await page.eval((sel, id) => document.querySelector(`${sel} .se-simlayer [data-port="${id}"]`), ED, portId(doc, 'a')), null);
  assert.equal(await page.eval((s) => document.querySelector(s).textContent, `${ctl('n')} .lv-val`), '3');
  assert.equal(await page.eval((s) => document.querySelector(s).hidden, `${ED} .se-simbar .lv-err`), true, 'no error');
  assert.deepEqual(page.errors, []);
  await stop();
});
