// UI: Verify Property (#3177, web/js/verify-props.js): a state diagram's ⋮ menu's Verify Property… asks for the property
// (never reaches a state, reaches a state, outputs never 1 together: the state or the 1-bit outputs shown for each) and
// the depth; Yosys's SAT solver in the page's worker; its messages in the console; a counterexample: its test bench
// (sim/verify_<module>.vhd: the drawing's HDL with the property, then the bench) written and simulated, SSim reporting
// the property; a property that holds: proved; a wrong one refused in the dialog; an ASM chart's ⋮ menu has it too;
// Portuguese. Both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';
const noWarnings = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);

// A -go-> B -go-> C -> A; x in A and C, y in B and C; D never entered
const XY = {
  version: 1, kind: 'fsm', name: 'xy', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'binary', style: '3process',
  inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'x', width: 1, default: '0' }, { name: 'y', width: 1, default: '0' }],
  states: [{ id: 's1', name: 'A', x: 100, y: 100, outputs: { x: '1' } }, { id: 's2', name: 'B', x: 300, y: 100, outputs: { y: '1' } },
    { id: 's3', name: 'C', x: 500, y: 100, outputs: { x: '1', y: '1' } }, { id: 's4', name: 'D', x: 300, y: 300, outputs: {} }],
  transitions: [{ id: 't1', from: 's1', to: 's2', cond: 'go' }, { id: 't2', from: 's2', to: 's3', cond: 'go' }, { id: 't3', from: 's3', to: 's1', cond: '' },
    { id: 't4', from: 's4', to: 's1', cond: '' }],
  initial: 's1',
};
const ASM = { version: 1, kind: 'asm', name: 'ctl', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'binary',
  inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'busy', width: 1, default: '0' }],
  nodes: [{ id: 'n1', type: 'state', name: 'IDLE', x: 100, y: 60, actions: [] }, { id: 'n2', type: 'state', name: 'RUN', x: 100, y: 260, actions: ['busy = 1'] }],
  edges: [{ id: 'e1', from: 'n1', to: 'n2', port: 'next' }, { id: 'e2', from: 'n2', to: 'n1', port: 'next' }] };

// the drawing's ⋮ menu's Verify Property…: its dialog
async function openDialog(page, ed = ED, label = 'Verify Property…') {
  await page.click(`${ed} .tb-more-btn`);
  await page.click(`${ed} .asm-btn`, { text: label });
  await page.waitDialog();
  return page.eval(() => {
    const d = [...document.querySelectorAll('.dlg-overlay')].pop();
    const shown = (el) => !el.closest('[hidden]');
    return { title: d.querySelector('.dlg-title span').textContent, labels: [...d.querySelectorAll('.dlg-body p, .dlg-body label')].filter(shown).map((l) => l.textContent.trim()),
      kinds: [...d.querySelectorAll('select')[0].options].map((o) => o.textContent), states: [...d.querySelectorAll('select')[1].options].map((o) => o.value),
      buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent) };
  });
}
// the dialog's fields set: the property, its state or its outputs
const setDialog = (page, kind, { state, outputs = [] } = {}) => page.eval((k, s, o) => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  const [kind, st] = d.querySelectorAll('select');
  kind.value = k; kind.dispatchEvent(new Event('change'));
  if (s) st.value = s;
  for (const b of d.querySelectorAll('input[type=checkbox]')) b.checked = o.includes(b.value);
}, kind, state, outputs);
const lines = (page, from) => page.eval((f) => { const l = window.__console().split('\n'); return l.slice(l.lastIndexOf(f)); }, from);

