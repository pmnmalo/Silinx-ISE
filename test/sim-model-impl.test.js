// The Post-Translate and Post-Map Simulation Models of the Silinx toolchain (core/sim-model.js, the flow's
// posttrans and postmap steps, #121): the models' VHDL and Verilog (SIMPRIM primitives, the top's ports, the
// generics they were synthesized with); both models simulated against an independent reference (the
// netlist's cycle simulator of packages/silinx-fpga/test/fpga-sim.js) on the packer's fixtures and on small designs with shift
// registers, distributed and block RAMs, multipliers and latches; the flow's steps, their report and their
// exact log. Every example's test bench on both models: test/sim-model-examples.test.js and
// test/sim-model-vga.test.js (three files, so they run alongside each other, #566).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { postTranslateModels, postMapModels, SIMPRIM_PRIMITIVES } from '../core/sim-model.js';
import { runOpenFlow } from '../core/flow-ide.js';
import { orderOpenSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { readYosysJson, paramBits } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack } from '../packages/silinx-fpga/src/fpga/pack.js';
import { simulate, device, compareWithNetlist } from './sim-model-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPGA = path.join(HERE, '..', 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga'), DESIGNS = path.join(HERE, 'fixtures', 'designs');

const DUT = `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity cnt is generic ( N : integer := 1000; W : integer := 4 ); port ( clk : in std_logic; rst : in std_logic; q : out std_logic_vector(W - 1 downto 0) ); end;
architecture a of cnt is signal c : integer range 0 to N := 0; signal v : unsigned(W - 1 downto 0) := (others => '0');
begin process (clk) begin if rising_edge(clk) then if rst = '1' then v <= (others => '0'); c <= 0; elsif c = N - 1 then c <= 0; v <= v + 1; else c <= c + 1; end if; end if; end process; q <= std_logic_vector(v); end;`;
const TB = `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity tb is end; architecture t of tb is signal clk, rst : std_logic := '0'; signal q : std_logic_vector(3 downto 0);
begin clk <= not clk after 5 ns; u: entity work.cnt generic map (N => 3) port map (clk => clk, rst => rst, q => q);
process begin wait for 95 ns; report "q = " & integer'image(to_integer(unsigned(q))); wait; end process; end;`;
const src = [{ path: 'cnt.vhd', lang: 'vhdl', text: DUT }], tb = [{ path: 'tb.vhd', lang: 'vhdl', text: TB }];
// the test bench with the design's own generics (N = 1000: q counts every 1000 clocks), for the board's models (#622)
const tbOwn = [{ path: 'tb.vhd', lang: 'vhdl', text: TB.replace('generic map (N => 3) ', '').replace('wait for 95 ns', 'wait for 25 us') }];

