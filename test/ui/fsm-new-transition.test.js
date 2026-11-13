// UI: a transition of the FSM editor given its condition as it is drawn (#3763): typed in the Properties panel while the
// text in place is still open, a key at a time, or typed in place; the diagram keeps it, its generated HDL (VHDL and
// Verilog: compiled, elaborated, simulated, no warnings) and the step-through simulation take it. The Properties panel
// shows the Machine section only when nothing is selected (#3764): a state or a transition selected, its own properties.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm, simulateFsm } from '../../core/fsm.js';
import { compile, elaborate } from '../../core/compile.js';
import { Simulator } from '../../core/simulator.js';
import * as V from '../../core/values.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

// A (initial) --x--> B (z=1), C; B and C with no exit yet
const machine = (lang) => normalizeFsm({
  name: 'nt', lang, inputs: [{ name: 'x', width: 1 }, { name: 'y', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 120, y: 160, outputs: {} }, { id: 'b', name: 'B', x: 360, y: 160, outputs: { z: '1' } },
    { id: 'c', name: 'C', x: 360, y: 360, outputs: {} }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }], initial: 'a',
});
const fetchText = (page, pj, p) => page.eval(async (a, b) => (await fetch(`/api/projects/${a}/file?path=${encodeURIComponent(b)}`)).text(), pj, p);
const statePos = (page, id) => page.eval((ed, sid) => {
  const b = document.querySelector(`${ed} [data-state="${sid}"] .fsm-circle`).getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
}, ED, id);
/** A transition drawn from the rim of `from` to `to`: its text in place open. */
async function draw(page, from, to) {
  const a = await statePos(page, from), b = await statePos(page, to);
  const n = await page.eval((ed) => document.querySelectorAll(`${ed} [data-trans]`).length, ED);
  await page.drag({ x: a.x + (b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y) * (a.r - 3), y: a.y + (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y) * (a.r - 3) }, b);
  await page.waitFor((ed, k) => document.querySelectorAll(`${ed} [data-trans]`).length === k + 1 && document.querySelector(`${ed} .fsm-inline`), [ED, n], { what: 'a new transition, its text in place' });
}

/** The generated HDL against the diagram: compiled, elaborated (no warnings), then z at each cycle for the same x, y. */
function hdlVsModel(code, lang, model) {
  const lib = compile([{ path: lang === 'vhdl' ? 'nt.vhd' : 'nt.v', lang, text: code }]);
  assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
  const design = elaborate(lib, 'nt');
  assert.deepEqual(design.diags.map((e) => `${e.severity}: ${e.message}`), [], lang);
  const port = (n) => design.top.ports.find((p) => p.name.toLowerCase() === n);
  const ins = [[1, 0], [1, 0], [0, 0], [1, 1], [0, 1], [0, 0], [1, 1], [0, 1], [1, 0], [0, 0]].map(([x, y]) => ({ x, y }));
  const want = simulateFsm(model, ins).map((r) => String(r.outputs.z)).join('');
  const sim = new Simulator(design, { maxWaveEvents: 0 });
  sim.addClock(port('clk').sig, { period: 20000 });
  sim.force(port('rst').sig, V.mk(1, 1n));
  for (const n of ['x', 'y']) sim.force(port(n).sig, V.mk(1, 0n));
  sim.run(25000);
  sim.force(port('rst').sig, V.mk(1, 0n));
  const got = ins.map((v, k) => {
    const T = 30000 + k * 20000;
    sim.run(T);
    for (const n of ['x', 'y']) sim.force(port(n).sig, V.mk(1, BigInt(v[n])));
    sim.run(T + 9000);
    return V.toBin(port('z').sig.val);
  }).join('');
  return { got, want };
}

