// UI (#2696): a Petri net's state machine, read-only: its Design row's [FSM] badge (between the net's and its HDL's) and the net's
// command View State Machine (FSM) open the FSM of the net's state space (a state per marking, the conditions the
// guards'), nothing in it can be edited (no tools, a state not moved nor deleted, its properties disabled), its
// simulation runs; Portuguese; both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newPetri } from '../../core/petri.js';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

const row = (page, name) => page.eval((n) => {
  const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent.trim() === n);
  return r ? [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`) : null;
}, name);

uiTest('#2696 a Petri net\'s state machine, read-only: its [FSM] badge and command, its states and conditions, nothing edited; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PnFsm', top: 'ctl', files: { 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2) } });
  await page.openProject('PnFsm');
  await page.leftTab('design');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'ctl'), [], { what: 'the module' });
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl')?.textContent.trim() === 'ctl' && r.querySelector('.badge')), [], { what: 'its row' });
  assert.deepEqual(await row(page, 'ctl'), ['Petri*', 'FSM', 'VHDL']);
  await page.click('#hier .row .badge', { text: 'FSM' });
  await page.waitFor((ed) => window.Silinx.active?.id === 'pnfsm:src/ctl.pn.json' && document.querySelector(ed), [ED], { what: 'the state machine' });
  const view = await page.eval((ed) => {
    const el = document.querySelector('.doc:not([hidden])');
    const shown = (b) => !b.hidden && b.getClientRects().length > 0;
    return {
      banner: el.querySelector('.gen-banner')?.textContent,
      states: [...el.querySelectorAll('.fsm-states [data-state]')].map((g) => g.querySelector('text')?.textContent),
      labels: [...el.querySelectorAll('.fsm-edges text')].map((t) => t.textContent),
      tools: [...el.querySelectorAll('.asm-toolbar .asm-btn, .asm-toolbar select')].filter(shown).map((b) => b.textContent.trim()).filter(Boolean),
      readOnly: el.querySelector(ed).classList.contains('asm-readonly'),
      problems: shown(el.querySelector('.fsm-problems')),
      hint: el.querySelector('.asm-hint').textContent,
    };
  }, ED);
  assert.equal(view.banner, 'Read-only, the state space of the Petri net ctl.pn.json (2 states)');
  assert.deepEqual(view.states, ['idle', 'work']);
  assert.deepEqual(view.labels.sort(), ['!go', 'go']);
  assert.equal(view.readOnly, true);
  assert.equal(view.problems, false);
  assert.equal(view.hint, 'Read-only · drag the background to pan · wheel to zoom · click a state or a transition to see it');
  for (const t of ['State', 'Moore', 'Binary', '3 processes']) assert.ok(!view.tools.some((x) => x.endsWith(t)), `${t}: ${view.tools.join(', ')}`);
  assert.ok(view.tools.includes('Tables'), view.tools.join(', '));
  // a state selected: its properties shown (the marking), disabled; a drag, a double click and Delete change nothing
  const model = () => page.eval(() => JSON.stringify(window.Silinx.active.petriFsm.getModel()));
  const before0 = await model();
  const at = await page.eval((ed) => { const r = document.querySelector(`${ed} .fsm-states [data-state=s1] circle`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, ED);
  await page.click(at);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-scomment`)?.textContent === 'idle=0, work=1', [ED], { what: 'its marking' });
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-side input, ${ed} .asm-side select`)].every((x) => x.disabled), ED));
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-side button:not(.asm-fold)`)].every((x) => x.hidden || !x.closest('.asm-section')), ED));
  await page.drag(at, { x: at.x + 120, y: at.y + 60 });
  await page.eval((ed) => document.querySelector(ed).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })), ED);
  await page.eval((ed) => document.querySelector(`${ed} .fsm-canvas`).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 30, clientY: 30 })), ED);
  assert.equal(await model(), before0);
  // its simulation: a clock edge with go = 0 stays in idle (the state highlighted)
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Simulate' });
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-sim-step`), [ED], { what: 'the simulation' });
  await page.click(`${ED} .fsm-sim-step`);
  assert.equal(await model(), before0);
  // the net's commands (its badge's right-click): View State Machine (FSM)
  await page.rightClick('#hier .row .badge', { text: 'Petri' });
  await page.click('body > .menu-popup .mi', { text: 'View State Machine (FSM)' });
  await page.waitFor(() => window.Silinx.active?.id === 'pnfsm:src/ctl.pn.json' && window.Silinx.active.petriFsm);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .gen-banner')?.textContent === 'Só de leitura, o espaço de estados da rede de Petri ctl.pn.json (2 estados)', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
