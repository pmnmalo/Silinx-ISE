// Open synthesis (core/synth-open.js): Silinx's front end + Yosys compiled to WebAssembly (YoWASP),
// here in Node (in the browser the same module runs in a Web Worker: test/ui/synth-open.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen, synthEffort, yosysScript, yosysFiles, synthCommands, remapCommands, criticalDelay, keepDepth, keepSecond, cellCounts, utilization, lineStream, YOSYS_FAMILY, QUIET, DEPTH_ABC, DEPTH_ABC2, PREMAP_FILE, DEPTH_RULE, LUT_LIB, LUT_LIB_FILE, abcInline } from '../core/synth-open.js';
import { compareNetlist } from './diff-synth.js';
import { yosysNode } from '../core/synth-open-node.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { netlistSim } from './fpga-sim.js';
import { toVerilog } from '../core/synth-verilog.js';

const COUNTER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity counter is port (clk, rst, en : in std_logic; q : out std_logic_vector(3 downto 0)); end counter;
architecture rtl of counter is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk, rst) begin
    if rst = '1' then c <= (others => '0');
    elsif rising_edge(clk) then if en = '1' then c <= c + 1; end if; end if;
  end process;
  q <= std_logic_vector(c);
end rtl;
`;
const design = (text, top) => elaborate(compile([{ path: 'd.vhd', lang: 'vhdl', text }]), top);

test('the Yosys script and the device families', () => {
  // 4-input-LUT families: synth_xilinx with its LUT mapping replaced (ABC onto LUT4s alone, #54; the
  // mapping on LUTs of up to 6 inputs at their cost in LUT4s tried after it, remapCommands; not LUTs of
  // up to 8 inputs split into LUT4s and MUXF5 … MUXF8)
  // (shift registers read at a variable tap: xilinx_srl -variable on the word-level $shiftx before the
  // fine step, #5; fixed ones: xilinx_srl on the bit-level flip-flops before map_ffs, mapped to SRL16E /
  // SRL16E_1 by Silinx's own map file; srl: false keeps them in flip-flops)
  assert.equal(yosysScript('top', 'spartan3e'),
    'read_verilog -lib silinx_srl_cells.v; read_verilog -sv top_syn.v; synth_xilinx -family xc3se -ise -flatten -top top -run :fine; '
    + 'memory_map; xilinx_srl -variable -minlen 3; techmap -map silinx_srl_map.v; synth_xilinx -family xc3se -ise -flatten -top top -run fine:map_ffs; '
    + 'xilinx_srl -fixed -minlen 3; techmap -map silinx_srl_map.v; synth_xilinx -family xc3se -ise -flatten -top top -run map_ffs:map_luts; opt_expr -mux_undef -noclkinv; '
    + 'abc -luts 1,1,1,1; clean; techmap -map +/xilinx/ff_map.v; techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; '
    + 'xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; synth_xilinx -family xc3se -ise -flatten -top top -run finalize:; '
    + 'delete t:$scopeinfo; write_json top.json; write_verilog -noattr top_yosys.v; tee -q -o top_stat.txt stat');
  assert.equal(synthCommands('m', 'spartan3'), synthCommands('m', 'spartan3e').replaceAll('xc3se', 'xc3s'));
  assert.match(synthCommands('m', 'spartan3e', { srl: false }), /^synth_xilinx -family xc3se -ise -flatten -top m -run :map_luts; /);
  assert.doesNotMatch(yosysScript('m', 'spartan3e', { srl: false }), /xilinx_srl|silinx_srl/);
  // 6-input-LUT families: synth_xilinx as it is
  assert.equal(synthCommands('m', 'spartan6'), 'synth_xilinx -family xc6s -ise -flatten -top m');
  assert.match(yosysScript('m', 'spartan6'), /-family xc6s /);
  assert.throws(() => yosysScript('m', 'cyclone'), /no Yosys mapping for the device family 'cyclone'/);
  for (const f of ['spartan3', 'spartan3e', 'spartan3a', 'spartan3adsp', 'spartan6', 'virtex4', 'virtex5', 'virtex6', 'artix7', 'kintex7', 'zynq']) assert.ok(YOSYS_FAMILY[f], f);
});

test('cell counts and utilization of a netlist', () => {
  const json = { modules: { top: { attributes: { top: 1 }, cells: { a: { type: 'LUT4' }, b: { type: 'LUT2' }, c: { type: 'FDCE' }, d: { type: 'MUXF5' }, e: { type: 'IBUF' }, f: { type: 'OBUF' }, g: { type: 'BUFG' }, h: { type: 'XORCY' }, i: { type: 'RAMB16_S9' }, j: { type: 'LDCE' } } } } };
  const c = cellCounts(JSON.stringify(json), 'top');
  assert.deepEqual(c, { LUT4: 1, LUT2: 1, FDCE: 1, MUXF5: 1, IBUF: 1, OBUF: 1, BUFG: 1, XORCY: 1, RAMB16_S9: 1, LDCE: 1 });
  const u = utilization(c);
  assert.deepEqual([u.luts, u.flipFlops, u.latches, u.muxes, u.carry, u.blockRam, u.clockBuffers, u.ios, u.cells], [2, 1, 1, 1, 1, 1, 1, 2, 10]);
});

test('Yosys output split into lines, across chunks', () => {
  const lines = [];
  const feed = lineStream(l => lines.push(l));
  const enc = s => new TextEncoder().encode(s);
  feed(enc('Warning: a\nWar')); feed(null); feed(enc('ning: b\r\nend')); feed.end();
  assert.deepEqual(lines, ['Warning: a', 'Warning: b', 'end']);
});

test('Yosys 0.70\'s coloured log: the lines without the ANSI escapes, also split across chunks', () => {
  const lines = [];
  const feed = lineStream(l => lines.push(l));
  const enc = s => new TextEncoder().encode(s);
  feed(enc('\x1b[0m\x1b[93mWarning: \x1b[0m\x1b[1m\x1b[34mLatch inferred\n\x1b[1m\x1b[36m1. \x1b[0m\x1b'));
  feed(enc('[1m\x1b[37mExecuting\n\x1b[0m\nERROR: \x1b[91mno')); feed.end();
  assert.deepEqual(lines, ['Warning: Latch inferred', '1. Executing', '', 'ERROR: no']);
});

test('a counter synthesized by Yosys (WebAssembly) counts like the design', { timeout: 120000 }, async () => {
  const lines = [];
  const r = await synthesizeOpen(design(COUNTER, 'counter'), { family: 'spartan3e', run: yosysNode, onLine: l => lines.push(l) });
  assert.equal(r.top, 'counter');
  assert.deepEqual(Object.keys(r.files), ['counter_syn.v', 'counter.json', 'counter_yosys.v', 'counter_stat.txt']);
  assert.match(r.files['counter_yosys.v'], /module counter/);
  assert.match(r.files['counter_stat.txt'], /cells/);
  assert.equal(r.util.flipFlops, 4);
  assert.equal(r.util.clockBuffers, 1);
  assert.equal(r.util.ios, 3 + 4);   // rst, en, q (the clock goes through its BUFG)
  // the netlist, simulated cell by cell: reset, then count only when enabled
  const sim = netlistSim(readYosysJson(r.files['counter.json']));
  const q = () => { const o = sim.out(); return [0, 1, 2, 3].reduce((n, i) => n | (o[`q<${i}>`] << i), 0); };
  const cycle = (v) => { sim.step({ ...v, clk: 0 }); sim.step({ ...v, clk: 1 }); };
  cycle({ rst: 1, en: 0 });
  assert.equal(q(), 0);
  for (let k = 1; k <= 18; k++) { cycle({ rst: 0, en: 1 }); assert.equal(q(), k % 16, `count ${k}`); }
  cycle({ rst: 0, en: 0 }); cycle({ rst: 0, en: 0 });
  assert.equal(q(), 2);
});

test('Spartan-3E: Yosys\'s "Shift register inference not yet supported" (printed on every run) is not a warning of the design', { timeout: 120000 }, async () => {
  // Yosys does print it
  const raw = [];
  await yosysNode(['-q', '-p', yosysScript('counter', 'spartan3e')], yosysFiles('counter', (await import('../core/synth-verilog.js')).toVerilog(design(COUNTER, 'counter')).text), l => raw.push(l));
  assert.ok(raw.some(l => /Shift register inference not yet supported for family xc3se/.test(l)), raw.join('\n'));
  // the open synthesis leaves it out of its log, its onLine and its warnings
  const lines = [];
  const r = await synthesizeOpen(design(COUNTER, 'counter'), { family: 'spartan3e', run: yosysNode, onLine: l => lines.push(l) });
  for (const l of [...lines, ...r.log, ...r.warnings]) assert.doesNotMatch(String(l), /Shift register inference/);
  assert.deepEqual(r.warnings, []);
  // other Yosys warnings still count
  const run = async (args, files, onLine) => { onLine('Warning: Shift register inference not yet supported for family xc3se.'); onLine('Warning: wire q is used but has no driver.'); return yosysNode(args, files); };
  const r2 = await synthesizeOpen(design(COUNTER, 'counter'), { family: 'spartan3e', run });
  assert.deepEqual(r2.warnings, ['Warning: wire q is used but has no driver.']);
});

test('a design Yosys cannot map is reported with its messages', { timeout: 120000 }, async () => {
  // a run() that fails like Yosys does on an error
  const run = async (args, files, onLine) => { onLine('ERROR: Module `foo\' referenced in module `top\' is not part of the design.'); throw Object.assign(new Error('Yosys failed (exit code 1)'), { code: 1 }); };
  const lines = [];
  await assert.rejects(synthesizeOpen(design(COUNTER, 'counter'), { run, onLine: l => lines.push(l) }), /Yosys failed \(exit code 1\)/);
  assert.match(lines[0], /^ERROR: Module/);
  // and the real one, on a script error
  await assert.rejects(yosysNode(['-q', '-p', 'read_verilog nofile.v'], {}), /Yosys failed \(exit code 1\)/);
});

