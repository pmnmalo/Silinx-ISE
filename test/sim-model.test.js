// The Post-Synthesis Simulation Model of the Silinx toolchain (core/sim-model.js, the flow's postsynth step,
// #120): the generics the test bench gives the top, the model's VHDL (UNISIM primitives, the top's ports,
// its generics declared) and Verilog, the flow's step and its report, the steps of the server and of the
// browser; the Verilog model a wire a bit (#575); and every example's test bench passes on the model, in VHDL and
// in Verilog, and the Board Emulator's compiled engine runs the model as the event-driven simulator does (vga's in
// test/sim-model-synth-vga.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { dutGenerics, scalarVerilog, postSynthesisModels, SIM_PRIMITIVES } from '../core/sim-model.js';
import { runOpenFlow } from '../core/flow-ide.js';
import { scalarizeNetlist } from '../core/netlist-hier.js';
import { Simulator } from '../core/simulator.js';
import { openSteps } from '../server/open-flow.js';
import { EXAMPLES } from './examples-lib.mjs';
import { examplePostSynthTests } from './sim-model-lib.mjs';

const DUT = `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity cnt is generic ( N : integer := 1000; W : integer := 4 ); port ( clk : in std_logic; q : out std_logic_vector(W - 1 downto 0) ); end;
architecture a of cnt is signal c : integer range 0 to N := 0; signal v : unsigned(W - 1 downto 0) := (others => '0');
begin process (clk) begin if rising_edge(clk) then if c = N - 1 then c <= 0; v <= v + 1; else c <= c + 1; end if; end if; end process; q <= std_logic_vector(v); end;`;
const TB = `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity tb is end; architecture t of tb is signal clk : std_logic := '0'; signal q : std_logic_vector(3 downto 0);
begin clk <= not clk after 5 ns; wrap: block begin u: entity work.cnt generic map (N => 3) port map (clk => clk, q => q); end block;
process begin wait for 95 ns; report "q = " & integer'image(to_integer(unsigned(q))); wait; end process; end;`;
const src = [{ path: 'cnt.vhd', lang: 'vhdl', text: DUT }], tb = [{ path: 'tb.vhd', lang: 'vhdl', text: TB }];
// the test bench with the design's own generics (N = 1000: q counts every 1000 clocks), for the board's model (#622)
const tbOwn = [{ path: 'tb.vhd', lang: 'vhdl', text: TB.replace('generic map (N => 3) ', '').replace('wait for 95 ns', 'wait for 25 us') }];
// a model's file simulated with a test bench: what it reports
function reports(bench, file, text) {
  const lang = file.endsWith('.v') ? 'verilog' : 'vhdl';
  const all = [...bench, { path: file, lang, text: lang === 'vhdl' ? scalarizeNetlist(text) : text }];
  const s = new Simulator(elaborate(compile([...primitiveSources(all), ...all]), 'tb'));
  s.run(3e7);
  return s.log.map(e => e.text).filter(t => /^q = /.test(t));
}

test('dutGenerics: the generics the test bench gives its instance of the top (inside a block too), integers only', () => {
  const d = elaborate(compile([...src, ...tb]), 'tb');
  assert.deepEqual(dutGenerics(d, 'cnt'), { generics: { n: 3 }, skipped: [], instance: dutGenerics(d, 'cnt').instance });
  assert.match(dutGenerics(d, 'CNT').instance, /u$/);
  assert.equal(dutGenerics(d, 'other'), null);
});

test('postSynthesisModels: VHDL of UNISIM primitives with the top\'s ports and the generics it was synthesized with, Verilog, the header', async () => {
  const r = await synthesizeOpen(elaborate(compile(src), 'cnt', { generics: { N: 3 } }), { family: 'spartan3e', run: yosysNode });
  const m = postSynthesisModels(r, { top: 'cnt', part: 'xc3s250ecp132-4', generics: { N: 3 }, testbench: 'tb' });
  const head = [
    "-- Post-Synthesis Simulation Model of 'cnt' (xc3s250ecp132-4): the open synthesis's netlist (Silinx toolchain, Yosys),",
    '-- the UNISIM primitives it is made of; written by Silinx. Simulate it with the test bench in place of the',
    "-- design's own HDL (its entity has the top's ports).",
    "-- Synthesized with the generics the test bench 'tb' gives: N = 3.",
  ];
  assert.deepEqual(m.vhdl.split('\n').slice(0, 4), head);
  assert.match(m.vhdl, /^library UNISIM;\nuse UNISIM\.VCOMPONENTS\.ALL;$/m);
  assert.match(m.vhdl, /^entity cnt is\n {2}generic \(\n {4}N : integer := 3\n {2}\);\n {2}port \(\n {4}clk : in STD_LOGIC;\n {4}q : out STD_LOGIC_VECTOR \( 3 downto 0 \)\n {2}\);$/m);
  assert.match(m.vhdl, /: FDRE\n/);
  assert.deepEqual(m.verilog.split('\n').slice(0, 4), head.map(l => l.replace(/^--/, '//')));
  assert.match(m.verilog, /^module cnt\(.*\);\n {2}parameter N = 3;$/m);
  assert.deepEqual(m.unknown, []);
  assert.ok(['LUT4', 'FDRE', 'RAMB16_S18_S18', 'MULT18X18', 'SRL16E', 'DCM'].every(p => SIM_PRIMITIVES.has(p)));
});