for (const lang of ['vhdl', 'verilog']) {
  const pj = `FsmNew${lang}`, hdl = `src/nt.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#3763 FSM: a new transition's condition, typed in the Properties panel or in place as it is drawn, kept and used by the ${lang === 'vhdl' ? 'VHDL' : 'Verilog'} and the simulation`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/nt.fsm.json': JSON.stringify(machine(lang), null, 2) } });
    await page.openProject(pj);
    await page.eval(() => window.SilinxApp.openFsm('src/nt.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/nt.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });

    // ---- B -> A: the Properties panel's Condition clicked while the text in place is open, typed a key at a time
    await draw(page, 'b', 'a');
    await page.click(`${ED} .fsm-cond`);
    await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the text in place closed' });
    assert.equal(await page.eval((ed) => document.activeElement === document.querySelector(`${ed} .fsm-cond`), ED), true, 'the Condition field keeps the focus');
    for (const k of ['x', ' ', '&', '&', ' ', 'y']) await page.type(k);
    await page.key('Tab');
    // ---- B -> C: typed in place
    await draw(page, 'b', 'c');
    await page.type('!x && y');
    await page.key('Enter');
    const conds = () => page.eval(() => window.Silinx.active.fsmEditor.getModel().transitions.map((t) => [t.from, t.to, t.cond]));
    assert.deepEqual(await conds(), [['a', 'b', 'x'], ['b', 'a', 'x && y'], ['b', 'c', '!x && y']]);
    // its label on the drawing, the panel of each
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} [data-trans] .fsm-label`)].map((l) => l.textContent), ED), ['x', 'x && y', '!x && y']);

    // ---- saved, the HDL generated from it
    const file = await page.waitFor(async (p, h) => {
      const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fnt.fsm.json`)).json();
      const code = await (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`)).text();
      return m.transitions.length === 3 && m.transitions.every((t) => t.cond) && /x and y|x && y|x & y/i.test(code) && { m, code };
    }, [pj, hdl], { what: 'the diagram and its HDL saved', timeout: 15000 });
    assert.deepEqual(file.m.transitions.map((t) => t.cond), ['x', 'x && y', '!x && y']);
    const code = await fetchText(page, pj, hdl);
    const r = hdlVsModel(code, lang, file.m);
    assert.equal(r.got, r.want);
    // (the reference: in B, x && y back to A, !x && y on to C, else B stays)
    assert.deepEqual(simulateFsm(file.m, [{ x: 1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }]).map((s) => s.state), ['a', 'b', 'b', 'a']);
    // (its problems: C has no exit, the machine's only warning)
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent)),
      ['WARNING:FSM - "src/nt.fsm.json": State C has no exit: once there, the machine stays in it until a reset']);

    // ---- the step-through simulation: A -x-> B; x=1, y=0 stays; x=1, y=1 back to A; then to B and on to C on !x && y
    await page.click(`${ED} .fsm-tab-btn`, { text: 'Try it' });
    await page.waitForSelector(`${ED} .fsm-sim`);
    const simState = (s) => page.waitFor((ed, x) => document.querySelector(`${ed} .fsm-sim-state`)?.textContent === x, [ED, s], { what: `simulated state ${s}` });
    const bit = (n) => page.click(`${ED} .fsm-bit[data-input=${n}]`);
    const step = () => page.click(`${ED} .fsm-sim-step`);
    await bit('x'); await step(); await simState('B');
    await step(); await simState('B');
    await bit('y'); await step(); await simState('A');
    await step(); await simState('B');
    await bit('x'); await step(); await simState('C');
  });
}

uiTest('#3764 FSM Properties: a state or a transition selected shows its own properties, no Machine section; nothing selected, the Machine', E, async (page) => {
  await makeProject(env, { name: 'FsmSel', files: { 'src/nt.fsm.json': JSON.stringify(machine('vhdl'), null, 2) } });
  await page.openProject('FsmSel');
  await page.eval(() => window.SilinxApp.openFsm('src/nt.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/nt.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
  const sections = () => page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-side > section`)].filter((s) => !s.hidden).map((s) => s.querySelector('h3')?.textContent), ED);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  for (const lang of ['en', 'pt']) {
    await setLang(lang);
    const T = lang === 'en' ? { m: 'Machine', s: 'State', t: 'Transition' } : { m: 'Máquina', s: 'Estado', t: 'Transição' };
    assert.deepEqual(await sections(), [T.m], `${lang}: nothing selected`);
    await page.click(`${ED} [data-state=b] .fsm-circle`);
    await page.waitFor((ed) => document.querySelector(`${ed} .fsm-sname`), [ED], { what: 'the state selected' });
    assert.deepEqual(await sections(), [T.s], `${lang}: a state`);
    await page.click(`${ED} [data-trans=t1] .fsm-label`);
    await page.waitFor((ed) => document.querySelector(`${ed} .fsm-cond`), [ED], { what: 'the transition selected' });
    assert.deepEqual(await sections(), [T.t], `${lang}: a transition`);
    await page.key('Escape');
    await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-cond`), [ED], { what: 'nothing selected' });
    assert.deepEqual(await sections(), [T.m], `${lang}: nothing selected again`);
  }
  await setLang('en');
});
