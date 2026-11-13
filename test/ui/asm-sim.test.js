// UI (#2880): the ASM chart editor's Try it panel (#3295) (web/js/asm-sim.js), in both interfaces: the inputs and the reset,
// Clock ↑, ▶ Run / ■ Stop at a chosen rate, ↶ Back, ⟲ Reset; on the chart the present state, the decisions tested and
// the exits followed, the conditional outputs lit, the next state; the outputs and the registers; the trace; the panel
// no fold button (#3800: resized by its edge instead); opened again (showPanel('sim'), as a design link's view=try opens it, #2881), closed,
// over the canvas on a narrow screen; a chart with errors not simulated, its errors in the console; in Portuguese. No
// warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const D = '.doc:not([hidden]) .asm-editor';
const P = `${D} .asm-simpanel`;
/** IDLE: go → [y = 1, n = d] → BUSY, else [y = 2]; BUSY (busy, n = n - 1) until n == 0; an asynchronous active-low reset. */
const tiny = () => ({
  version: 1, name: 'tiny', lang: 'vhdl', clock: 'clk', reset: { name: 'rst_n', active: 'low', sync: false }, encoding: 'binary',
  inputs: [{ name: 'go', width: 1 }, { name: 'd', width: 3 }], outputs: [{ name: 'busy', width: 1, default: '0' }, { name: 'y', width: 2, default: '0' }],
  registers: [{ name: 'n', width: 3, init: '0' }],
  nodes: [
    { id: 's1', type: 'state', name: 'IDLE', x: 200, y: 80, actions: [] }, { id: 'd1', type: 'decision', x: 200, y: 200, cond: 'go' },
    { id: 'o1', type: 'output', x: 200, y: 320, actions: ['y = 1', 'n = d'] }, { id: 'o2', type: 'output', x: 420, y: 200, actions: ['y = 2'] },
    { id: 's2', type: 'state', name: 'BUSY', x: 200, y: 460, actions: ['busy', 'n = n - 1'] }, { id: 'd2', type: 'decision', x: 200, y: 580, cond: 'n == 0' },
  ],
  edges: [{ from: 's1', to: 'd1' }, { from: 'd1', to: 'o1', port: 'true' }, { from: 'd1', to: 'o2', port: 'false' }, { from: 'o1', to: 's2' }, { from: 'o2', to: 's1' },
    { from: 's2', to: 'd2' }, { from: 'd2', to: 's1', port: 'true' }, { from: 'd2', to: 's2', port: 'false' }],
  initial: 's1',
});
const errorsOf = (page) => page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((r) => r.textContent));
const warningsOf = (page) => page.eval(() => [...document.querySelectorAll('#console-warnings .diag')].map((r) => r.textContent));
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));
/** What the panel and the chart show. */
const shown = (page) => page.eval((d, p) => {
  const ed = document.querySelector(d), cls = (c) => [...ed.querySelectorAll(`.asm-node.${c}`)].map((n) => n.dataset.node).sort();
  return {
    state: ed.querySelector(`${p} .fsm-sim-state`).textContent, next: ed.querySelector(`${p} .asm-sim-next`).textContent,
    outputs: [...ed.querySelectorAll(`${p} .fsm-led[data-output]`)].map((x) => x.textContent),
    registers: [...ed.querySelectorAll(`${p} .asm-sim-reg`)].map((x) => x.textContent),
    cur: cls('sim-cur'), next2: cls('sim-next'), path: cls('sim-path'), lit: cls('sim-lit'),
    edges: [...ed.querySelectorAll('.asm-edge.sim-path')].map((e) => e.dataset.edge).sort(),
    trace: ed.querySelectorAll(`${p} .fsm-trace tr`).length,
  };
}, D, '.asm-simpanel');
const waitState = (page, s) => page.waitFor((p, x) => document.querySelector(`${p} .fsm-sim-state`)?.textContent === x, [P, s], { what: `the state ${s}` });

async function openChart(page, name, model) {
  await makeProject(env, { name, files: { [`src/${model.name}.asm.json`]: JSON.stringify(model, null, 2) } });
  await page.openProject(name);
  await page.eval((f) => window.SilinxApp.openFile(f), `src/${model.name}.asm.json`);
  await page.waitFor((d) => document.querySelector(`${d} .asm-sim-btn`), [D], { what: 'the editor' });
}