test('instantiated FD / FDCE / LD primitives and initialized variables: synthesized by Yosys, they behave as in VHDL', { timeout: 120000 }, async () => {
  const text = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all; library unisim; use unisim.vcomponents.all;
entity t is port (clk, d, ce, clr, g : in std_logic; a : in unsigned(3 downto 0); q, q2, q3, t1 : out std_logic; s : out unsigned(3 downto 0)); end t;
architecture rtl of t is
  procedure addk(x : in unsigned(3 downto 0); signal y : out unsigned(3 downto 0)) is
    variable k : unsigned(3 downto 0) := "0011";
  begin k := k + x; y <= k; end procedure;
begin
  u1: FD port map (C => clk, D => d, Q => q);
  u2: FDCE port map (C => clk, CE => ce, CLR => clr, D => d, Q => q2);
  u3: LD port map (G => g, D => d, Q => q3);
  process (clk) variable v : std_logic := '1'; begin if rising_edge(clk) then v := not v; t1 <= v; end if; end process;
  process (clk) begin if rising_edge(clk) then addk(a, s); end if; end process;
end rtl;
`;
  const srcs = [{ path: 't.vhd', lang: 'vhdl', text }];
  const r = await synthesizeOpen(elaborate(compile([...primitiveSources(srcs), ...srcs]), 't'), { run: yosysNode });
  assert.equal(r.cells.FDCE, 1);
  assert.equal(r.cells.LDCE, 1);
  const sim = netlistSim(readYosysJson(r.files['t.json']));
  const cycle = (v) => { sim.step({ ...v, clk: 0 }); sim.step({ ...v, clk: 1 }); return sim.out(); };
  const sOf = (o) => [0, 1, 2, 3].reduce((n, i) => n | (o[`s<${i}>`] << i), 0);
  const ins = (d, a) => ({ d, ce: 1, clr: 0, g: 0, ...Object.fromEntries([0, 1, 2, 3].map((i) => [`a<${i}>`, (a >> i) & 1])) });
  const t1 = [];
  for (const [d, a] of [[1, 5], [0, 7], [1, 1], [1, 12]]) {
    const o = cycle(ins(d, a));
    assert.equal(o.q, d, 'FD');
    assert.equal(o.q2, d, 'FDCE');
    assert.equal(sOf(o), (a + 3) & 15, 'the procedure\'s k starts at 3 on every call');
    t1.push(o.t1);
  }
  assert.deepEqual(t1, [0, 1, 0, 1], 'v starts at 1');
  // the latch follows D while G is high, holds while it is low
  sim.step({ ...ins(1, 0), clk: 0, g: 1 }); assert.equal(sim.out().q3, 1);
  sim.step({ ...ins(0, 0), clk: 0, g: 0 }); assert.equal(sim.out().q3, 1);
  sim.step({ ...ins(0, 0), clk: 0, g: 1 }); assert.equal(sim.out().q3, 0);
});

test('Yosys messages that say nothing about the design: its block-RAM mapping\'s port resizing', () => {
  const quiet = l => QUIET.some(re => re.test(l));
  assert.ok(quiet('Warning: Resizing cell port top.ram_wf.0.0.DI from 64 bits to 8 bits.'));
  assert.ok(quiet('Warning: Resizing cell port top.tdp.0.0.DOPB from 8 bits to 2 bits.'));
  assert.ok(quiet('Warning: Shift register inference not yet supported for family xc3se.'));
  // a resized port of the design's own cells still counts
  assert.ok(!quiet('Warning: Resizing cell port top.u_add.A from 16 bits to 8 bits.'));
  assert.ok(!quiet('Warning: Resizing cell port top.ram.0.0.ADDR from 14 bits to 10 bits.'));
});

// Regression (#14): VHDL's to_integer(u) as a bit index was a 32-bit signed index for Yosys (32-bit
// index logic: nandland's SPI master 74 LUTs in VHDL against 46 in Verilog), and a constant signal
// as an asynchronous reset value was a signal: the same receiver in VHDL and in Verilog now gives the
// same cells
test('VHDL bit indexes by to_integer(unsigned) and constant reset-value signals: the same cells as the Verilog design (#14)', { timeout: 120000 }, async () => {
  const VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity rx is generic (MODE : integer := 0); port (clk, rst_l, en, din : in std_logic; q : out std_logic_vector(7 downto 0); bit_o : out std_logic; sck : out std_logic); end;
architecture rtl of rx is
  signal cpol : std_logic;
  signal cnt : unsigned(2 downto 0);
  signal sh : std_logic_vector(7 downto 0);
  signal ck : std_logic;
begin
  cpol <= '1' when MODE = 2 or MODE = 3 else '0';
  process (clk, rst_l) begin
    if rst_l = '0' then cnt <= "111"; sh <= (others => '0'); ck <= cpol;
    elsif rising_edge(clk) then
      if en = '1' then sh(to_integer(cnt)) <= din; cnt <= cnt - 1; ck <= not ck; end if;
    end if;
  end process;
  q <= sh; bit_o <= sh(to_integer(cnt)); sck <= ck;
end;`;
  const VLG = `module rx(input clk, rst_l, en, din, output [7:0] q, output bit_o, output sck);
  reg [2:0] cnt; reg [7:0] sh; reg ck;
  always @(posedge clk or negedge rst_l)
    if (!rst_l) begin cnt <= 3'd7; sh <= 8'd0; ck <= 1'b0; end
    else if (en) begin sh[cnt] <= din; cnt <= cnt - 3'd1; ck <= ~ck; end
  assign q = sh; assign bit_o = sh[cnt]; assign sck = ck;
endmodule`;
  const cellsOf = async (text, p) => {
    const d = elaborate(compile([{ path: p, text }]), 'rx');
    const r = await synthesizeOpen(d, { run: yosysNode });
    return { cells: Object.fromEntries(Object.entries(r.cells).sort()), text: toVerilog(d).text };
  };
  const a = await cellsOf(VHD, 'rx.vhd'), b = await cellsOf(VLG, 'rx.v');
  assert.deepEqual(a.cells, b.cells);
  assert.match(a.text, /^ {8}sh\[cnt\] <= din;$/m, 'the 3-bit counter itself is the index');
  assert.match(a.text, /^ {6}ck <= 1'h0;$/m, 'the reset value is the constant');
});

// ------------------------------------------------------------------ logic depth (#52, 15.10.3)
const cell = (type, ins, outs) => ({ type, port_directions: { ...Object.fromEntries(Object.keys(ins).map(p => [p, 'input'])), ...Object.fromEntries(Object.keys(outs).map(p => [p, 'output'])) },
  connections: { ...Object.fromEntries(Object.entries(ins).map(([p, b]) => [p, [b]])), ...Object.fromEntries(Object.entries(outs).map(([p, b]) => [p, [b]])) } });
const netlistOf = cells => ({ modules: { t: { attributes: { top: 1 }, cells } } });

test('logic depth: the scripts (the design before the LUT mapping written, mapped again by the depth-oriented ABC script)', () => {
  assert.equal(yosysScript('top', 'spartan3e', { premap: PREMAP_FILE }), yosysScript('top', 'spartan3e').replace('abc -luts', 'write_rtlil silinx_premap.il; abc -luts'));
  assert.equal(remapCommands('top', 'spartan3e'), 'read_rtlil silinx_premap.il; abc -luts 1,1,1,1,2,4 -script silinx_depth.abc; clean; techmap -map +/xilinx/ff_map.v; '
    + 'techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; synth_xilinx -family xc3se -ise -flatten -top top -run finalize:');
  assert.match(DEPTH_ABC, /if -g; .*if; mfs2$/);
  // 6-input-LUT families: synth_xilinx as it is, nothing written
  assert.equal(synthCommands('m', 'spartan6', { premap: PREMAP_FILE }), 'synth_xilinx -family xc6s -ise -flatten -top m');
});

test('logic depth: the estimated critical path of a netlist (flip-flop to flip-flop; none inside a slice; the outputs when no flip-flop)', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  // FF -> LUT -> LUT -> FF: clock-to-out, two connections and LUTs, the setup through the last LUT
  const two = { f1: cell('FDRE', { C: 2, D: 3, CE: '1', R: '0' }, { Q: 10 }), l1: cell('LUT2', { I0: 10, I1: 10 }, { O: 11 }), l2: cell('LUT1', { I0: 11 }, { O: 12 }), f2: cell('FDRE', { C: 2, D: 12, CE: '1', R: '0' }, { Q: 13 }) };
  close(criticalDelay(netlistOf(two), 't'), 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.13);
  // a LUT into its carry stage (inside the slice), the carry out to another slice's flip-flop
  const cy = { f1: cell('FDRE', { C: 2, D: 3, CE: '1', R: '0' }, { Q: 10 }), l1: cell('LUT2', { I0: 10, I1: 10 }, { O: 11 }), m: cell('MUXCY', { S: 11, DI: '0', CI: '1' }, { O: 12 }), f2: cell('FDRE', { C: 2, D: 12, CE: '1', R: '0' }, { Q: 13 }) };
  close(criticalDelay(netlistOf(cy), 't'), 0.59 + 0.45 + 0.70 + 0.25 + 0.45 + 0.13);
  // the clock enable is an end too
  const ce = { f1: cell('FDRE', { C: 2, D: 3, CE: '1', R: '0' }, { Q: 10 }), l1: cell('LUT1', { I0: 10 }, { O: 11 }), f2: cell('FDRE', { C: 2, D: 3, CE: 11, R: '0' }, { Q: 13 }) };
  close(criticalDelay(netlistOf(ce), 't'), 0.59 + 0.45 + 0.70 + 0.45 + 0.55);
  // no flip-flop: from the inputs to the outputs
  const comb = { i: cell('IBUF', { I: 2 }, { O: 3 }), l: cell('LUT1', { I0: 3 }, { O: 4 }), o: cell('OBUF', { I: 4 }, { O: 5 }) };
  close(criticalDelay(netlistOf(comb), 't'), 0.45 + 0.70 + 0.45);
  // a combinational loop does not hang it
  const loop = { f1: cell('FDRE', { C: 2, D: 3, CE: '1', R: '0' }, { Q: 10 }), a: cell('LUT2', { I0: 10, I1: 12 }, { O: 11 }), b: cell('LUT1', { I0: 11 }, { O: 12 }), f2: cell('FDRE', { C: 2, D: 12, CE: '1', R: '0' }, { Q: 13 }) };
  assert.ok(criticalDelay(netlistOf(loop), 't') > 0);
});

