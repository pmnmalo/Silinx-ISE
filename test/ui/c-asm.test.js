// UI (#1575): a sequential C module's state machine as an ASM chart, read-only: its Design row's [ASM] badge (between
// the C and its HDL; none for a combinational one) and its process open the chart made from the C (its states and
// decisions drawn), nothing in it can be edited (no tools, a box not moved nor deleted, its properties disabled);
// Portuguese; both interfaces. No warnings. A free-running module's (ap_ctrl_none, #1927): IDLE going on at once, its
// inputs and outputs the module's ports (no ap_start, ap_done, ap_idle, ap_ready).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const GCD = `unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    unsigned t = b;
    b = a >= b ? a - b : b - a;
    a = t;
    if (b > a) { t = a; a = b; b = t; }
  }
  return a;
}
`;
const ADD = 'int add(int a, int b) { return a + b; }\n';
const row = (page, name) => page.eval((n) => {
  const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent.trim() === n);
  return r ? [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`) : null;
}, name);

uiTest('#1575 a sequential C module\'s ASM chart, read-only: its [ASM] badge and process, its states and decisions, nothing edited; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CAsm', top: 'gcd', files: { 'src/gcd.c': GCD, 'src/add.c': ADD } });
  await page.openProject('CAsm');
  await page.leftTab('design');
  await page.waitFor(() => ['gcd', 'add'].every((n) => window.SilinxApp.S.modules.some((m) => m.name === n)), [], { what: 'the modules' });
  assert.deepEqual(await row(page, 'gcd'), ['C*', 'ASM', 'VHDL']);
  assert.deepEqual(await row(page, 'add'), ['C*', 'VHDL']);
  await page.click('#hier .row .badge', { text: 'ASM' });
  await page.waitFor(() => window.Silinx.active?.id === 'casm:src/gcd.c' && window.Silinx.active.asmEditor, [], { what: 'the ASM chart' });
  const view = await page.eval(() => {
    const el = document.querySelector('.doc:not([hidden])');
    const texts = [...el.querySelectorAll('.asm-nodes text')].map((t) => t.textContent);
    const shown = (b) => !b.hidden && b.getClientRects().length > 0;
    return {
      banner: el.querySelector('.gen-banner')?.textContent,
      states: ['IDLE', 'S1', 'S2', 'S3', 'DONE'].filter((n) => texts.includes(n)),
      decisions: ['ap_start', 'b != 0', 'b > a'].filter((c) => texts.some((t) => t.includes(c))),
      tools: [...el.querySelectorAll('.asm-toolbar .asm-btn, .asm-toolbar select')].filter(shown).map((b) => b.textContent.trim()).filter(Boolean),
      readOnly: el.querySelector('.asm-editor').classList.contains('asm-readonly'),
    };
  });
  assert.equal(view.banner, 'Read-only, the state machine made from gcd.c');
  assert.deepEqual(view.states, ['IDLE', 'S1', 'S2', 'S3', 'DONE']);
  assert.deepEqual(view.decisions, ['ap_start', 'b != 0', 'b > a']);
  assert.equal(view.readOnly, true);
  for (const t of ['State', 'Decision', '✕', 'Arrange', '✓ Validate', '</> Code']) assert.ok(!view.tools.some((x) => x.endsWith(t)), `${t}: ${view.tools.join(', ')}`);
  // a box selected: its properties shown, disabled; Delete and a drag change nothing
  const before0 = await page.eval(() => JSON.stringify(window.Silinx.active.asmEditor.getModel()));
  const box = await page.eval(() => { const g = [...document.querySelectorAll('.doc:not([hidden]) .asm-nodes [data-node]')].find((x) => x.textContent.includes('S2')); const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.drag(box, { x: box.x + 120, y: box.y + 60 });
  await page.eval(() => document.querySelector('.doc:not([hidden]) .asm-editor').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
  assert.equal(await page.eval(() => JSON.stringify(window.Silinx.active.asmEditor.getModel())), before0);
  assert.ok(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .asm-side input, .doc:not([hidden]) .asm-side textarea')].every((x) => x.disabled)));
  // its process
  await page.treeRow('#hier', 'gcd');
  await page.treeRow('#procs', 'View State Machine (ASM)', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'casm:src/gcd.c');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .gen-banner')?.textContent === 'Só de leitura, a máquina de estados feita de gcd.c', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

const FREE = `#include "hls_stream.h"
void sums(hls::stream<int> &in, hls::stream<int> &out) {
#pragma HLS INTERFACE ap_ctrl_none port=return
  int s = 0;
  for (int i = 0; i < 3; i++) s += in.read();
  out.write(s);
}
`;

uiTest('#1927 the ASM chart of a free-running C module (ap_ctrl_none): no ap_start decision, IDLE and DONE setting nothing, its inputs and outputs the module\'s ports', E, async (page) => {
  await makeProject(env, { name: 'CAsmFree', top: 'sums', files: { 'src/sums.cpp': FREE } });
  await page.openProject('CAsmFree');
  await page.leftTab('design');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'sums'), [], { what: 'the module' });
  assert.deepEqual(await row(page, 'sums'), ['C++*', 'ASM', 'VHDL']);
  await page.click('#hier .row .badge', { text: 'ASM' });
  await page.waitFor(() => window.Silinx.active?.id === 'casm:src/sums.cpp' && window.Silinx.active.asmEditor, [], { what: 'the ASM chart' });
  const view = await page.eval(() => {
    const el = document.querySelector('.doc:not([hidden])');
    const texts = [...el.querySelectorAll('.asm-nodes text')].map((t) => t.textContent);
    const m = window.Silinx.active.asmEditor.getModel();
    return {
      banner: el.querySelector('.gen-banner')?.textContent,
      states: ['IDLE', 'S1', 'S7', 'DONE'].filter((n) => texts.includes(n)),
      protocol: texts.filter((t) => /\bap_(start|done|idle|ready)\b/.test(t)),
      decisions: ['i < 3'].filter((c) => texts.some((t) => t.includes(c))),
      inputs: m.inputs.map((p) => p.name), outputs: m.outputs.map((p) => p.name),
      readOnly: el.querySelector('.asm-editor').classList.contains('asm-readonly'),
    };
  });
  assert.deepEqual(view, {
    banner: 'Read-only, the state machine made from sums.cpp', states: ['IDLE', 'S1', 'S7', 'DONE'], protocol: [], decisions: ['i < 3'],
    inputs: ['in_r_dout', 'in_r_empty_n', 'out_r_full_n'], outputs: ['in_r_read', 'out_r_din', 'out_r_write'], readOnly: true,
  });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
