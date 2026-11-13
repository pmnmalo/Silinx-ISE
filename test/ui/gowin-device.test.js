// UI: a Gowin device in the interface (#2303): the picker with its speed grade and the synthesis locked, the processes of its
// toolchain only (Configure Target Device its SRAM's, #2298: test/ui/program-open.test.js; Emulate on Board, #3704), its constraints CST (read, written, checked), Generate Programming File
// to its .fs (gowin_pack, Silinx's port) in the server's real flow and the Design Summary's programming file and reports, in
// English and Portuguese; the Tang Nano 9K's pins written as a CST by Update Constraints.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const DEVICE = { family: 'gowin', part: 'gw1nr-9c', package: 'qn88', speed: '-6' };
const PINS = 'IO_LOC "clk" 52;\nIO_LOC "led[0]" 10;\nIO_LOC "led[1]" 11;\n// create_clock -name clk -period 37.037 [get_ports {clk}]\n';

uiTest('#2303 Design Properties: the Gowin GW1N, its part and speed grade, its synthesis locked', E, async (page) => {
  await makeProject(env, { name: 'GowinPick', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: { 'src/blinky.v': BLINKY }, top: 'blinky' });
  await page.openProject('GowinPick');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  const state = await page.eval(() => {
    const sel = (l) => [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === l).nextElementSibling;
    const fam = sel('Family:'); fam.value = 'gowin'; fam.dispatchEvent(new Event('change'));
    return { part: sel('Device:').value, speeds: [...sel('Speed:').options].map((o) => o.value), synth: sel('Synthesis Tool:').value, synthOff: sel('Synthesis Tool:').disabled,
      family: [...fam.options].at(-1).textContent };
  });
  assert.deepEqual(state, { part: 'gw1nr-9c', speeds: ['-6'], synth: 'silinx', synthOff: true, family: 'Gowin GW1N' });
  await page.dialogButton('Cancel');
});