test('logic depth: the depth-oriented netlist is kept when 3 % faster and not larger in proportion (10 % more LUTs at least)', () => {
  assert.equal(DEPTH_RULE.gain, 0.03);
  assert.ok(keepDepth([68.7, 32.6], [1090, 1168]), 'EPFL max: twice as fast, 7 % more LUTs');
  assert.ok(keepDepth([10.89, 8.65], [33, 37]), '21 % faster, 12 % more LUTs');
  assert.ok(!keepDepth([10, 9.8], [100, 101]), 'not 3 % faster, larger');
  assert.ok(keepDepth([10, 9.8], [100, 100]), 'a little faster, as large');
  assert.ok(!keepDepth([10, 9], [100, 112]), '10 % faster, 12 % more LUTs');
  assert.ok(keepDepth([10, 9], [100, 110]));
  assert.ok(keepDepth([10, 10], [100, 99]), 'as fast and smaller');
  assert.ok(!keepDepth([10, 10], [100, 100]) && !keepDepth([10, 10.2], [100, 80]), 'the same, or slower');
  // (#54) 5 % smaller at least and at most 1 % slower: the pong example's 12 % fewer LUTs, 0.6 % slower
  assert.deepEqual([DEPTH_RULE.area, DEPTH_RULE.slack], [0.05, 0.01]);
  assert.ok(keepDepth([12.32, 12.39], [311, 275]), 'the pong example');
  assert.ok(keepDepth([10, 10.1], [100, 95]) && !keepDepth([10, 10.1], [100, 96]), '5 % fewer LUTs');
  assert.ok(!keepDepth([10, 10.11], [100, 50]), 'more than 1 % slower');
  assert.ok(!keepDepth([2.82, 2.82], [0, 0]), 'no LUTs either way: nothing smaller');
});

