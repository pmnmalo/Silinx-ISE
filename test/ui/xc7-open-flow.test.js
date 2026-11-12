// UI: the Silinx toolchain on the Artix-7 (#3146, experimental): Design Properties offers AMD Vivado (the default) or
// Silinx as the Basys 3's synthesis tool; Silinx chosen, the process tree is the toolchain's 7-series back end (Yosys,
// nextpnr's Place & Route, the static timing, the programming file, Emulate on Board (#3704); no simulation model, no view), Generate
// Programming File runs it from HDL to build/top.bit with no warning, and the Design Summary says the timing is nextpnr's
// estimate and lists the routed design's FASM; in Portuguese, the choices translated. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'module top(input clk, input [3:0] sw, output reg [7:0] led);\n  always @(posedge clk) led <= led + sw;\nendmodule\n';
const XDC = `set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}]
${['V17', 'V16', 'W16', 'W17'].map((p, i) => `set_property -dict { PACKAGE_PIN ${p} IOSTANDARD LVCMOS33 } [get_ports {sw[${i}]}]`).join('\n')}
${['U16', 'E19', 'U19', 'V19', 'W18', 'U15', 'U14', 'V14'].map((p, i) => `set_property -dict { PACKAGE_PIN ${p} IOSTANDARD LVCMOS33 } [get_ports {led[${i}]}]`).join('\n')}
create_clock -add -name clk -period 10.000 -waveform {0.000 5.000} [get_ports {clk}]
`;
// the Design Properties dialog's synthesis tool: its choices, the one chosen, whether it is locked
const synthField = (page, label = 'Synthesis Tool:') => page.eval(l => {
  const s = [...document.querySelectorAll('.dlg-overlay label')].find(x => x.textContent === l).nextElementSibling;
  return { options: [...s.options].map(o => [o.value, o.textContent]), value: s.value, disabled: s.disabled };
}, label);
const procLabels = page => page.eval(() => [...document.querySelectorAll('#procs .row')].map(x => x.textContent.trim().replace(/^▾/, '')));

uiTest('#3146 Design Properties: the Basys 3\'s synthesis tool, Vivado or Silinx; Silinx\'s 7-series flow from HDL to the .bit, nextpnr\'s timing in the summary', E, async (page) => {
  await makeProject(env, { name: 'Xc7Open', board: 'basys3', files: { 'src/top.v': TOP, 'constraints/top.xdc': XDC }, top: 'top', constraints: 'constraints/top.xdc' });
  await page.openProject('Xc7Open');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  const f = await synthField(page);
  assert.deepEqual(f, { options: [['vivado', 'Vivado (VHDL/Verilog; AMD Vivado 2025.2)'], ['silinx', 'Silinx (VHDL/Verilog; no Vivado needed; on trial)']], value: 'vivado', disabled: false });
  await page.eval(() => {
    const s = [...document.querySelectorAll('.dlg-overlay label')].find(x => x.textContent === 'Synthesis Tool:').nextElementSibling;
    s.value = 'silinx'; s.dispatchEvent(new Event('change'));
  });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.synthTool === 'silinx', [], { what: 'the project\'s synthesis tool Silinx' });

  // the processes: the toolchain's 7-series back end's
  await page.setView('impl');
  await page.treeRow('#hier', 'top');
  const labels = await procLabels(page);
  for (const present of ['User Constraints', 'Synthesize - Yosys', 'View RTL Schematic', 'Check Syntax', 'Implement Design', 'Translate', 'Place & Route', 'Generate Post-Place & Route Static Timing', 'Generate Programming File', 'Configure Target Device'])
    assert.ok(labels.includes(present), `${present}: ${labels}`);
  for (const absent of ['Synthesize - Vivado', 'Synthesize - XST', 'Map', 'View Technology Schematic', 'Generate Post-Synthesis Simulation Model', 'Generate Text Power Report', 'View Implemented Design (FPGA)'])
    assert.ok(!labels.some(l => l.startsWith(absent)), `${absent}: ${labels}`);
  // Emulate on Board (#3704): the HDL on the board's pins; its RTL model only (the flow makes no simulation model)
  for (const present of ['Emulate on Board', 'Emulate Behavioral Model (RTL)']) assert.ok(labels.includes(present), `${present}: ${labels}`);
  assert.ok(!labels.some(l => /^Emulate Post-/.test(l)), String(labels));

  // Generate Programming File: Yosys, nextpnr, the .bit from its FASM; no warning
  await page.eval(async () => (await import('/js/implement.js')).runImpl('top', ['synth', 'translate', 'map', 'par', 'bitgen']));
  await page.waitConsole(/Process "Generate Programming File" completed successfully/, { timeout: 300000 });
  const text = await page.consoleText();
  assert.deepEqual(text.split('\n').filter(l => /WARNING|ERROR/.test(l)), []);
  assert.match(text, /Bitstream: build\/top\.bit \(\d+ bytes, from nextpnr's FASM on Project X-Ray's database\)/);
  assert.match(text, /Clock clk: [\d.]+ MHz \(met, 100 MHz asked; nextpnr's estimate\)/);
  assert.ok((await readWs(env, 'Xc7Open', 'build/open/routed.fasm')).length > 0);

  // the Design Summary: the timing nextpnr's estimate, the routed design's FASM among the reports
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => /nextpnr's estimate/.test(document.querySelector('.doc:not([hidden])')?.textContent || ''), [], { what: 'the summary\'s timing' });
  const summary = await page.eval(() => document.querySelector('.doc:not([hidden])').textContent);
  assert.match(summary, /Timing \(post Place & Route, nextpnr's estimate: optimistic against Vivado\)/);
  assert.match(summary, /Routed Design \(FASM\)/);
  assert.ok(!/Routed Design \(XDL\)/.test(summary));
});

uiTest('#3146 in Portuguese: the Artix-7\'s synthesis tools translated, a new project\'s AMD Vivado', E, async (page) => {
  await makeProject(env, { name: 'Xc7OpenPt', board: 'basys3', files: { 'src/top.v': TOP }, top: 'top' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.openProject('Xc7OpenPt');
    await page.menu('Projeto', 'Propriedades do Projeto…');
    await page.waitDialog('Propriedades do Projeto');
    const f = await synthField(page, 'Ferramenta de Síntese:');
    assert.deepEqual(f, { options: [['vivado', 'Vivado (VHDL/Verilog; AMD Vivado 2025.2)'], ['silinx', 'Silinx (VHDL/Verilog; sem o Vivado; em ensaio)']], value: 'vivado', disabled: false });
    await page.dialogButton('Cancelar');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