test('postTranslateModels: the netlist as SIMPRIM primitives, the top\'s ports and generics, the header, both languages', async () => {
  const r = await synthesizeOpen(elaborate(compile(src), 'cnt', { generics: { N: 3 } }), { family: 'spartan3e', run: yosysNode });
  const nl = readYosysJson(r.files[`${r.top}.json`]);
  const m = postTranslateModels(nl, { top: 'cnt', part: 'xc3s250ecp132-4', generics: { N: 3 }, testbench: 'tb' });
  const head = [
    "-- Post-Translate Simulation Model of 'cnt' (xc3s250ecp132-4): the netlist of the open synthesis translated (Silinx toolchain),",
    '-- the SIMPRIM primitives it is made of (functional, no timing); written by Silinx. Simulate it with the test',
    "-- bench in place of the design's own HDL (its entity has the top's ports).",
    "-- Synthesized with the generics the test bench 'tb' gives: N = 3.",
  ];
  assert.deepEqual(m.vhdl.split('\n').slice(0, 4), head);
  assert.match(m.vhdl, /^library SIMPRIM;\nuse SIMPRIM\.VCOMPONENTS\.ALL;\nuse SIMPRIM\.VPACKAGE\.ALL;$/m);
  assert.match(m.vhdl, /^entity cnt is\n {2}generic \(\n {4}N : integer := 3\n {2}\);\n {2}port \(\n {4}clk : in STD_LOGIC;\n {4}rst : in STD_LOGIC;\n {4}q : out STD_LOGIC_VECTOR \( 3 downto 0 \)\n {2}\);$/m);
  assert.deepEqual(m.verilog.split('\n').slice(0, 4), head.map(l => l.replace(/^--/, '//')));
  assert.match(m.verilog, /^module cnt \(clk, rst, q\);\n {2}parameter N = 3;\n {2}input clk;\n {2}input rst;\n {2}output \[3:0\] q;$/m);
  // each cell as ngdbuild translates it: the flip-flops with their reset synchronous (X_SFF), the carry chain's
  // MUXCY / XORCY as X_MUX2 / X_XOR2, the clock buffer an X_CKBUF, the pads X_BUF / X_OBUF
  const types = new Set([...m.vhdl.matchAll(/^ {2}\w+ : (\w+)$/gm)].map(x => x[1]));
  assert.deepEqual([...types].filter(t => !SIMPRIM_PRIMITIVES.has(t)), []);
  for (const t of ['X_SFF', 'X_MUX2', 'X_XOR2', 'X_CKBUF', 'X_BUF', 'X_OBUF']) assert.ok(types.has(t), `${t}: ${[...types]}`);
  assert.ok([...types].some(t => /^X_LUT[1-4]$/.test(t)), [...types].join(' '));
  assert.equal(m.instances, [...m.vhdl.matchAll(/^ {2}\w+ : X_\w+$/gm)].length);
  // the Verilog model needs Silinx's SIMPRIM models (and UNISIM's: X_LUT4 is made of LUT4) as the VHDL one does
  assert.deepEqual(primitiveSources([{ path: 'm.v', lang: 'verilog', text: m.verilog }]).map(x => x.path), ['<silinx>/unisim.vhd', '<silinx>/simprim.vhd']);
  assert.deepEqual(primitiveSources([{ path: 'm.vhd', lang: 'vhdl', text: m.vhdl }]).map(x => x.path), ['<silinx>/unisim.vhd', '<silinx>/simprim.vhd']);
  assert.deepEqual(m.unknown, []);
  // an FDRE: its R the synchronous reset, no asynchronous one
  assert.match(m.vhdl, /: X_SFF\n {4}generic map \(\n {6}INIT => '0'\n {4}\)\n {4}port map \(\n {6}I => \w+,\n {6}CE => \S+,\n {6}CLK => \w+,\n {6}SET => '0',\n {6}RST => '0',\n {6}SSET => '0',\n {6}SRST => \w+,\n {6}O => \w+\n {4}\);/);
});