test('logic depth: the mapping balanced once more is kept when better than the depth-oriented one, or faster and kept against the usual mapping (#52)', () => {
  assert.match(DEPTH_ABC2, /if -g; .*if -g; .*if; mfs2; strash; dch -f; if; mfs2$/);
  assert.ok(keepSecond([68.66, 32.63, 24.78], [1090, 1168, 1598]), 'EPFL max: 24 % faster than the first for 37 % more LUTs; 64 % faster than the usual one for 47 % more');
  assert.ok(keepSecond([17.27, 15.63, 15.31], [174, 181, 163]), 'a little faster and smaller than the first');
  assert.ok(!keepSecond([20, 10, 9.9], [100, 110, 112]), 'not 3 % faster than the first, larger');
  assert.ok(!keepSecond([20, 10, 9], [100, 110, 300]), 'faster, but three times the usual LUTs for twice its speed');
  assert.ok(!keepSecond([20, 10, 10.5], [100, 110, 100]), 'slower than the first');
});

// Regression (#54): a shifter onto LUT4s alone, its 2:1 multiplexers in LUT3s (with the wider functions,
// as before: 213 LUTs and 120 MUXF5 / MUXF6), that mapping kept and equal to the RTL; a rotator too
test('a 32-bit shifter and a rotator are mapped onto LUT4s alone, not 5- and 6-input functions (#54)', { timeout: 300000 }, async () => {
  const SHL = `module shl(input clk, input [31:0] d, input [4:0] s, output reg [31:0] q);
  reg [31:0] rd; reg [4:0] rs;
  always @(posedge clk) begin rd <= d; rs <= s; q <= rd << rs; end
endmodule
`;
  const shl = elaborate(compile([{ path: 'shl.v', lang: 'verilog', text: SHL }]), 'shl');
  const r = await synthesizeOpen(shl, { family: 'spartan3e', run: yosysNode });
  assert.deepEqual([r.util.luts, r.util.muxes, r.depth.wide.kept, r.depth.kept], [141, 0, false, false], JSON.stringify(r.depth));
  assert.ok(r.depth.wide.luts > 200, JSON.stringify(r.depth));
  assert.deepEqual(r.warnings, []);
  const d = compareNetlist(shl, r, { name: 'lut4-shl', sim: { cycles: 300 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
  const rot = elaborate(compile([{ path: 'rot.v', lang: 'verilog', text: SHL.replace('rd << rs', '(rd << rs) | (rd >> (32 - rs))').replace(/shl/g, 'rot') }]), 'rot');
  const r2 = await synthesizeOpen(rot, { family: 'spartan3e', run: yosysNode });
  assert.deepEqual([r2.util.luts, r2.util.muxes, r2.depth.wide.kept], [313, 0, false], JSON.stringify(r2.depth));
  const d2 = compareNetlist(rot, r2, { name: 'lut4-rot', sim: { cycles: 300 } });
  assert.equal(d2.status, 'pass', d2.report || JSON.stringify(d2));
});

// #78: the LUT delays, ABC's script inline (YoWASP's ABC crashes on read_lut from a script file)
test('logic depth with the LUT delays (#78): the library, the inline script, the remap; Yosys reads it and maps 5- and 6-input functions', { timeout: 120000 }, async () => {
  assert.equal(LUT_LIB, '1 1 1.21\n2 1 1.21\n3 1 1.21\n4 1 1.21\n5 2 1.60\n6 4 1.89\n');
  assert.equal(abcInline('strash; dch -f; if -g; mfs2'), '+read_lut,silinx_lut.lib;strash;dch,-f;if,-g;mfs2');
  assert.equal(remapCommands('top', 'spartan3e', { inline: 'strash; if' }).split('; ').slice(0, 2).join('; '),
    'read_rtlil silinx_premap.il; abc -luts 1,1,1,1,2,4 -script +read_lut,silinx_lut.lib;strash;if');
  // Yosys (YoWASP) runs it: wide functions where they are faster, as the delays say
  const v = 'module top(input [5:0] a, input [7:0] b, output y, output z); assign y = ^a; assign z = b[a[2:0]]; endmodule\n';
  const out = await yosysNode(['-q', '-p', `read_verilog t.v; synth -top top -run :fine; techmap; opt; abc -luts 1,1,1,1,2,4 -script ${abcInline('strash; if')}; write_json o.json`],
    { 't.v': v, [LUT_LIB_FILE]: LUT_LIB });
  const widths = Object.values(Object.values(JSON.parse(out['o.json']).modules)[0].cells).filter(c => c.type === '$lut').map(c => parseInt(c.parameters.WIDTH, 2)).sort();
  assert.ok(widths.length && widths.every(w => w <= 6), JSON.stringify(widths));
  assert.ok(widths.some(w => w > 4), JSON.stringify(widths));
});

// the maximum of four numbers (EPFL max's design, 16 bits), its comparisons written as chains of gates
const MAX4 = `module max4 #(parameter W = 16) (input clk, input [W-1:0] a, b, c, d, output reg [W-1:0] m);
  reg [W-1:0] ra, rb, rc, rd;
  function gt(input [W-1:0] x, input [W-1:0] y);
    integer i; reg g;
    begin g = 1'b0; for (i = 0; i < W; i = i + 1) g = (x[i] & ~y[i]) | (~(x[i] ^ y[i]) & g); gt = g; end
  endfunction
  wire [W-1:0] ab = gt(ra, rb) ? ra : rb, cd = gt(rc, rd) ? rc : rd;
  always @(posedge clk) begin ra <= a; rb <= b; rc <= c; rd <= d; m <= gt(ab, cd) ? ab : cd; end
endmodule
`;
test('logic depth: the maximum of four numbers is balanced once more, that netlist kept (faster and smaller than the first depth-oriented one) and equal to the RTL (#52)', { timeout: 300000 }, async () => {
  const max4 = elaborate(compile([{ path: 'max4.v', lang: 'verilog', text: MAX4 }]), 'max4');
  const r = await synthesizeOpen(max4, { family: 'spartan3e', run: yosysNode });
  assert.equal(r.depth.kept, true, JSON.stringify(r.depth));
  assert.equal(r.depth.second.kept, true, JSON.stringify(r.depth));
  assert.ok(r.depth.second.ns < r.depth.ns[1] && r.depth.second.luts < r.depth.luts[1], JSON.stringify(r.depth));
  assert.equal(r.util.luts, r.depth.second.luts);
  assert.equal(criticalDelay(r.files['max4.json'], 'max4'), r.depth.second.ns);
  assert.deepEqual(r.warnings, []);
  const d = compareNetlist(max4, r, { name: 'depth-max4', sim: { cycles: 300 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
});

const CHAIN = `module chain(input clk, input [23:0] a, input [23:0] b, output reg gt);
  reg [23:0] ra, rb;
  integer i;
  reg g;
  always @* begin
    g = 1'b0;
    for (i = 0; i < 24; i = i + 1) g = (ra[i] & ~rb[i]) | (~(ra[i] ^ rb[i]) & g);
  end
  always @(posedge clk) begin ra <= a; rb <= b; gt <= g; end
endmodule
`;
test('logic depth: a comparator written as a chain of gates is mapped again for depth, that netlist kept and equal to the RTL; a counter keeps its usual mapping', { timeout: 180000 }, async () => {
  const chain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text: CHAIN }]), 'chain');
  const r = await synthesizeOpen(chain, { family: 'spartan3e', run: yosysNode });
  assert.equal(r.depth.tried, true);
  assert.equal(r.depth.kept, true, JSON.stringify(r.depth));
  assert.ok(r.depth.ns[1] < r.depth.ns[0] * 0.9, JSON.stringify(r.depth));
  // the netlist kept: the depth-oriented one, or one balanced once more (with or without the LUT delays)
  const kept = [r.depth.delays, r.depth.second].find(x => x?.kept) || { ns: r.depth.ns[1], luts: r.depth.luts[1] };
  assert.ok(kept.ns <= r.depth.ns[1], JSON.stringify(r.depth));
  assert.equal(r.util.luts, kept.luts);
  assert.deepEqual(r.warnings, []);
  assert.equal(criticalDelay(r.files['chain.json'], 'chain'), kept.ns);
  const d = compareNetlist(chain, r, { name: 'depth-chain', sim: { cycles: 300 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
  // without it: the usual mapping, one Yosys run
  let runs = 0;
  const r0 = await synthesizeOpen(chain, { family: 'spartan3e', run: (...a) => { runs++; return yosysNode(...a); }, depth: false });
  assert.deepEqual([runs, r0.depth.tried, r0.util.luts], [1, false, r.depth.luts[0]]);
  assert.equal(criticalDelay(r0.files['chain.json'], 'chain'), r.depth.ns[0]);
  // the counter: tried, not kept (no faster)
  const c = await synthesizeOpen(design(COUNTER, 'counter'), { family: 'spartan3e', run: yosysNode });
  assert.deepEqual([c.depth.tried, c.depth.kept, c.depth.second, c.depth.delays], [true, false, undefined, undefined]);
  assert.deepEqual(c.warnings, []);
});

// Regression (#83): ports that differ only in case reach the netlist as ports of their own
test('Yosys netlist: ports that differ only in case stay apart (a / A) (#83)', { timeout: 120000 }, async () => {
  const d = elaborate(compile([{ path: 'c.v', text: 'module c(input a, input A, output y, output Y); assign y = a & A; assign Y = a | A; endmodule' }]), 'c');
  const r = await synthesizeOpen(d, { run: yosysNode });
  const nl = readYosysJson(r.files['c.json'], { top: 'c' });
  assert.deepEqual(nl.ports.map(p => p.name).sort(), ['A', 'Y', 'a', 'y']);
  const sim = netlistSim(nl);
  sim.step({ a: 1, A: 0 });
  assert.deepEqual([sim.out().y, sim.out().Y], [0, 1]);
});

// Regression (#98): per-bit clocks of a for-generate reach Yosys as bits (it failed: "posedge … not
// 1 bit wide"); one flip-flop with an asynchronous clear per bit
test('Yosys: clocks and resets that are bits of a vector synthesize, one FDCE per bit (#98)', { timeout: 120000 }, async () => {
  const text = `library ieee; use ieee.std_logic_1164.all;
entity g is port (clks, rs, d : in std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0)); end;
architecture a of g is begin
  gen : for k in 0 to 3 generate
    process (clks(k), rs(k)) begin if rs(k) = '1' then q(k) <= '0'; elsif rising_edge(clks(k)) then q(k) <= d(k); end if; end process;
  end generate;
end;`;
  const r = await synthesizeOpen(elaborate(compile([{ path: 'g.vhd', text }]), 'g'), { run: yosysNode });
  assert.equal(r.cells.FDCE, 4);
});

test('shift registers read at a variable tap (#5) as SRL16E: a vector, past 16 stages (SRL16E per 16, falling edge), with an enable, a shift-chain array; a RAM stays a RAM; the netlists simulate like the designs', { timeout: 600000 }, async () => {
  const v = (text, top = 't') => elaborate(compile([{ path: 't.v', lang: 'verilog', text }]), top);
  const cases = [
    ['vector', `module t(input clk, input d, input [3:0] k, output q); reg [15:0] r = 0; always @(posedge clk) r <= {r[14:0], d}; assign q = r[k]; endmodule`,
      { BUFG: 1, IBUF: 6, OBUF: 1, SRL16E: 1 }, []],
    ['40 stages, falling edge', `module t(input clk, input d, input [5:0] k, output q); reg [39:0] r = 40'h12345; always @(negedge clk) r <= {r[38:0], d}; assign q = r[k]; endmodule`,
      { BUFG: 1, IBUF: 8, LUT3: 2, OBUF: 1, SRL16E_1: 5 }, []],
    ['enable, 32 stages', `module t(input clk, input ce, input d, input [4:0] k, output q); reg [31:0] r = 0; always @(posedge clk) if (ce) r <= {r[30:0], d}; assign q = r[k]; endmodule`,
      { BUFG: 1, IBUF: 8, LUT3: 1, OBUF: 1, SRL16E: 3 }, []],
    ['array', `module t(input clk, input [7:0] d, input [3:0] k, output [7:0] q); reg [7:0] m [0:15]; integer i; always @(posedge clk) begin for (i = 15; i > 0; i = i - 1) m[i] <= m[i-1]; m[0] <= d; end assign q = m[k]; endmodule`,
      { BUFG: 1, IBUF: 13, OBUF: 8, SRL16E: 8 }, []],   // (Yosys's "Replacing memory \\m with list of registers": on purpose here, left out)
    ['a RAM (written at an address)', `module t(input clk, input we, input [7:0] d, input [3:0] a, input [3:0] k, output [7:0] q); reg [7:0] m [0:15]; always @(posedge clk) if (we) m[a] <= d; assign q = m[k]; endmodule`,
      { BUFG: 1, IBUF: 18, OBUF: 8, RAM16X1D: 8 }, []],
  ];
  for (const [what, text, cells, warnings] of cases) {
    const design = v(text);
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual(Object.fromEntries(Object.entries(r.cells).sort()), cells, what);
    assert.deepEqual(r.warnings, warnings, what);
    const d = compareNetlist(design, r, { name: what, sim: { cycles: 400 } });
    assert.equal(d.status, 'pass', `${what}: ${d.report || d.reason}`);
  }
});

test('a shift register on the falling edge alone (SRL16E_1) gets its clock through a BUFG (#219)', { timeout: 120000 }, async () => {
  const design = elaborate(compile([{ path: 't.v', lang: 'verilog', text: 'module t(input clk, input d, output q); reg [7:0] r = 0; always @(negedge clk) r <= {r[6:0], d}; assign q = r[7]; endmodule' }]), 't');
  const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
  assert.deepEqual(Object.fromEntries(Object.entries(r.cells).sort()), { BUFG: 1, IBUF: 2, OBUF: 1, SRL16E_1: 1 });
});

// #282: the synthesis's Optimization Effort: Normal (the projects' default) one Yosys run, the usual mapping;
// High every mapping, the fastest kept (the default of synthesizeOpen, for the quality comparisons)
test('#282 Optimization Effort: Normal synthesizes once (no other mapping, no carry chains), High as before; the project\'s property', { timeout: 180000 }, async () => {
  assert.equal(synthEffort(undefined), 'normal');
  assert.equal(synthEffort({ optLevel: 1 }), 'normal');
  assert.equal(synthEffort({ optLevel: 2 }), 'high');
  assert.equal(synthEffort({ optLevel: '2' }), 'high');
  const chain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text: CHAIN }]), 'chain');
  const count = () => { const f = (...a) => { f.n++; return yosysNode(...a); }; f.n = 0; return f; };
  const normal = count(), high = count();
  const n = await synthesizeOpen(chain, { family: 'spartan3e', run: normal, effort: 'normal' });
  const hi = await synthesizeOpen(chain, { family: 'spartan3e', run: high });
  assert.equal(normal.n, 1);
  assert.ok(high.n > 3, String(high.n));
  assert.deepEqual([n.depth.tried, n.chains.length], [false, 0]);
  assert.deepEqual(n.warnings, []);
  // the usual mapping: slower than High's on this comparator chain, the same function
  assert.ok(criticalDelay(n.files['chain.json'], 'chain') > criticalDelay(hi.files['chain.json'], 'chain'));
  const d = compareNetlist(chain, n, { name: 'effort-normal-chain', sim: { cycles: 200 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
});
