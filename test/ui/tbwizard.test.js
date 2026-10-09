// UI: Test Bench Wizard. A combinational adder tested exhaustively with the expected values filled in
// from the current design (TEST PASSED in ISim), then one expected value changed by hand (TEST
// FAILED, the vector reported); a sequential counter with clock and reset, vectors typed in.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ADDER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity adder is
  port (a, b : in std_logic_vector(1 downto 0); cin : in std_logic; s : out std_logic_vector(1 downto 0); cout : out std_logic);
end adder;
architecture rtl of adder is
  signal t : unsigned(2 downto 0);
begin
  t <= resize(unsigned(a), 3) + resize(unsigned(b), 3) + ("00" & cin);
  s <= std_logic_vector(t(1 downto 0));
  cout <= t(2);
end rtl;
`;
const COUNTER = `module counter(input clk, input rst, input en, output reg [2:0] q);
  always @(posedge clk) if (rst) q <= 0; else if (en) q <= q + 1;
endmodule
`;

// New Source ▸ Test Bench (Wizard): file name, Finish -> the Test Bench Wizard opens with that name
const openTbw = async (page, name) => {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => /^\s*Test Bench \(Wizard\)\s*$/.test(e.textContent)); r.scrollIntoView(); r.click(); });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton('Finish');
  await page.waitDialog('Test Bench Wizard');
};

// next page of the wizard (the primary button) and wait for page `title`
const next = async (page, title) => {
  await page.dialogButton(title === null ? 'Finish' : 'Next >');
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `wizard page ${title}` });
};
// run the simulation of the simulation top to the end; the ISim console text
const simulateAll = async (page, tb) => {
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', tb);
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 20000, what: 'ISim ready' });
  await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
  await page.key('Enter');
  return page.waitFor(() => { const t = document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''; return /TEST (PASSED|FAILED)/.test(t) ? t : null; }, [], { timeout: 30000, what: 'TEST PASSED / FAILED' });
};

uiTest('Test Bench Wizard: exhaustive test of a combinational adder, expected values from the design; a changed value fails', E, async (page) => {
  await makeProject(env, { name: 'TbwAdd', top: 'adder', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('TbwAdd');
  await openTbw(page, 'tb_adder');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main input[type=text]').value), 'tb_adder');
  await next(page, 'Clock and Reset');
  // no clock: combinational
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay select')[0].value), '');
  await next(page, 'Input Vectors');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .tbw-modes').textContent), /5 input bit\(s\): 32 vector/);
  await next(page, 'Vectors and Expected Outputs');
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .tbw-table tr').length), 33);
  await page.click('.dlg-overlay .btn', { text: 'Fill Expected from Current Design' });
  await page.waitFor(() => /filled in from the current design/.test(document.querySelector('.dlg-overlay').textContent));
  // vector 7: a=00 b=11 cin=1 -> s=00 cout=1
  const row7 = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .tbw-table tr')][8].querySelectorAll('input'));
  assert.ok(row7 !== undefined);
  const vals = await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay .tbw-table tr')][8].querySelectorAll('input')].map((i) => i.value));
  assert.deepEqual(vals, ['00', '11', '1', '00', '1']);
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay pre').textContent), /Vectors: 32[\s\S]*Expected values: 32 vector/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => (window.Silinx.view === 'sim' && window.Silinx.sel?.module === 'tb_adder') && window.Silinx.project.files.some((f) => f.path === 'sim/tb_adder.vhd' && f.role === 'sim'));
  assert.match(await readWs(env, 'TbwAdd', 'sim/tb_adder.vhd'), /constant VEXP/);
  assert.match(await simulateAll(page, 'tb_adder'), /TEST PASSED: 32 vector/);
});

uiTest('Test Bench Wizard: sequential counter (Verilog) with clock and reset, vectors typed in; a wrong expected value is reported', E, async (page) => {
  await makeProject(env, { name: 'TbwCnt', top: 'counter', files: { 'src/counter.v': COUNTER } });
  await page.openProject('TbwCnt');
  await openTbw(page, 'tb_counter');
  await next(page, 'Clock and Reset');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay select')].slice(0, 2).map((s) => s.value)), ['clk', 'rst']);
  await next(page, 'Input Vectors');
  await page.click('.dlg-overlay input[name=tbw-mode][value=manual]');
  await next(page, 'Vectors and Expected Outputs');
  // en=1, 1, 0, 1 -> q = 1, 2, 2, 3 (the third expected value is wrong: 5)
  const add = () => page.click('.dlg-overlay .btn', { text: 'Add Vector' });
  await add(); await add(); await add();
  const plan = [['1', '1'], ['1', '2'], ['0', 'd5'], ['1', '3']];
  for (const [k, [en, q]] of plan.entries()) {
    await page.fill('.dlg-overlay .tbw-in[data-port=en]', en, { index: k });
    await page.fill('.dlg-overlay .tbw-exp[data-port=q]', q, { index: k });
  }
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay pre').textContent), /Clock: clk, 20 ns[\s\S]*Reset: rst, active '1'[\s\S]*Vectors: 4/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => (window.Silinx.view === 'sim' && window.Silinx.sel?.module === 'tb_counter'));
  const out = await simulateAll(page, 'tb_counter');
  assert.match(out, /vector 2: en=0 -> expected 101, got 010/);
  assert.match(out, /TEST FAILED: 1 of 4/);
});

uiTest('New Source ▸ Test Bench (HDL) in VHDL and in Verilog, Module (HDL) in Verilog: files registered, extension follows the language, test bench is the simulation top', E, async (page) => {
  await makeProject(env, { name: 'TbwNs', top: 'adder', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('TbwNs');
  const newSource = async (type, name, lang) => {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source Wizard');
    await page.eval((t) => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.textContent.trim().endsWith(t)); r.scrollIntoView(); r.click(); }, type);
    await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
    await page.dialogButton('Next >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main select'));
    await page.eval((l) => { const sel = [...document.querySelectorAll('.dlg-overlay .wiz-main select')].find((x) => [...x.options].some((o) => o.value === 'verilog')); sel.value = l; sel.dispatchEvent(new Event('change', { bubbles: true })); }, lang);
    if (type === 'Module (HDL)') assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main input[type=text]')].find((i) => i.value === 'Behavioral').style.display), lang === 'vhdl' ? '' : 'none');
    await page.dialogButton('Next >');
    assert.match(await page.eval(() => document.querySelector('.dlg-overlay pre').textContent), new RegExp(`Source Name: ${name}\\.${lang === 'vhdl' ? 'vhd' : 'v'}`));
    await page.dialogButton('Finish');
    await page.waitNoDialog();
  };
  await newSource('Test Bench (HDL)', 'tb_skel', 'vhdl');
  await page.waitFor(() => (window.Silinx.view === 'sim' && window.Silinx.sel?.module === 'tb_skel') && window.Silinx.project.files.some((f) => f.path === 'sim/tb_skel.vhd' && f.role === 'sim'), [], { what: 'tb_skel registered' });
  const pj = JSON.parse(await readWs(env, 'TbwNs', 'silinx.json'));
  assert.ok(pj.files.some((f) => f.path === 'sim/tb_skel.vhd' && f.role === 'sim'), JSON.stringify(pj.files));
  await newSource('Test Bench (HDL)', 'tb_skel_v', 'verilog');
  await page.waitFor(() => (window.Silinx.view === 'sim' && window.Silinx.sel?.module === 'tb_skel_v') && window.Silinx.project.files.some((f) => f.path === 'sim/tb_skel_v.v' && f.role === 'sim'), [], { what: 'tb_skel_v registered' });
  assert.match(await readWs(env, 'TbwNs', 'sim/tb_skel_v.v'), /module tb_skel_v;/);
  await newSource('Module (HDL)', 'blk', 'verilog');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/blk.v' && f.role === 'design'), [], { what: 'src/blk.v registered' });
  assert.match(await readWs(env, 'TbwNs', 'src/blk.v'), /module blk/);
  // no simulation top: the new test bench is selected in the Simulation view (Simulate runs it), and
  // neither the Project menu nor the right-click menu offers a "simulation top"
  assert.equal(await page.eval(() => document.querySelector('#hier .row.sel .lbl')?.textContent), 'tb_skel_v');
  const simItems = await page.openMenu('Project');
  assert.ok(!simItems.some((i) => /Top/.test(i.label)), simItems.map((i) => i.label).join(' | '));
  await page.key('Escape');
  await page.rightClick('#hier .row.sel');
  await page.waitForSelector('body > .menu-popup');
  assert.doesNotMatch(await page.eval(() => document.querySelector('body > .menu-popup').innerText), /Simulation Top|Top Module/);
  await page.key('Escape');
  await page.click('input[name=view][value=impl]');
  // the Project menu has no separate test bench wizard entry any more
  const items = await page.openMenu('Project');
  assert.ok(!items.some((i) => /Test Bench/.test(i.label)), items.map((i) => i.label).join(' | '));
  await page.key('Escape');
});

uiTest('Test Bench Wizard: "No vectors" makes a skeleton (clock, reset, the module): the vectors page is skipped, the bench simulates', E, async (page) => {
  await makeProject(env, { name: 'TbwNone', top: 'counter', files: { 'src/counter.v': COUNTER } });
  await page.openProject('TbwNone');
  await openTbw(page, 'tb_counter');
  await next(page, 'Clock and Reset');
  await next(page, 'Input Vectors');
  await page.click('.dlg-overlay input[name=tbw-mode][value=none]');
  // the next page is the Summary: no vector table
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay pre').textContent), /Vectors: none/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.view === 'sim' && window.Silinx.sel?.module === 'tb_counter', [], { what: 'tb_counter selected in the Simulation view' });
  const text = await readWs(env, 'TbwNone', 'sim/tb_counter.vhd');
  assert.match(text, /stimulus: set the inputs, wait, check the outputs/);
  assert.doesNotMatch(text, /VIN/);
  assert.match(text, /clk <= '1'; wait for CLK_PERIOD \/ 2;/);
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 20000, what: 'ISim ready' });
  await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
  await page.key('Enter');
  await page.waitFor(() => /Simulation finished/.test(document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''), [], { timeout: 30000, what: 'Simulation finished' });
});