// the Verilog netlist a wire a bit (#575): Yosys's has buses, a primitive driving one bit, which woke every primitive
// reading the bus (vga's model simulated 4 times slower than in VHDL); the same cells, the ports still buses
test('scalarVerilog: the Verilog netlist a wire a bit, the top\'s ports buses, its cells the netlist\'s (#575)', async () => {
  const r = await synthesizeOpen(elaborate(compile(src), 'cnt', { generics: { N: 3 } }), { family: 'spartan3e', run: yosysNode });
  const s = await scalarVerilog(r, yosysNode);
  const buses = t => [...t.matchAll(/^ {2}wire (\[[^\]]+\]) (\S+);/gm)].map(m => m[2]);
  const cells = t => [...t.matchAll(/^ {2}([A-Z][A-Z0-9_]*) (?:#\(|\S+ \()/gm)].map(m => m[1]).sort();
  assert.deepEqual(buses(r.files['cnt_yosys.v']), ['q', '_01_', '_02_', '_03_', 'c', 'v']);
  assert.deepEqual(buses(s.files['cnt_yosys.v']), ['q']);
  assert.deepEqual(cells(s.files['cnt_yosys.v']), cells(r.files['cnt_yosys.v']));
  assert.equal(cells(s.files['cnt_yosys.v']).join(' '), 'BUFG FDRE FDRE FDRE FDRE FDRE FDRE IBUF INV LUT2 LUT2 LUT2 MUXCY MUXCY MUXCY OBUF OBUF OBUF OBUF XORCY XORCY XORCY XORCY');
  assert.match(s.files['cnt_yosys.v'], /^module cnt\(clk, q\);$/m);
  // (the rest of the result as it was)
  assert.deepEqual({ ...s, files: { ...s.files, 'cnt_yosys.v': null } }, { ...r, files: { ...r.files, 'cnt_yosys.v': null } });
});

// Regression (#493): the netlist's library cells (a primitive's model with its $specify2 timing arcs, first in
// the JSON) are not the design's: only the top module's cells count, a cell with no model of its own still said
test('postSynthesisModels: only the top module\'s cells are looked at, not the library cells before it (#493)', () => {
  const cell = (type, conns) => ({ type, parameters: {}, port_directions: Object.fromEntries(Object.keys(conns).map(p => [p, p === 'O' || p === 'Y' ? 'output' : 'input'])), connections: conns });
  const json = { modules: {
    LUT1: { attributes: { blackbox: 1 }, ports: {}, cells: { s: cell('$specify2', { SRC: [2], DST: [3], EN: ['1'] }), b: cell('$buf', { A: [2], Y: [3] }) }, netnames: {} },
    top: { attributes: { top: 1 }, ports: { a: { direction: 'input', bits: [2] }, y: { direction: 'output', bits: [3] } },
      cells: { i: cell('INV', { I: [2], O: [3] }) }, netnames: { a: { bits: [2] }, y: { bits: [3] } } } } };
  const synth = t => ({ top: 'top', files: { 'top.json': JSON.stringify(t), 'top_yosys.v': 'module top(a, y);\n  input a;\n  output y;\nendmodule\n' } });
  assert.deepEqual(postSynthesisModels(synth(json), { top: 'top' }).unknown, []);
  // a cell of the top with no model: still said
  json.modules.top.cells.x = cell('XYZ', { I: [2] });
  assert.deepEqual(postSynthesisModels(synth(json), { top: 'top' }).unknown, ['XYZ']);
});

test('the flow\'s postsynth step: the model synthesized with the test bench\'s generics, and the board\'s with the design\'s own (#622), written, in the report; the server\'s steps', async () => {
  const written = {}, lines = [];
  const r = await runOpenFlow({ top: 'cnt', part: 'xc3s250ecp132-4', family: 'spartan3e', steps: ['postsynth'], simTop: 'tb' },
    { log: l => lines.push(l), sources: () => src, simSources: () => tb, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {} });
  assert.equal(r.ok, true, lines.join('\n'));
  assert.deepEqual(Object.keys(written).sort(), ['netgen/synthesis/cnt_synthesis.v', 'netgen/synthesis/cnt_synthesis.vhd', 'netgen/synthesis/cnt_synthesis_board.v', 'netgen/synthesis/cnt_synthesis_board.vhd']);
  assert.deepEqual(r.report.simModels, { postsynth: { path: 'build/netgen/synthesis/cnt_synthesis.vhd', verilog: 'build/netgen/synthesis/cnt_synthesis.v', testbench: 'tb', generics: { n: 3 },
    board: { path: 'build/netgen/synthesis/cnt_synthesis_board.vhd', verilog: 'build/netgen/synthesis/cnt_synthesis_board.v' } } });
  // (no synthesis of the design before: the step synthesizes it with its own generics too)
  assert.deepEqual(lines.filter(l => /^(WARNING|INFO|Synthesizing|Post-Synthesis)/.test(l)), [
    "Synthesizing 'cnt' with the generics the test bench 'tb' gives: n = 3",
    "Synthesizing 'cnt' with its own generics, for the Board Emulator",
    `Post-Synthesis Simulation Model: build/netgen/synthesis/cnt_synthesis.vhd (VHDL, UNISIM primitives) and build/netgen/synthesis/cnt_synthesis.v (Verilog), ${lines.join('\n').match(/\(Verilog\), (\d+) cells/)[1]} cells`,
    'Post-Synthesis model for the Board Emulator, with the design\'s own generics: build/netgen/synthesis/cnt_synthesis_board.vhd (VHDL) and build/netgen/synthesis/cnt_synthesis_board.v (Verilog)',
  ]);
  // the Verilog model a wire a bit (#575): no bus but the top's port
  assert.deepEqual([...written['netgen/synthesis/cnt_synthesis.v'].matchAll(/^ {2}wire (\[[^\]]+\]) (\S+);/gm)].map(m => m[2]), ['q']);
  // the test bench on the model: q counts every 3 clocks (95 ns: 9 edges, q = 3); the board's model counts every
  // 1000 (25 us: 2500 edges, q = 2), its header without the test bench's generics
  for (const [file, text] of Object.entries(written)) {
    const board = /_board\./.test(file);
    assert.deepEqual(reports(board ? tbOwn : tb, file, text), [board ? 'q = 2' : 'q = 3'], file);
    assert.equal(/Synthesized with the generics/.test(text), !board, file);
  }
  // after a synthesis of the design (its netlist in build/open), the board's model is made of it: no synthesis again
  const lines2 = [], written2 = {};
  const own = await synthesizeOpen(elaborate(compile(src), 'cnt'), { family: 'spartan3e', run: yosysNode });
  const r2 = await runOpenFlow({ top: 'cnt', part: 'xc3s250ecp132-4', family: 'spartan3e', steps: ['postsynth'], simTop: 'tb' },
    { log: l => lines2.push(l), sources: () => src, simSources: () => tb, yosys: yosysNode, write: (n, d) => { written2[n] = d; return `build/${n}`; },
      read: n => own.files[n.replace(/^open\//, '')] ?? null, save: () => {} });
  assert.equal(r2.ok, true, lines2.join('\n'));
  assert.deepEqual(lines2.filter(l => /^(WARNING|INFO|Synthesizing)/.test(l)), ["Synthesizing 'cnt' with the generics the test bench 'tb' gives: n = 3"]);
  assert.deepEqual(reports(tbOwn, 'cnt_synthesis_board.vhd', written2['netgen/synthesis/cnt_synthesis_board.vhd']), ['q = 2']);
  // without a test bench, or one that gives no generics: the model is the board's, no other
  const r3 = await runOpenFlow({ top: 'cnt', part: 'xc3s250ecp132-4', family: 'spartan3e', steps: ['postsynth'] },
    { log: () => {}, sources: () => src, yosys: yosysNode, write: n => `build/${n}`, read: n => own.files[n.replace(/^open\//, '')] ?? null, save: () => {} });
  assert.deepEqual(r3.report.simModels, { postsynth: { path: 'build/netgen/synthesis/cnt_synthesis.vhd', verilog: 'build/netgen/synthesis/cnt_synthesis.v' } });
  // the steps: after the synthesis when it runs; alone it synthesizes itself
  assert.deepEqual(openSteps(['synth', 'postsynth']), ['synth', 'postsynth']);
  assert.deepEqual(openSteps(['postsynth']), ['postsynth']);
  assert.deepEqual(openSteps(['postpar']), ['synth', 'translate', 'map', 'par', 'trce', 'postpar']);
});

// every example's test bench on the model of the example (test/sim-model-lib.mjs); vga's two frames in a file of
// their own, test/sim-model-synth-vga.test.js, so that they run alongside the others (#575)
examplePostSynthTests(EXAMPLES.filter(name => name !== 'vga'));
