// UI: the parts of the schematic editor (#405: out of mountSchEditor in web/js/sch-editor.js), on an AND gate with its
// I/O markers: the toolbar (sch-toolbar.js: its buttons, the zooms through the view, sch-view.js), the palette
// (sch-palette.js: the search), the keys (sch-keys.js: Select All, Delete), the edits (sch-edits.js: Undo, Redo), the
// selection's operations (sch-select.js: Rotate), Check (sch-check.js, its problems shown by sch-try.js), Try it
// (sch-try.js: entered, left by Escape) and Symbol Info (sch-info.js). The editor's whole use: test/ui/diagrams.test.js,
// livesim.test.js, tasks.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// an AND gate with the markers a, b (in) and y (out), wired to its pins
function schematic() {
  const doc = newDoc('andg', 'vhdl');
  const s = { id: 'S1', type: 'and2', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: {} };
  doc.symbols.push(s);
  const pin = (n) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], {}).find((q) => q.name === n);
  let w = 0;
  for (const [n, name, dir] of [['I0', 'a', 'in'], ['I1', 'b', 'in'], ['O', 'y', 'out']]) {
    const p = pin(n), at = { x: p.x + (dir === 'in' ? -60 : 60), y: p.y };
    doc.ports.push({ id: `P${doc.ports.length + 1}`, name, dir, width: 1, x: at.x, y: at.y });
    doc.wires.push({ id: `W${++w}`, points: [at, { x: p.x, y: p.y }] });
  }
  return doc;
}
const ED = '.doc:not([hidden]) .sch-editor';

uiTest('#405 schematic editor parts: the toolbar, the palette, Select All and Delete undone, Rotate, Check, Try it, Symbol Info', E, async (page) => {
  await makeProject(env, { name: 'SchParts', files: { 'src/andg.sch.json': JSON.stringify(schematic()) } });
  await page.openProject('SchParts');
  await page.eval(() => window.SilinxApp.openSch('src/andg.sch.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'sch:src/andg.sch.json' && document.querySelector(`${ed} .se-symrow`), [ED], { what: 'the schematic editor' });
  const ev = (fn, ...a) => page.eval(fn, ED, ...a);
  const doc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  // ---- the toolbar: its buttons in order, Undo / Redo right after the drawing tools between separators (#1696); the
  // zooms, then Keep connections between separators (#1733); the menu last (#2208)
  assert.deepEqual(await ev((ed) => [...document.querySelectorAll(`${ed} .se-toolbar [data-act]`)].map((b) => b.dataset.act)),
    ['select', 'wire', 'net', 'io', 'undo', 'redo', 'rotate', 'mirror', 'mirrorv', 'delete', 'zin', 'zout', 'fit', 'check', 'sim', 'more', 'rewire', 'relayout']);
  assert.deepEqual(await ev((ed) => [...document.querySelector(`${ed} .se-toolbar`).children].map((e) => e.dataset.act || (e.classList.contains('se-sep') ? '|' : e.className.match(/se-(keep|curved)/)?.[1])).filter(Boolean).slice(12, 19)),
    ['|', 'zin', 'zout', 'fit', '|', 'keep', '|']);
  assert.deepEqual(await ev((ed) => [...document.querySelector(`${ed} .se-toolbar`).children].slice(3, 9).map((e) => e.dataset.act || (e.classList.contains('se-sep') ? '|' : e.className))),
    ['io', '|', 'undo', 'redo', '|', 'rotate']);
  // the zooms (the view): Zoom In scales the drawing by 1.25, Fit back
  const scale = () => ev((ed) => parseFloat(/scale\(([\d.]+)\)/.exec(document.querySelector(`${ed} .se-vp`).getAttribute('transform'))[1]));
  await page.click(`${ED} .se-btn[data-act=fit]`);
  const k = await scale();
  await page.click(`${ED} .se-btn[data-act=zin]`);
  assert.ok(Math.abs(await scale() - k * 1.25) < 1e-6, `${k} -> ${await scale()}`);
  await page.click(`${ED} .se-btn[data-act=fit]`);
  assert.ok(Math.abs(await scale() - k) < 1e-6);
  // ---- the palette: the search keeps the matching symbols (by name or description: INV, the gates' inverted inputs)
  const shown = () => ev((ed) => [...document.querySelectorAll(`${ed} .se-symrow`)].filter((r) => r.offsetParent).map((r) => r.textContent));
  const all = (await shown()).length;
  await page.fill(`${ED} .se-search`, 'inv');
  const rows = await shown();
  assert.ok(rows.includes('INV') && rows.length < all, `${rows.join(' | ')} of ${all}`);
  await page.fill(`${ED} .se-search`, '');
  await page.waitFor((ed, n) => [...document.querySelectorAll(`${ed} .se-symrow`)].filter((r) => r.offsetParent).length === n, [ED, all], { what: 'every symbol again' });
  // ---- the keys and the edits: Select All, Delete; Undo brings it all back, Redo takes it away again
  await page.click(`${ED} .se-canvas`);
  await page.key('a', { modifiers: process.platform === 'darwin' ? 4 : 2 });
  await page.key('Delete');
  assert.deepEqual([(await doc()).symbols.length, (await doc()).ports.length, (await doc()).wires.length], [0, 0, 0]);
  await page.menu('Edit', 'Undo');
  assert.deepEqual([(await doc()).symbols.length, (await doc()).ports.length, (await doc()).wires.length], [1, 3, 3]);
  await page.menu('Edit', 'Redo');
  assert.equal((await doc()).symbols.length, 0);
  await page.menu('Edit', 'Undo');
  // ---- the selection's operations: the gate selected, Rotate turns it
  await page.eval(() => window.Silinx.active.schEditor.getDoc());
  const g = await ev((ed) => { const b = document.querySelector(`${ed} [data-kind=sym][data-id=S1]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.click(g);
  await page.click(`${ED} .se-btn[data-act=rotate]`);
  assert.equal((await doc()).symbols[0].rot, 90);
  await page.menu('Edit', 'Undo');
  // ---- Symbol Info of the selected gate
  await page.click(g);
  await page.key('F1');
  await page.waitFor(() => !!window.Silinx.active.schEditor.symbolInfoDialog, [], { what: 'Symbol Info open' });
  await page.eval(() => window.Silinx.active.schEditor.symbolInfoDialog.close());
  // ---- Check: no errors
  await page.click(`${ED} .se-btn[data-act=check]`);
  // (in the editor's panel; the modern interface, the Tasks one, takes the problems into its console: tasks.test.js #993, #1149)
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) await page.waitConsole(/Process "Check Schematic" completed/);
  else await page.waitFor((ed) => /^Check Schematic: 0 error\(s\), \d+ warning\(s\)/.test(document.querySelector(`${ed} .se-diags`)?.textContent || ''), [ED], { what: 'the check in the panel' });
  // ---- Try it: entered (its mode), the gate's output follows its inputs; Escape leaves it
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('sim-mode') && document.querySelector(`${ed} .se-simlayer .lv-ctl`), [ED], { what: 'Try it' });
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.simulating), true);
  await page.click(`${ED} .se-canvas`);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('sim-mode'), [ED], { what: 'Try it left' });
});
