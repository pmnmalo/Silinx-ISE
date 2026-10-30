// UI: New Source without the wizard (#2176): an FSM, an ASM chart and a Petri net start with an empty drawing and no
// ports, with only the problem of an empty drawing and nothing in the log; the first state drawn becomes the initial
// state.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const DOC = '.doc:not([hidden])';
// New Source ▸ `type`, the name typed, Next > to the Summary, Finish: the drawing `id` open
async function create(page, type, name, id) {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, type);
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((i) => window.Silinx.active?.id === i, [id], { what: id });
}
const logProblems = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));
const problems = (page) => page.eval((d) => [...document.querySelectorAll(`${d} .asm-prob`)].map((li) => li.textContent), DOC);

uiTest('#2176 New Source without the wizard: the FSM empty, its first state drawn', E, async (page) => {
  await makeProject(env, { name: 'EmptyFsm' });
  await page.openProject('EmptyFsm');
  await create(page, 'Finite State Machine (FSM)', 'det', 'fsm:src/det.fsm.json');
  const m = JSON.parse(await readWs(env, 'EmptyFsm', 'src/det.fsm.json'));
  assert.deepEqual([m.name, m.states, m.transitions, m.inputs, m.outputs, m.initial], ['det', [], [], [], [], '']);
  await page.waitForSelector(`${DOC} .fsm-problems`);
  assert.equal(await page.eval((d) => document.querySelectorAll(`${d} .fsm-state`).length, DOC), 0);
  assert.deepEqual(await problems(page), ['✖The diagram has no states: double-click the drawing to add one']);
  assert.deepEqual(await logProblems(page), []);
  // the first state, double-clicked on the drawing
  await page.waitFor((d) => document.querySelector(`${d} .fsm-canvas`)?.getBoundingClientRect().width > 100, [DOC], { what: 'the drawing' });
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .fsm-canvas`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, DOC);
  await page.dblclick(c);
  await page.waitForSelector(`${DOC} .fsm-inline`);
  await page.fill(`${DOC} .fsm-inline`, 'S0');
  await page.key('Enter');
  await page.waitFor((d) => [...document.querySelectorAll(`${d} .fsm-name`)].some((t) => t.textContent === 'S0'), [DOC], { what: 'state S0' });
  assert.equal(await page.eval(() => window.Silinx.active.fsmEditor.getModel().initial), await page.eval(() => window.Silinx.active.fsmEditor.getModel().states[0].id));
  await page.waitFor(() => !/no states/.test(document.querySelector('.doc:not([hidden]) .fsm-problems').textContent), [], { what: 'the problem gone' });
}, { timeout: 120000 });

uiTest('#2176 New Source without the wizard: the ASM chart empty, its first state box added', E, async (page) => {
  await makeProject(env, { name: 'EmptyAsm' });
  await page.openProject('EmptyAsm');
  await create(page, 'Algorithmic State Machine (ASM)', 'ctl', 'asm:src/ctl.asm.json');
  const m = JSON.parse(await readWs(env, 'EmptyAsm', 'src/ctl.asm.json'));
  assert.deepEqual([m.name, m.nodes, m.edges, m.inputs, m.outputs, m.initial], ['ctl', [], [], [], [], '']);
  await page.waitForSelector(`${DOC} .asm-add`);
  assert.equal(await page.eval((d) => document.querySelectorAll(`${d} [data-node]`).length, DOC), 0);
  assert.deepEqual(await problems(page), ['✖The chart has no states', '✖No initial (reset) state selected']);
  assert.deepEqual(await logProblems(page), []);
  await page.click(`${DOC} .asm-add`);
  await page.waitFor((d) => document.querySelectorAll(`${d} [data-node]`).length === 1, [DOC], { what: 'the state box' });
  assert.equal(await page.eval(() => window.Silinx.active.asmEditor.getModel().nodes[0].type), 'state');
}, { timeout: 120000 });

uiTest('#2176 New Source without the wizard: the Petri net empty, with no problems', E, async (page) => {
  await makeProject(env, { name: 'EmptyPn' });
  await page.openProject('EmptyPn');
  await create(page, 'Petri Net', 'net', 'pn:src/net.pn.json');
  const m = JSON.parse(await readWs(env, 'EmptyPn', 'src/net.pn.json'));
  assert.deepEqual([m.name, m.places, m.transitions, m.arcs, m.inputs, m.outputs], ['net', [], [], [], [], []]);
  await page.waitFor((d) => /0 places · 0 transitions · 0 arcs/.test(document.querySelector(`${d} .petri-editor .asm-status`)?.textContent), [DOC], { what: 'an empty net' });
  assert.deepEqual(await logProblems(page), []);
}, { timeout: 120000 });