test('postMapModels: the packed slices as their elements (LUTs, carry, flip-flops), only the LUT inputs their equation reads (#121)', async () => {
  const r = await synthesizeOpen(elaborate(compile(src), 'cnt', { generics: { N: 3 } }), { family: 'spartan3e', run: yosysNode });
  const nl = readYosysJson(r.files[`${r.top}.json`]);
  const m = postMapModels(nl, pack(nl), { top: 'cnt', part: 'xc3s250ecp132-4' });
  assert.deepEqual(m.vhdl.split('\n').slice(0, 3), [
    "-- Post-Map Simulation Model of 'cnt' (xc3s250ecp132-4): the packed design (Silinx toolchain),",
    '-- the SIMPRIM primitives it is made of (functional, no timing); written by Silinx. Simulate it with the test',
    "-- bench in place of the design's own HDL (its entity has the top's ports).",
  ]);
  assert.match(m.vhdl, /^entity cnt is\n {2}port \(/m);
  assert.match(m.verilog, /^module cnt \(clk, rst, q\);\n {2}input clk;/m);
  assert.deepEqual(m.unknown, []);
  const types = new Set([...m.vhdl.matchAll(/^ {2}\w+ : (\w+)$/gm)].map(x => x[1]));
  for (const t of ['X_LUT4', 'X_SFF', 'X_MUX2', 'X_XOR2', 'X_BUFGMUX', 'X_BUF', 'X_OBUF']) assert.ok(types.has(t), `${t}: ${[...types]}`);
  // every LUT: an input its INIT does not depend on is tied to 0 (the packer wires the carry's data input to
  // a pin the LUT may not read; connected, an unknown value there made the LUT unknown on a loop: vga's model
  // never left X)
  const luts = [...m.vhdl.matchAll(/: X_LUT4\n {4}generic map \(\n {6}INIT => X"([0-9A-F]{4})"\n {4}\)\n {4}port map \(\n((?: {6}ADR\d => \S+,\n){4})/g)];
  assert.ok(luts.length > 3, luts.length);
  for (const [, hex, pins] of luts) {
    const f = paramBits(BigInt(`0x${hex}`).toString(2).padStart(16, '0'));
    [...pins.matchAll(/ADR(\d) => (\S+),/g)].forEach(([, j, net]) => {
      const reads = f.some((b, a) => b !== f[a ^ (1 << +j)]);
      if (!reads) assert.equal(net, "'0'", `INIT ${hex}: ADR${j} => ${net}`);
    });
  }
});

// ------------------------------------------------------------------ against the netlist's cycle simulator
const bothModels = nl => ({ translate: postTranslateModels(nl, { top: nl.name }), map: postMapModels(nl, pack(nl), { top: nl.name }) });

for (const name of ['sw', 'counter', 'ffs', 'widemux', 'mux64', 'latches', 'srmux']) {
  test(`fixture ${name}: both models behave as the netlist, in VHDL and in Verilog (random stimulus)`, () => {
    const nl = readYosysJson(fs.readFileSync(path.join(FPGA, `${name}.json`), 'utf8'));
    const models = bothModels(nl);
    for (const m of Object.values(models)) assert.deepEqual(m.unknown, []);
    assert.deepEqual(compareWithNetlist(nl, models, { single: name === 'latches' }), []);
  });
}
// (the shift registers, distributed and block RAMs, multipliers, latches, a state machine: synthesized here)
for (const name of ['adder', 'bram_dp', 'bram_prim', 'bram_sp', 'dram', 'fsm', 'latch', 'mult', 'srl']) {
  test(`design ${name}: both models behave as the netlist, in VHDL and in Verilog (random stimulus)`, { timeout: 300000 }, async () => {
    const j = JSON.parse(fs.readFileSync(path.join(DESIGNS, name, 'design.json'), 'utf8'));
    const files = j.files.map(f => ({ path: f, lang: /\.vhdl?$/.test(f) ? 'vhdl' : 'verilog', text: fs.readFileSync(path.join(DESIGNS, name, f), 'utf8') }));
    const r = await synthesizeOpen(elaborate(compile([...primitiveSources(files), ...files]), j.top), { family: 'spartan3e', run: yosysNode });
    const nl = readYosysJson(r.files[`${r.top}.json`]);
    const models = bothModels(nl);
    for (const m of Object.values(models)) assert.deepEqual(m.unknown, []);
    assert.deepEqual(compareWithNetlist(nl, models, { clock: j.sim?.clock || 'clk', cycles: 150, single: name === 'latch' }), []);
  });
}

test('the flow\'s posttrans and postmap steps: the models synthesized with the test bench\'s generics, and the board\'s of this run\'s netlist (#622), written, in the report, the exact log', { timeout: 300000 }, async () => {
  const written = {}, lines = [];
  const r = await runOpenFlow({ top: 'cnt', part: 'xc3s250ecp132-4', family: 'spartan3e', steps: orderOpenSteps(['postmap', 'posttrans']), simTop: 'tb' },
    { log: l => lines.push(l), sources: () => src, simSources: () => tb, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {}, device });
  assert.equal(r.ok, true, lines.join('\n'));
  assert.deepEqual(lines.filter(l => /^=== SILINX STEP/.test(l)), ['synth', 'translate', 'posttrans', 'map', 'postmap'].map(x => `=== SILINX STEP ${x} ===`));
  assert.deepEqual(Object.keys(written).filter(f => /^netgen/.test(f)).sort(), ['netgen/map/cnt_map.v', 'netgen/map/cnt_map.vhd', 'netgen/map/cnt_map_board.v', 'netgen/map/cnt_map_board.vhd',
    'netgen/translate/cnt_translate.v', 'netgen/translate/cnt_translate.vhd', 'netgen/translate/cnt_translate_board.v', 'netgen/translate/cnt_translate_board.vhd']);
  assert.deepEqual(r.report.simModels, {
    posttrans: { path: 'build/netgen/translate/cnt_translate.vhd', verilog: 'build/netgen/translate/cnt_translate.v', testbench: 'tb', generics: { n: 3 },
      board: { path: 'build/netgen/translate/cnt_translate_board.vhd', verilog: 'build/netgen/translate/cnt_translate_board.v' } },
    postmap: { path: 'build/netgen/map/cnt_map.vhd', verilog: 'build/netgen/map/cnt_map.v', testbench: 'tb', generics: { n: 3 },
      board: { path: 'build/netgen/map/cnt_map_board.vhd', verilog: 'build/netgen/map/cnt_map_board.v' } },
  });
  // (the model's design synthesized once for both models; the board's of this run's netlist and packed design)
  const count = re => re.exec(lines.join('\n'))[1];
  assert.deepEqual(lines.filter(l => /^(WARNING|INFO|ERROR|Synthesizing|Post-)/.test(l)), [
    "Synthesizing 'cnt' with the generics the test bench 'tb' gives: n = 3",
    `Post-Translate Simulation Model: build/netgen/translate/cnt_translate.vhd (VHDL, SIMPRIM primitives) and build/netgen/translate/cnt_translate.v (Verilog), ${count(/translate\.v \(Verilog\), (\d+) primitives/)} primitives`,
    'Post-Translate model for the Board Emulator, with the design\'s own generics: build/netgen/translate/cnt_translate_board.vhd (VHDL) and build/netgen/translate/cnt_translate_board.v (Verilog)',
    `Post-Map Simulation Model: build/netgen/map/cnt_map.vhd (VHDL, SIMPRIM primitives) and build/netgen/map/cnt_map.v (Verilog), ${count(/map\.v \(Verilog\), (\d+) primitives/)} primitives`,
    'Post-Map model for the Board Emulator, with the design\'s own generics: build/netgen/map/cnt_map_board.vhd (VHDL) and build/netgen/map/cnt_map_board.v (Verilog)',
  ]);
  // the test bench on the models: q counts every 3 clocks (95 ns: 9 edges, q = 3), no warnings; the board's count
  // every 1000 (25 us: 2500 edges, q = 2)
  for (const [file, text] of Object.entries(written).filter(([f]) => /^netgen/.test(f))) {
    const board = /_board\./.test(file);
    const s = simulate(board ? tbOwn : tb, file, text, 'tb', 3e7, { stop: /^q = / });
    assert.deepEqual(s.diags, [], file);
    assert.deepEqual(s.log, [board ? 'q = 2' : 'q = 3'], file);
  }
  // without a test bench: the design's own generics, from this run's netlist and packed design (no synthesis again)
  const lines3 = [];
  const r3 = await runOpenFlow({ top: 'cnt', part: 'xc3s250ecp132-4', family: 'spartan3e', steps: orderOpenSteps(['postmap', 'posttrans']) },
    { log: l => lines3.push(l), sources: () => src, yosys: yosysNode, write: n => `build/${n}`, read: () => null, save: () => {}, device });
  assert.equal(r3.ok, true, lines3.join('\n'));
  assert.deepEqual(r3.report.simModels.postmap, { path: 'build/netgen/map/cnt_map.vhd', verilog: 'build/netgen/map/cnt_map.v' });
  assert.deepEqual(lines3.filter(l => /^(WARNING|INFO|ERROR|Synthesizing)/.test(l)), []);
});