uiTest('#2880 the ASM chart\'s Try it panel: inputs, Clock ↑, Run / Stop, Back, Reset, the path on the chart, no fold, narrow', E, async (page) => {
  await page.setViewport(1600, 900);
  await openChart(page, 'AsmSim', tiny());
  await page.click(`${D} .asm-sim-btn`);
  await page.waitFor((p) => document.querySelector(p) && !document.querySelector(p).hidden, [P], { what: 'the panel' });
  assert.ok(await page.eval((d) => document.querySelector(`${d} .asm-sim-btn`).classList.contains('active'), D));
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-sim-btn`).closest('.asm-group').textContent, D), 'ValidateTry it');
  // the reset state, go = 0: d1 tested, its 0 exit to [y = 2] lit, back to IDLE
  assert.deepEqual(await shown(page), { state: 'IDLE', next: 'next clock edge → IDLE', outputs: ['busy = 0', 'y = 10'], registers: ['n = 000'],
    cur: ['s1'], next2: ['s1'], path: ['d1', 'o2'], lit: ['o2'], edges: ['e1', 'e3', 'e5'], trace: 0 });
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .fsm-bit`)].map((b) => [b.textContent, b.title]), P),
    [['go = 0', 'Click to toggle the input'], ['rst_n = 1', 'The reset (active-low, asynchronous): click to toggle it']]);
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .fsm-led[data-output]`)].map((b) => b.title), P), ['Its default value', 'Mealy output (a conditional output box)']);
  // go = 1, d = 2: the 1 exit, [y = 1, n = d] lit, BUSY next; n's next value shown
  await page.click(`${P} .fsm-bit[data-input=go]`);
  await page.eval((p) => { const e = document.querySelector(`${p} .fsm-bus[data-input=d]`); e.value = '2'; e.dispatchEvent(new Event('change')); }, P);
  await page.waitFor((p) => document.querySelector(`${p} .asm-sim-reg`)?.textContent === 'n = 000 → 010', [P], { what: 'n\'s next value' });
  assert.deepEqual(await shown(page), { state: 'IDLE', next: 'next clock edge → BUSY', outputs: ['busy = 0', 'y = 01'], registers: ['n = 000 → 010'],
    cur: ['s1'], next2: ['s2'], path: ['d1', 'o1'], lit: ['o1'], edges: ['e1', 'e2', 'e4'], trace: 0 });
  // Clock ↑: BUSY (a Moore output), n == 0 false: stays; the trace
  await page.click(`${P} .asm-sim-step`);
  await waitState(page, 'BUSY');
  assert.deepEqual(await shown(page), { state: 'BUSY', next: 'next clock edge → BUSY', outputs: ['busy = 1', 'y = 00'], registers: ['n = 010 → 001'],
    cur: ['s2'], next2: ['s2'], path: ['d2'], lit: [], edges: ['e6', 'e8'], trace: 2 });
  assert.equal(await page.eval((p) => document.querySelector(`${p} .fsm-led[data-output=busy]`).title, P), 'Moore output (state BUSY)');
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .fsm-trace td`)].map((c) => c.textContent), P), ['0', 'IDLE', 'go=1 d=2', 'busy=0 y=01', 'BUSY']);
  // ↶ Back: IDLE again, no trace
  await page.click(`${P} .asm-sim-back`);
  await waitState(page, 'IDLE');
  assert.equal((await shown(page)).trace, 0);
  assert.ok(await page.eval((p) => document.querySelector(`${p} .asm-sim-back`).disabled, P));
  // ▶ Run at 10 Hz: clock edges until ■ Stop; then none
  await page.eval((p) => { const s = document.querySelector(`${p} .asm-sim-rate`); s.value = '10'; s.dispatchEvent(new Event('change')); }, P);
  await page.click(`${P} .asm-sim-run`);
  await page.waitFor((p) => document.querySelectorAll(`${p} .fsm-trace tr`).length >= 5, [P], { what: 'clock edges while running', timeout: 5000 });
  await page.click(`${P} .asm-sim-run`, { text: '■ Stop' });
  await page.waitFor((p) => document.querySelector(`${p} .asm-sim-run`).textContent === '▶ Run', [P], { what: 'stopped' });
  const n = (await shown(page)).trace;
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await shown(page)).trace, n, 'no clock edge once stopped');
  // ⟲ Reset: IDLE, n = 0, no trace; the reset input: held in the reset state at once (asynchronous)
  await page.click(`${P} .asm-sim-step`);
  await page.click(`${P} .asm-sim-reset`);
  await waitState(page, 'IDLE');
  assert.deepEqual(await shown(page).then((s) => [s.registers, s.trace]), [['n = 000 → 010'], 0]);
  await page.click(`${P} .asm-sim-step`);
  await waitState(page, 'BUSY');
  await page.click(`${P} .fsm-bit[data-input=rst_n]`);
  await waitState(page, 'IDLE');
  assert.equal((await shown(page)).next, 'held in the reset state by rst_n');
  await page.click(`${P} .fsm-bit[data-input=rst_n]`);
  // no fold button (#3800): its bar's buttons the tools, ⇆ and ✕; opened again when the chart is opened again
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .asm-codebar > .asm-btn`)].map((b) => b.textContent), P), ['⇆', '✕']);
  assert.equal(await page.eval((p) => document.querySelector(`${p} .asm-sim-fold`), P), null);
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('asm:src/tiny.asm.json')));
  await page.eval(() => window.SilinxApp.openFile('src/tiny.asm.json'));
  await page.waitFor((d) => document.querySelector(`${d} .asm-sim-btn`), [D], { what: 'the editor again' });
  await page.eval(() => window.SilinxApp.findDoc('asm:src/tiny.asm.json').asmEditor.showPanel('sim'));
  await page.waitFor((p) => !document.querySelector(p).hidden && document.querySelector(`${p} > .fsm-panel-body`).getClientRects().length, [P], { what: 'opened again' });
  assert.equal(await page.eval(() => window.SilinxApp.findDoc('asm:src/tiny.asm.json').asmEditor.panel), 'sim');
  // ✕: closed, the chart without its highlights
  await page.click(`${P} .asm-codebar .asm-btn`, { text: '✕' });
  await page.waitFor((p) => document.querySelector(p).hidden, [P], { what: 'closed' });
  assert.deepEqual(await page.eval((d) => document.querySelectorAll(`${d} .sim-cur, ${d} .sim-path, ${d} .sim-lit`).length, D), 0);
  // a narrow screen: the panel over the canvas
  await page.setViewport(800, 1000);
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false, { remember: false }));   // (the left side's drawer, over the document)
  await page.click(`${D} .asm-sim-btn`);
  await page.waitFor((p) => !document.querySelector(p).hidden, [P], { what: 'the panel, narrow' });
  assert.equal(await page.eval((p) => getComputedStyle(document.querySelector(p)).position, P), 'absolute');
  await page.setViewport(1600, 900);
  // its problems: none
  assert.deepEqual([await errorsOf(page), await warningsOf(page)], [[], []]);
  assert.deepEqual((await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
});

uiTest('#2880 a chart with errors is not simulated: its errors in the console, the Errors tab in front', E, async (page) => {
  const m = tiny();
  m.edges = m.edges.filter((e) => !(e.from === 'd1' && e.port === 'false'));
  await openChart(page, 'AsmSimBad', m);
  await page.click(`${D} .asm-sim-btn`);
  await page.waitFor(() => document.querySelector('#console-tabs .tab.active')?.dataset.page === 'errors', [], { what: 'the Errors tab in front' });
  assert.ok(await page.eval((p) => document.querySelector(p).hidden, P), 'the panel stays closed');
  assert.ok(!await page.eval((d) => document.querySelector(`${d} .asm-sim-btn`).classList.contains('active'), D));
  const said = (await lines(page)).slice(-4);
  assert.deepEqual(said, ['tiny.asm.json: The chart cannot be simulated: correct its errors first', 'Started : "Validate" of tiny.asm.json.',
    "ERROR: Decision 'go' has no 0 (false) branch", 'Process "Validate" failed']);
  assert.deepEqual(await errorsOf(page), ['ERROR:ASM - "src/tiny.asm.json": Decision \'go\' has no 0 (false) branch']);
  // (the box its 0 exit led to: no longer reached)
  assert.deepEqual(await warningsOf(page), ['WARNING:ASM - "src/tiny.asm.json": Conditional output box \'y = 2\' cannot be reached from any state or every-cycle block']);
});

uiTest('#2880 the Try it panel in Portuguese: every label translated, named Experimentar (#3295)', E, async (page) => {
  await page.setViewport(1600, 900);
  await openChart(page, 'AsmSimPt', tiny());
  await page.eval(TEXTS);
  await page.click(`${D} .asm-sim-btn`);
  await page.waitFor((p) => !document.querySelector(p).hidden, [P], { what: 'the panel' });
  await page.click(`${P} .asm-sim-step`);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const SAME = [/^(IDLE|BUSY|go|d|rst_n|busy|y|n|[a-z_]+ = [01]+( → [01]+)?|[a-z_]+=\d+( [a-z_]+=\d+)*|\d+ Hz|[▾▴✕])$/];
  await setLang('en'); const en = await page.eval((p) => window.__uiTexts(document.querySelector(p)), P);
  await setLang('pt'); const pt = await page.eval((p) => window.__uiTexts(document.querySelector(p)), P);
  assert.deepEqual(untranslated(en, pt, SAME), []);
  // (named as the schematic's: Try it, Experimentar, its button and its panel's title, #3295)
  const names = () => page.eval((d, p) => [document.querySelector(`${d} .asm-sim-btn`).textContent.trim(), document.querySelector(`${p} .asm-code-title`).textContent], D, P);
  assert.deepEqual(await names(), ['Experimentar', 'Experimentar']);
  await setLang('en');
  assert.deepEqual(await names(), ['Try it', 'Try it']);
  await setLang('pt');
  assert.equal(await page.eval((p) => document.querySelector(`${p} .asm-sim-next`).textContent, P), 'próximo flanco de relógio → IDLE');
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-sim-btn`).title, D), 'Percorrer o fluxograma passo a passo: definir as entradas, aplicar flancos de relógio, ver o estado, o caminho seguido e as saídas');
  await setLang('en');
});
