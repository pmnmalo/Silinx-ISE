// UI: the schematic of a truth table simulated in place (#946). The view is read-only (generated from the
// table), but read-only blocks editing the drawing, not simulating it: its Simulate button, the inputs
// switches, the outputs those of the table for every input combination, every net 0 or 1; the drawing still
// not editable (no editing tools, Delete and Ctrl+V do nothing, during the simulation and after it); a change
// of the table stops the simulation; a read-only view without the option (the RTL schematic) has no Simulate.
// In the Silinx and ISE style interfaces, the Tasks interface, and Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a full adder and a majority-of-three with a don't care: inputs a (MSB), b, cin; row r = the bits of r
const ADDER = { version: 1, name: 'fadd', inputs: ['a', 'b', 'cin'], outputs: ['s', 'co', 'm'],
  table: { s: '01101001', co: '00010111', m: '0001X111' }, form: 'sop', lang: 'vhdl' };
const ED = '.doc:not([hidden]) .sch-editor';
const DEV = { commit: 'abc1234', date: '2026-10-22 12:00' };

async function openTtSch(page, pj) {
  await page.openProject(pj);
  await page.eval(() => window.SilinxApp.openTtSchematic('src/fadd.tt.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'ttsch:src/fadd.tt.json' && window.Silinx.active.viewer && document.querySelector(`${sel} .se-btn[data-act=sim]`), [ED], { what: 'the schematic of the table' });
}
const shown = (page, s) => page.eval((x) => { const el = document.querySelector(x); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; }, s);
const viewerDoc = (page) => page.eval(() => window.Silinx.active.viewer.getDoc());

/** Simulate; every input combination set with the switches: each output's LED the table's value (a don't care
 *  either), every wire 0 or 1; Esc back to the view. */
async function simulateTable(page) {
  const doc = await viewerDoc(page);
  const port = (n) => doc.ports.find((p) => p.name === n).id;
  assert.ok(await shown(page, `${ED} .se-btn[data-act=sim]`), 'Try it shown');
  for (const act of ['wire', 'net', 'io', 'rotate', 'mirror', 'delete', 'beautify', 'undo', 'redo']) assert.ok(!(await shown(page, `${ED} [data-act=${act}]`)), `${act} hidden`);
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel)?.classList.contains('sim-mode') && document.querySelector(`${sel} .se-simlayer .lv-sw`), [ED], { what: 'simulation mode' });
  assert.equal(await page.eval(() => window.Silinx.active.viewer.simulating), true);
  assert.equal(await page.eval((sel) => document.querySelectorAll(`${sel} .se-simlayer .lv-sw`).length, ED), 3, 'three switches');
  const level = (id) => page.eval((sel, p) => [...document.querySelector(`${sel} .se-simlayer [data-port="${p}"]`).classList].find((c) => /^lv-[01xzn]$/.test(c)), ED, id);
  const cur = { a: 0, b: 0, cin: 0 };
  for (let r = 0; r < 8; r++) {
    const want = { a: (r >> 2) & 1, b: (r >> 1) & 1, cin: r & 1 };
    for (const n of ADDER.inputs) {
      if (cur[n] === want[n]) continue;
      await page.click(`${ED} .lv-ctl[data-port="${port(n)}"]`);
      await page.waitFor((sel, p, v) => document.querySelector(`${sel} .se-simlayer [data-port="${p}"]`).classList.contains(`lv-${v}`), [ED, port(n), want[n]], { what: `${n} = ${want[n]}` });
      cur[n] = want[n];
    }
    for (const o of ADDER.outputs) {
      const t = ADDER.table[o][r];
      const v = await level(port(o));
      assert.ok(t === 'X' ? /^lv-[01]$/.test(v) : v === `lv-${t}`, `row ${r}: ${o} = ${v}, the table ${t}`);
    }
    const wires = await page.eval((sel) => [...document.querySelectorAll(`${sel} g.wire`)].map((w) => [...w.classList].find((c) => c.startsWith('lv-')) || 'none'), ED);
    assert.ok(wires.length > 0 && wires.every((c) => c === 'lv-0' || c === 'lv-1'), `row ${r}: the nets ${wires.join()}`);
  }
  // the drawing is not edited by the simulation: Delete, Ctrl+A Delete, Ctrl+V
  const before = JSON.stringify(doc);
  await page.key('Delete');
  assert.equal(JSON.stringify(await viewerDoc(page)), before);
  await page.key('Escape');
  await page.waitFor((sel) => !document.querySelector(sel).classList.contains('sim-mode'), [ED], { what: 'back to the view' });
  assert.equal(await page.eval(() => window.Silinx.active.viewer.simulating), false);
  return before;
}
/** The view, out of the simulation, cannot be edited either. */
async function notEditable(page, before) {
  await page.eval((sel) => document.querySelector(sel).focus(), ED);
  await page.key('a', { modifiers: 2 });   // Ctrl+A
  await page.key('Delete');
  await page.key('Backspace');
  await page.key('v', { modifiers: 2 });   // Ctrl+V
  await page.key('w');                     // (the wire tool)
  assert.equal(JSON.stringify(await viewerDoc(page)), before);
  assert.deepEqual(await page.eval(() => [window.Silinx.active.viewer.canPaste(), window.Silinx.active.viewer.canCopy()]), [false, false]);
}