uiTest('#3177 Verify Property: a state diagram\'s outputs both 1 found and replayed in SSim, a state never reached proved, an ASM chart\'s menu; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PropUi', top: 'xy', files: { 'src/xy.fsm.json': JSON.stringify(XY, null, 2), 'src/ctl.asm.json': JSON.stringify(ASM, null, 2) } });
  await page.openProject('PropUi');
  await page.eval(() => window.SilinxApp.openFsm('src/xy.fsm.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/xy.fsm.json' && document.querySelector(ed), [ED], { what: 'state diagram editor' });
  const dlg = await openDialog(page);
  assert.deepEqual(dlg, { title: 'Verify Property', labels: ['Proves a property of the state machine for every input sequence, or shows the first clock cycle where it fails.', 'Property:', 'State:', 'Depth (clock cycles):'],
    kinds: ['Never reaches a state', 'Reaches a state', 'Outputs never 1 together'], states: ['A', 'B', 'C', 'D'], buttons: ['Verify', 'Cancel'] });
  // (one output only: refused, the dialog stays)
  await setDialog(page, 'exclusive', { outputs: ['x'] });
  assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-body label')].filter((l) => !l.closest('[hidden]')).map((l) => l.textContent.trim())),
    ['Property:', 'Outputs (1 bit):', 'x', 'y', 'Depth (clock cycles):']);
  await page.click('.dlg-buttons .btn.primary');
  await page.waitFor(() => /the property 'exclusive' needs two 1-bit outputs or more/.test(document.body.textContent), [], { what: 'the refusal' });
  await setDialog(page, 'exclusive', { outputs: ['x', 'y'] });
  await page.click('.dlg-buttons .btn.primary');
  await page.waitConsole(/Process "Verify Property" failed/, { timeout: 60000 });
  assert.deepEqual((await lines(page, 'Started : "Verify Property".')).slice(0, 7), ['Started : "Verify Property".', '',
    'Proving that \'xy\' never has x and y both 1: Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.',
    'ERROR:Verify - \'xy\' has x and y both 1 at clock cycle 3.',
    'The counterexample\'s test bench: sim/verify_xy.vhd (it replays the 3 clock cycle(s) in the simulator).', '',
    'Process "Verify Property" failed']);
  assert.match(await readWs(env, 'PropUi', 'sim/verify_xy.vhd'), /^-- Counterexample of Verify \(Silinx\): 'xy' has x and y both 1 at clock cycle 3\.\n/);
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'isim:verify_xy'), [], { what: 'SSim on verify_xy', timeout: 60000 });
  await page.waitConsole(/xy has two of x, y 1 together/, { timeout: 60000 });
  // a state never entered: proved
  await page.eval(() => window.SilinxApp.openFsm('src/xy.fsm.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/xy.fsm.json' && document.querySelector(ed), [ED]);
  await openDialog(page);
  await setDialog(page, 'never', { state: 'D' });
  await page.click('.dlg-buttons .btn.primary');
  await page.waitConsole(/Proved: 'xy' never reaches state D, for every input sequence \(by induction over 1 clock cycle\(s\)\)\.\n\nProcess "Verify Property" completed successfully/, { timeout: 60000 });
  // the ASM chart's menu: its states
  await page.eval(() => window.SilinxApp.openAsm('src/ctl.asm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctl.asm.json' && document.querySelector('.doc:not([hidden]) [data-node]'), [], { what: 'ASM chart editor' });
  const asm = await openDialog(page, '.doc:not([hidden]) .asm-editor');
  assert.deepEqual([asm.title, asm.states], ['Verify Property', ['IDLE', 'RUN']]);
  await page.click('.dlg-buttons .btn', { text: 'Cancel' });
  await page.waitNoDialog();
  // Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  const pt = await openDialog(page, '.doc:not([hidden]) .asm-editor', 'Verificar Propriedade…');
  assert.deepEqual([pt.title, pt.labels, pt.kinds, pt.buttons], ['Verificar Propriedade', ['Prova uma propriedade da máquina de estados para qualquer sequência de entradas, ou mostra o primeiro ciclo de relógio em que falha.', 'Propriedade:', 'Estado:', 'Profundidade (ciclos de relógio):'],
    ['Nunca alcança um estado', 'Alcança um estado', 'Saídas nunca a 1 em simultâneo'], ['Verificar', 'Cancelar']]);
  await page.click('.dlg-buttons .btn', { text: 'Cancelar' });
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  noWarnings(page);
}, { timeout: 180000 });