uiTest('#2303 a Gowin project: its processes, its constraints CST, Generate Programming File to its .fs, the Design Summary; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'GowinRun', board: 'tangnano9k', device: DEVICE, files: { 'src/blinky.v': BLINKY, 'constraints/top.cst': PINS }, top: 'blinky', constraints: 'constraints/top.cst', synthTool: 'silinx' });
  await page.openProject('GowinRun');
  const r = await page.eval(async () => {
    const { cstDiagnostics, readPins, writePins, constraintsExt } = await import('/js/constraints-format.js');
    const device = { part: 'gw1nr-9c' }, ports = [{ name: 'clk', width: 1 }, { name: 'led', width: 2, msb: 1, lsb: 0 }];
    const read = readPins(device, 'IO_LOC "clk" 52;\nIO_LOC "led[1]" 11;\nIO_PORT "led[1]" IO_TYPE=LVCMOS18;\n// create_clock -name clk -period 37.037 [get_ports {clk}]\n');
    return {
      ext: constraintsExt(device), assigned: read.assignments, period: read.clocks[0].period,
      written: writePins(device, { assignments: read.assignments, clocks: read.clocks, header: 'H' }),
      good: cstDiagnostics(PINS_TEXT(), ports),
      bad: cstDiagnostics('IO_LOC "clk" 52;\nINS_LOC "x" R1C1;\n', ports),
      unknown: cstDiagnostics('IO_LOC "nope" 52;\n', ports),
    };
    function PINS_TEXT() { return 'IO_LOC "clk" 52;\nIO_LOC "led[0]" 10;\n'; }
  });
  assert.equal(r.ext, '.cst');
  assert.deepEqual(r.assigned, { clk: { loc: '52' }, 'led<1>': { loc: '11', iostandard: 'LVCMOS18' } });
  assert.equal(r.period, 37.037);
  assert.equal(r.written, '// H\nIO_LOC "clk" 52;\nIO_LOC "led[1]" 11;\nIO_PORT "led[1]" IO_TYPE=LVCMOS18;\n// create_clock -name clk -period 37.037 [get_ports {clk}]\n');
  assert.deepEqual(r.good, []);
  assert.deepEqual(r.bad, [{ severity: 'error', line: 2, message: 'INS_LOC: not a CST statement nextpnr-himbaechel-gowin applies (IO_LOC, IO_PORT)' }]);
  assert.deepEqual(r.unknown, [{ severity: 'warning', message: 'IO_LOC nope: the top has no such port', line: 1 }]);

  await page.setView('impl');
  await page.treeRow('#hier', 'blinky');
  const labels = await page.eval(() => [...document.querySelectorAll('#procs .row')].map((x) => x.textContent.trim().replace(/^▾/, '')));
  assert.ok(labels.includes('Implement Design') && labels.includes('Generate Programming File'), String(labels));
  assert.ok(!labels.includes('Map'), String(labels));
  assert.ok(labels.includes('Configure Target Device'), String(labels));   // (#2298)
  // Emulate on Board (#3704): the HDL on the board's pins; its RTL model only (the flow makes no simulation model)
  for (const present of ['Emulate on Board', 'Emulate Behavioral Model (RTL)']) assert.ok(labels.includes(present), `${present}: ${labels}`);
  assert.ok(!labels.some((l) => /^Emulate Post-/.test(l)), String(labels));

  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/Process "Generate Programming File" (completed successfully|failed)/, { timeout: 120000 }).catch(async (e) => { throw new Error(`${e.message}\n${(await page.consoleText()).slice(-2500)}`); });
  const text = await page.consoleText();
  assert.deepEqual(text.split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
  assert.match(text, /Bitstream: build\/blinky\.fs \(2069320 bytes, gowin_pack in /);

  await page.eval(() => window.SilinxApp.openSummary());
  const summary = (caption) => page.waitFor((c) => {
    const t = [...document.querySelectorAll('.summary-table')].find((x) => x.querySelector('caption')?.textContent === c);
    return t ? [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((x) => x.textContent)) : null;
  }, [caption], { what: caption });
  assert.deepEqual(await summary('Detailed Reports'), [['Report Name', 'Status'], ['Synthesis Report (Yosys)', 'Current'], ['Routed Design (nextpnr JSON)', 'Current'], ['Static Timing Report', 'Current']]);
  assert.deepEqual(await summary('Programming File'), [['Bitstream', 'build/blinky.fs (2021 KB)']]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual((await summary('Relatórios Detalhados')).slice(1).map((x) => x[0]), ['Relatório de Síntese (Yosys)', 'Projeto Encaminhado (JSON do nextpnr)', 'Relatório de Temporização Estática']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});

uiTest('#2303 the Tang Nano 9K: its pins written as the project\'s constraints/top.cst from the board, with their I/O standards', E, async (page) => {
  await makeProject(env, { name: 'TangNano', board: 'tangnano9k', device: DEVICE, top: 'top', constraints: 'constraints/top.cst',
    files: { 'src/top.v': 'module top(input clk, input [1:0] btn_n, output [1:0] led_n);\n  assign led_n = btn_n ^ {2{clk}};\nendmodule\n' } });
  await page.openProject('TangNano');
  const r = await page.eval(async () => {
    const ok = await window.SilinxApp.regenerateUcf();
    const { api } = await import('/js/api.js');
    return { ok, text: await api.readFile('TangNano', 'constraints/top.cst'), constraints: window.Silinx.project.constraints };
  });
  assert.equal(r.ok, true);
  assert.equal(r.constraints, 'constraints/top.cst');
  assert.equal(r.text, "// CST for top 'top' on Sipeed Tang Nano 9K (gw1nr-9c-6-qn88), generated by Silinx\n\nIO_LOC \"clk\" 52;\nIO_PORT \"clk\" IO_TYPE=LVCMOS33;\n"
    + 'IO_LOC "btn_n[0]" 3;\nIO_PORT "btn_n[0]" IO_TYPE=LVCMOS18;\nIO_LOC "btn_n[1]" 4;\nIO_PORT "btn_n[1]" IO_TYPE=LVCMOS18;\n'
    + 'IO_LOC "led_n[0]" 10;\nIO_PORT "led_n[0]" IO_TYPE=LVCMOS18;\nIO_LOC "led_n[1]" 11;\nIO_PORT "led_n[1]" IO_TYPE=LVCMOS18;\n'
    + '// create_clock -name clk -period 37.037 [get_ports {clk}]\n');
});
