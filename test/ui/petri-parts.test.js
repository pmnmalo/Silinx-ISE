// UI: the parts of the Petri net editor (#405: out of mountPetriEditor in web/js/petri-editor.js): the drawing
// (petri-draw.js: the places with their tokens, the transitions, the arcs), the side panel (petri-side.js: a place
// selected and its fields, its tokens changed and drawn, the net's fields, the problems) and the bottom panel
// (petri-sim.js: the simulation's marking and outputs after a clock step, the analysis) on a new net.
// The editor's whole use: test/ui/petri.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newPetri } from '../../core/petri.js';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .petri-editor';

uiTest('#405 Petri net editor parts: the drawing, the side panel, the simulation and the analysis', E, async (page) => {
  await makeProject(env, { name: 'PnParts', top: '', files: { 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2) } });
  await page.openProject('PnParts');
  await page.eval(() => window.SilinxApp.openPetri('src/ctl.pn.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'pn:src/ctl.pn.json' && document.querySelector(`${ed} .pn-place`), [ED], { what: 'the Petri net editor' });
  const ev = (fn, ...a) => page.eval(fn, ED, ...a);
  // ---- the drawing: two places (idle with its token), two transitions, four arcs; the status line
  assert.deepEqual(await ev((ed) => [...document.querySelectorAll(`${ed} .pn-place`)].map((g) => [g.dataset.id, g.querySelector('.pn-name').textContent, g.querySelectorAll('.pn-token').length])),
    [['p1', 'idle', 1], ['p2', 'work', 0]]);
  assert.deepEqual(await ev((ed) => [...document.querySelectorAll(`${ed} .pn-trans`)].map((g) => [g.querySelector('.pn-name').textContent, g.querySelector('.pn-guard')?.textContent ?? ''])),
    [['start', '[go]'], ['done', '[!go]']]);
  assert.equal(await ev((ed) => document.querySelector(`${ed} .pn-place[data-id=p2] .pn-outs`).textContent), 'busy=1');
  assert.equal(await ev((ed) => document.querySelectorAll(`${ed} .pn-arc`).length), 4);
  assert.equal(await ev((ed) => document.querySelector(`${ed} .asm-status`).textContent), '2 places · 2 transitions · 4 arcs');
  // ---- the side panel: nothing selected; the place idle selected: its fields; 3 initial tokens: three dots drawn
  assert.equal(await ev((ed) => document.querySelector(`${ed} .pn-selection`).textContent), 'Nothing selected: click a place, a transition or an arc');
  const at = await ev((ed) => { const r = document.querySelector(`${ed} .pn-place[data-id=p1] circle`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 4 }; });
  await page.click(at);
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-selection .asm-section-title`)?.textContent === 'Place idle', [ED], { what: 'idle selected' });
  assert.deepEqual(await ev((ed) => [...document.querySelectorAll(`${ed} .pn-selection .asm-label`)].map((l) => l.textContent)), ['Name', 'Initial tokens', 'Capacity', 'Outputs while marked']);
  await page.fill(`${ED} .pn-selection input[type=number]`, '3', { index: 0 });
  await page.key('Tab');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .pn-place[data-id=p1] .pn-token`).length === 3, [ED], { what: 'three tokens drawn' });
  // (the capacity follows the tokens)
  assert.equal(await ev((ed) => document.querySelectorAll(`${ed} .pn-selection input[type=number]`)[1].value), '3');
  assert.deepEqual(await ev((ed) => [...document.querySelectorAll(`${ed} .asm-side details .asm-section-body .asm-label`)].map((l) => l.textContent)),
    ['Module name', 'Inputs', 'Outputs', 'Clock', 'Reset (synchronous, to the initial marking)', 'Description']);
  assert.equal(await ev((ed) => document.querySelectorAll(`${ed} .asm-problems li`).length), 0);
  // ---- the simulation: the marking, go on and a clock step: start fires (idle 3 -> 2, work 1), busy
  await page.click(`${ED} .pn-tab-btn`, { text: '▶ Simulate' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=3  work=0', [ED], { what: 'the initial marking' });
  await page.click(`${ED} .pn-sim-ins input[type=checkbox]`);
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '⏭ Clock step' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=2  work=1', [ED], { what: 'start fired' });
  assert.equal(await ev((ed) => document.querySelector(`${ed} .pn-log`).textContent), 'clock: start');
  // ---- the analysis (no </> HDL button, #2250)
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .pn-tab-btn`)].map((b) => b.textContent), ED), ['▶ Simulate', '∑ Analysis']);
  await page.click(`${ED} .pn-tab-btn`, { text: '∑ Analysis' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-an-props`), [ED], { what: 'the analysis' });
  assert.deepEqual(await ev((ed) => [...document.querySelectorAll(`${ed} .pn-an-props th`)].map((t) => t.textContent)), ['Bounded', 'Deadlocks', 'Live', 'Reversible', 'Conservative']);
  assert.deepEqual(await ev((ed) => [...document.querySelectorAll(`${ed} .pn-an-places tr`)].slice(1).map((r) => r.firstChild.textContent)), ['idle', 'work']);
});