uiTest('Truth Table schematic: Simulate in the read-only view, outputs as the table for every input, not editable, in Portuguese (#946)', E, async (page) => {
  await makeProject(env, { name: 'TtLive', files: { 'src/fadd.tt.json': JSON.stringify(ADDER, null, 2) } });
  await openTtSch(page, 'TtLive');
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-banner').textContent), 'Read-only, generated from fadd.tt.json');   // (at the end of its toolbar, #1193)
  const before = await simulateTable(page);
  await notEditable(page, before);

  // a change of the table stops the simulation and redraws the schematic
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel)?.classList.contains('sim-mode'), [ED], { what: 'simulating again' });
  await page.eval(() => window.SilinxApp.openTt('src/fadd.tt.json'));
  const T = '.doc:not([hidden]) .tt-editor';
  await page.waitFor((t) => document.querySelector(`${t} .tt-cell[data-out=s][data-row="0"]`), [T], { what: 'the table' });
  await page.click(`${T} .tt-cell[data-out=s][data-row="0"]`);
  await page.waitFor((b) => { const d = window.Silinx.docs.find((x) => x.id === 'ttsch:src/fadd.tt.json')?.viewer; return d && !d.simulating && JSON.stringify(d.getDoc()) !== b; }, [before], { what: 'the schematic redrawn, the simulation stopped' });

  // in Portuguese: the button and the simulation strip translated
  await page.eval(() => window.SilinxApp.openTtSchematic('src/fadd.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/fadd.tt.json');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (y) => { (await import('/js/i18n.js')).setLanguage(y); }, l);
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel)?.classList.contains('sim-mode'), [ED], { what: 'simulating' });
  const texts = () => page.eval((sel) => ['.se-simbar', '.se-status', '[data-act=sim]'].flatMap((p) => window.__uiTexts(document.querySelector(`${sel} ${p}`))), ED);
  await setLang('en'); const en = await texts();
  await setLang('pt'); const pt = await texts();
  assert.deepEqual(untranslated(en, pt, [/^@?(Hex|Decimal|Reset)$/, /symbols?, \d+ nets/]), []);   // (the same words in Portuguese)
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} [data-act=sim] span`).textContent, ED), 'Experimentar');   // (Try it, #992)
  await setLang('en');
  await page.key('Escape');

  // a read-only view without the option (the RTL schematic's): no Simulate, simulate() refused
  const rtl = await page.eval(async () => {
    const { mountSchEditor } = await import('/js/sch-editor.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px';
    document.body.append(host);
    const ed = mountSchEditor(host, { doc: window.Silinx.active.viewer.getDoc(), readOnly: true });
    await ed.simulate();
    const b = host.querySelector('[data-act=sim]');
    const r = { shown: getComputedStyle(b).display !== 'none', simulating: ed.simulating };
    ed.destroy(); host.remove();
    return r;
  });
  assert.deepEqual(rtl, { shown: false, simulating: false });
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('Truth Table schematic in the Tasks interface: Simulate, the outputs as the table (#946)', E, async (page) => {
  await makeProject(env, { name: 'TtLiveTasks', files: { 'src/fadd.tt.json': JSON.stringify(ADDER, null, 2) } });
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  assert.ok(await page.eval(() => !!document.querySelector('#task-switch')), 'the Tasks interface');
  await openTtSch(page, 'TtLiveTasks');
  const before = await simulateTable(page);
  await notEditable(page, before);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
}, { build: DEV });
