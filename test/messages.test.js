// web/js/messages.js: the message centre of the Tasks interface (#798): the source of each Console line,
// read from the processes' headers, and the sources a filter or a task shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.addEventListener ??= () => {};
const M = await import('../web/js/messages.js');

// the Console of a session with the pong example (the lines the app wrote, in order), each with its source
const SESSION = [
  ['Silinx ISE 15.11.3 Project Navigator — HDL design, schematics, behavioural simulation and Xilinx FPGA implementation/programming.', 'app'],
  ['Toolchain: Silinx toolchain (no ISE): synthesis, place and route and bitstream by Silinx and Yosys.', 'app'],
  ['Programmers found: none (install openFPGALoader, xc3sprog, Digilent Adept or ISE iMPACT)', 'app'],
  ['Project "pong" opened (xc3s250e-4-cp132).', 'app'],
  ['', 'app'],
  ['Started : "Check Syntax".', 'check'],
  ['', 'check'],
  ['Analyzing Verilog file "src/debounce.v" into library work', 'check'],
  ['Elaborating top module <pong>: 49 signals, 19 processes.', 'check'],
  ['Process "Check Syntax" completed successfully', 'check'],
  ['Started : "Simulate Behavioral Model".', 'sim'],
  ['Building simulation model for top \'tb_pong\'...', 'sim'],
  ['Simulation model ready: 49 signals, 19 processes. Launching SSim view.', 'sim'],
  ['Started : "Behavioral Check Syntax".', 'check'],
  ['Process "Check Syntax" completed successfully', 'check'],
  ['Board Emulator: \'pong\' (RTL, compiled) on Digilent Basys2 — 27 port bit(s) on board resources.', 'emu'],
  ['Started : "Generate Programming File" (Silinx toolchain).', 'synth'],
  ['Silinx implementation with the Silinx toolchain (no ISE): pong top=pong device=xc3s250ecp132-4', 'synth'],
  ['=== SILINX STEP synth ===', 'synth'],
  ['Netlist: build/open/pong.json (1009 cells) in 3.6 s', 'synth'],
  ['=== SILINX STEP translate ===', 'impl'],
  ['=== SILINX STEP map ===', 'impl'],
  ['  Number of occupied Slices: 243 out of 2448 10%', 'impl'],
  ['=== SILINX STEP par ===', 'impl'],
  ['Routed 632 nets (4217 PIPs, 14 passes) in 0.7 s: build/open/routed.xdl', 'impl'],
  ['=== SILINX STEP bitgen ===', 'impl'],
  ['=== SILINX DONE ===', 'impl'],
  ['Process "Generate Programming File" completed successfully', 'impl'],
  ['Scanning JTAG chain...', 'prog'],
  ['Programming FPGA (SRAM)...', 'prog'],
  ['\'1\': Programmed successfully.', 'prog'],
  ['Programming XCF02S...', 'prog'],
  ['ERROR: Board Emulator: cannot build the design', 'emu'],
  ['Silinx ISE 15.11.3 is up to date (latest release on GitHub: 15.11.3).', 'app'],   // (the update check, at any time)
];

test('sourceOf: each line of a session\'s Console is its process\'s (the lines after a header are its own)', () => {
  let cur = 'app';
  const got = SESSION.map(([line]) => (cur = M.sourceOf(line, cur)));
  assert.deepEqual(got, SESSION.map(([, src]) => src));
});

test('sourceOf: the processes\' headers', () => {
  const cases = {
    'Started : "Check Syntax" of src/pong.v.': 'check',
    'Started : "Check Constraints" of constraints/top.ucf.': 'check',
    'Started : "Simulate Post-Place & Route Model".': 'sim',
    'Started : "Save as Test Bench".': 'sim',
    'Started : "Synthesize - XST".': 'synth',
    'Started : "Synthesize - Yosys (open)".': 'synth',
    'Started : "Implement Design".': 'synth',
    'Started : "Check Schematic" of gates.': 'check',   // (a schematic's, in the Tasks interface: #993)
    'Started : "Translate".': 'impl',
    'Started : "Generate Post-Synthesis Simulation Model".': 'impl',
    'Started : "Generate Text Power Report".': 'impl',
    'Started : "Back-annotate Pin Locations".': 'impl',
    '=== SILINX STEP fpgaview ===': 'impl',
    'Verifying XCF04S...': 'prog',
    'Erasing XCF02S...': 'prog',
    'Backing up XCF02S...': 'prog',
    'Reloading the FPGA from the PROM...': 'prog',
  };
  for (const [line, src] of Object.entries(cases)) assert.equal(M.sourceOf(line, 'app'), src, line);
  // not headers: the current source goes on
  for (const line of ['Programming a board needs a cable', 'Started the job', 'Board Emulator help', '  Started : "x"']) assert.equal(M.sourceOf(line, 'sim'), line.trim().startsWith('Started : "') ? 'impl' : 'sim', line);
  assert.equal(M.sourceOf('anything'), 'app');
});

test('filterSources: a picked filter, All, or the task\'s own sources (Implement: synthesis and implementation)', () => {
  assert.deepEqual(M.SOURCES, ['check', 'sim', 'emu', 'synth', 'impl', 'prog']);
  assert.deepEqual(['all', ...M.SOURCES].map((s) => M.SOURCE_LABEL[s]), ['All', 'Design', 'Simulation', 'Emulator', 'Synthesis', 'Implementation', 'Board']);
  assert.equal(M.filterSources('all', 'sim'), null);
  assert.deepEqual(M.filterSources('emu', 'sim'), ['emu']);
  assert.deepEqual(M.filterSources(null, 'edit'), ['check']);
  assert.deepEqual(M.filterSources(null, 'sim'), ['sim']);
  assert.deepEqual(M.filterSources(null, 'emu'), ['emu']);
  assert.deepEqual(M.filterSources(null, 'impl'), ['synth', 'impl']);
  assert.deepEqual(M.filterSources(null, 'prog'), ['prog']);
  assert.equal(M.filterSources('bogus', 'nothing'), null);
});
