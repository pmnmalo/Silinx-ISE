// UI: a state's and a transition's outputs in the FSM editor's Properties, a table of the machine's outputs (#3814): in
// the app, a value typed in a state's table and in a transition's (the machine Mealy), a value too wide refused (the
// console's warning, the value in force shown again), one cleared; the diagram saved as the Outputs text box saved it
// (core/fsm.js parseOutputs) and its HDL the same as from those values (VHDL and Verilog: compiled, elaborated, no
// warnings), the machine's Check with no problem.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm, parseOutputs, generateFsm } from '../../core/fsm.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

// A (initial) --x--> B (z=1) --!x--> A
const machine = (lang) => normalizeFsm({
  name: 'ov', lang, inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }, { name: 'n', width: 2, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 120, y: 160, outputs: {} }, { id: 'b', name: 'B', x: 360, y: 160, outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }, { id: 't2', from: 'b', to: 'a', cond: '!x' }], initial: 'a',
});

for (const lang of ['vhdl', 'verilog']) {
  const pj = `FsmOuts${lang}`, hdl = `src/ov.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#3814 FSM: a state's and a transition's outputs set in their tables, a value refused in the console, the ${lang === 'vhdl' ? 'VHDL' : 'Verilog'} as from the text box`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/ov.fsm.json': JSON.stringify(machine(lang), null, 2) } });
    await page.openProject(pj);
    await page.eval(() => window.SilinxApp.openFsm('src/ov.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/ov.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
    const rows = () => page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-outvals tr`)].map((tr) => [...tr.children].map((c) => c.querySelector('input')?.value ?? c.textContent)), ED);
    const outs = () => page.eval(() => { const m = window.Silinx.active.fsmEditor.getModel(); return [m.states.map((s) => s.outputs), m.transitions.map((t) => t.outputs)]; });

    // ---- the state B: its table (every output, its value), n given 3, z given 2 (refused), z then cleared
    await page.click(`${ED} [data-state=b] .fsm-circle`);
    await page.waitForSelector(`${ED} .fsm-outvals.souts`);
    assert.deepEqual(await rows(), [['Name', 'Width', 'Value'], ['z', '1', '1'], ['n', '2', '']]);
    await page.fill(`${ED} input[data-key="souts:n"]`, '3');
    await page.fill(`${ED} input[data-key="souts:z"]`, '2');
    const want = `WARNING: src/ov.fsm.json: State B: the value 2 of z does not fit in 1 bit(s) (not applied)`;
    await page.waitFor((w) => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent === w), [want], { what: 'the warning' });
    assert.deepEqual(await rows(), [['Name', 'Width', 'Value'], ['z', '1', '1'], ['n', '2', '3']]);
    assert.deepEqual(await outs(), [[{}, { z: '1', n: '3' }], [{}, {}]]);
    // ---- the transition A → B: n given 2 (the machine Mealy); the state A's z cleared (nothing to clear: the same)
    await page.click(`${ED} [data-trans=t1] .fsm-label`);
    await page.waitForSelector(`${ED} .fsm-outvals.touts`);
    await page.fill(`${ED} input[data-key="touts:n"]`, '2');
    assert.deepEqual(await outs(), [[{}, { z: '1', n: '3' }], [{ n: '2' }, {}]]);
    await page.click(`${ED} [data-state=a] .fsm-circle`);
    await page.waitForSelector(`${ED} .fsm-outvals.souts`);
    await page.fill(`${ED} input[data-key="souts:z"]`, '');
    assert.deepEqual(await outs(), [[{}, { z: '1', n: '3' }], [{ n: '2' }, {}]]);
    // (the console: that warning only)
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.err')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t))), [want]);

    // ---- saved as the text box saved it, its HDL the same as from those values, compiled and elaborated with no warnings
    const ref = machine(lang);
    ref.states[1].outputs = parseOutputs('z=1, n=3', ref.outputs).outputs;
    ref.transitions[0].outputs = parseOutputs('n=2', ref.outputs).outputs;
    const code = await page.waitFor(async (p, h) => {
      const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fov.fsm.json`)).json();
      const c = await (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`)).text();
      return m.transitions[0].outputs?.n === '2' && /Mealy/.test(c) && c;
    }, [pj, hdl], { what: 'the diagram and its HDL saved', timeout: 15000 });
    const file = JSON.parse(await page.eval(async (p) => (await fetch(`/api/projects/${p}/file?path=src%2Fov.fsm.json`)).text(), pj));
    assert.deepEqual([file.states.map((s) => s.outputs), file.transitions.map((t) => t.outputs)], [[{}, { z: '1', n: '3' }], [{ n: '2' }, {}]]);
    assert.equal(code, generateFsm(ref, lang).code);
    const lib = compile([{ path: hdl.slice(4), lang, text: code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(elaborate(lib, 'ov').diags.map((e) => `${e.severity}: ${e.message}`), [], lang);
    // (the console's Warnings: the value refused; no problem of the machine's Check)
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent)),
      ['WARNING:Silinx - src/ov.fsm.json: State B: the value 2 of z does not fit in 1 bit(s) (not applied)']);
  });
}
