// Open synthesis (core/synth-open.js): Silinx's front end + Yosys compiled to WebAssembly (YoWASP),
// here in Node (in the browser the same module runs in a Web Worker: test/ui/synth-open.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen as synthesizeOpenAll, synthEffort, yosysScript, yosysFiles, synthCommands, remapCommands, abc9RemapCommands, muxfRemapCommands, muxTrees, MUXF_MAP, MUXF_MAP_FILE, LUT6_MAP, LUT6_MAP_FILE, MUX_COUNT_FILE, criticalDelay, keepDepth, keepSecond, keepChains, sliceCount, cellCounts, utilization, lineStream, YOSYS_FAMILY, QUIET, DEPTH_ABC, DEPTH_ABC2, DEPTH_ABC3, DEPTH_ABC2_LUT4, MFS, DEPTH_ABC_FILE, PREMAP_FILE, DEPTH_RULE, LUT_LIB, LUT_LIB_FILE, abcInline, logicLevels, deepDesign, DEEP_RULE, DEPTH_SOPB, SOPB_RULE, pathEnds, criticalEnables, foldRemapCommands, speedRemapCommands, FOLD_CE_MAP, FOLD_CE_MAP_FILE, FOLD_CE_FILE, SPEED_ABC, SPEED_RULE, TOP_ONLY, memorySteps, logicMemories, MEMORIES_FILE, LUTRAM_COST, asText } from '../core/synth-open.js';
import { compareNetlist } from './diff-synth.js';
import { yosysNode } from '../core/synth-open-node.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { netlistSim } from './fpga-sim.js';
import { toVerilog } from '../core/synth-verilog.js';
// Normal's own synthesis (its mappings on these small designs), not a small design's as at High (SMALL_RULE, #652: its
// own test in open-flow-core.test.js)
const synthesizeOpen = (d, o = {}) => synthesizeOpenAll(d, { smallRule: { maxLuts: -1 }, ...o });
// the search for state machines (#539, #652: its runs at Normal too), apart from the runs the tests count
const FSM_PROBE = /silinx_fsm_(pre|forced)\.il/;

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
    + 'delete t:$scopeinfo; setattr -mod -unset blackbox =A:top; select =A:top; write_json -selected top.json; select -clear; write_verilog -noattr top_yosys.v; tee -q -o top_stat.txt stat');
  assert.equal(synthCommands('m', 'spartan3'), synthCommands('m', 'spartan3e').replaceAll('xc3se', 'xc3s'));
  assert.match(synthCommands('m', 'spartan3e', { srl: false }), /^synth_xilinx -family xc3se -ise -flatten -top m -run :map_luts; /);
  assert.doesNotMatch(yosysScript('m', 'spartan3e', { srl: false }), /xilinx_srl|silinx_srl/);
  // 6-input-LUT families: synth_xilinx as it is
  assert.equal(synthCommands('m', 'spartan6'), 'synth_xilinx -family xc6s -ise -flatten -top m');
  assert.match(yosysScript('m', 'spartan6'), /-family xc6s /);
  assert.throws(() => yosysScript('m', 'cyclone'), /no Yosys mapping for the device family 'cyclone'/);
  for (const f of ['spartan3', 'spartan3e', 'spartan3a', 'spartan3adsp', 'spartan6', 'virtex4', 'virtex5', 'virtex6', 'artix7', 'kintex7', 'zynq']) assert.ok(YOSYS_FAMILY[f], f);
});

// #86: synth_xilinx reads Yosys's whole Xilinx cell library (430 black boxes); the netlist's JSON has the top module
// alone (it had them all: 9 MB for blinky, about 0.9 s to write in every Yosys run), its netlist the same
test('the netlist\'s JSON has the top module alone, not the cell library\'s black boxes (#86), at both efforts', { timeout: 300000 }, async () => {
  for (const effort of ['normal', 'high']) {
    const r = await synthesizeOpen(design(COUNTER, 'counter'), { run: yosysNode, effort });
    const json = r.files['counter.json'];
    assert.deepEqual(Object.keys(JSON.parse(json).modules), ['counter'], effort);
    assert.ok(json.length < 100000, `${effort}: ${json.length} bytes`);
    assert.deepEqual(r.warnings, [], effort);
    // its readers take the top module: the netlist, its cells (4 flip-flops, the counter's LUTs and carry chain)
    const nl = readYosysJson(json);
    assert.equal(nl.cells.filter(c => /^FD/.test(c.type)).length, 4, effort);
    assert.equal(r.util.flipFlops, 4, effort);
    // the Verilog netlist and the statistics: the top module alone, as before
    assert.equal((r.files['counter_yosys.v'].match(/^module /gm) || []).length, 1, effort);
    assert.match(r.files['counter_stat.txt'], /=== counter ===/, effort);
  }
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
    // (without the ABC9 candidate, kept on both for its fewer slices, #377: its mappings of the two differ by 2 LUTs)
    const r = await synthesizeOpen(d, { run: yosysNode, abc9: false });
    return { cells: Object.fromEntries(Object.entries(r.cells).sort()), text: toVerilog(d).text };
  };
  const a = await cellsOf(VHD, 'rx.vhd'), b = await cellsOf(VLG, 'rx.v');
  assert.deepEqual(a.cells, b.cells);
  assert.match(a.text, /^ {8}sh\[cnt\] <= din;$/m, 'the 3-bit counter itself is the index');
  assert.match(a.text, /^ {6}ck <= 1'h0;$/m, 'the reset value is the constant');
});

// Regression (#514): an integer signal or variable of a range narrower than 32 bits was a 32-bit signed index,
// for which Yosys built a 32-bit carry chain to check a write's position (itc99-b12's critical path: 22 levels)
test('#514 VHDL bit indexes by integers of a range (natural range 3 downto 0, 2 to 5, -2 to 5; a signal, a variable): their own bits, the same cells as the Verilog design; the netlists simulate like the designs', { timeout: 300000 }, async () => {
  const VHD = `library ieee; use ieee.std_logic_1164.all;
entity idx is port (clk, rst : in std_logic; d : in natural range 3 downto 0; nl : out bit_vector(3 downto 0)); end idx;
architecture rtl of idx is
  signal i : natural range 3 downto 0;
begin
  process (clk) begin
    if rising_edge(clk) then
      i <= d;
      if rst = '1' then nl <= (others => '0'); else nl(i) <= '1'; end if;
    end if;
  end process;
end rtl;
`;
  const VLG = `module idx(input clk, input rst, input [1:0] d, output reg [3:0] nl);
  reg [1:0] i = 2'd3;
  always @(posedge clk) begin i <= d; if (rst) nl <= 4'd0; else nl[i] <= 1'b1; end
endmodule
`;
  const syn = async (text, p, top) => {
    const d = elaborate(compile([{ path: p, text }]), top);
    return { d, r: await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode, effort: 'normal' }), text: toVerilog(d).text };
  };
  const a = await syn(VHD, 'idx.vhd', 'idx'), b = await syn(VLG, 'idx.v', 'idx');
  assert.match(a.text, /^ {6}nl\[i\] <= 1'h1;$/m, 'the 2-bit signal itself is the index');
  // (were 23 LUTs and 65 carry cells: a decoder of 4 LUTs; Yosys's own negation of the index, 2 bits, on the carry)
  assert.deepEqual([a.r.util.luts, a.r.util.carry], [4, 5]);
  assert.deepEqual(Object.fromEntries(Object.entries(a.r.cells).sort()), Object.fromEntries(Object.entries(b.r.cells).sort()));
  assert.deepEqual(a.r.warnings, []);
  const c = compareNetlist(a.d, a.r, { name: 'int-index', seed: 'idx', sim: { cycles: 400, ranges: { d: [0, 3] } } });
  assert.equal(c.status, 'pass', c.report || c.reason);
  // a variable, an ascending vector, a vector from 2, one from -2 indexed by an integer that goes below 0: the
  // position in the bits of the integer and of the vector, with sized literals (a size cast: Yosys's negation at 33 bits)
  const IX = `library ieee; use ieee.std_logic_1164.all;
entity ix is port (clk, en, din : in std_logic; d : in natural range 0 to 7; e : in integer range -2 to 5;
  q : out std_logic_vector(7 downto 0); r : out std_logic_vector(0 to 7); o : out std_logic_vector(5 downto 2); s : out std_logic_vector(5 downto -2); b, c : out std_logic); end;
architecture rtl of ix is
  signal i : natural range 0 to 7;
  signal j : natural range 2 to 5;
  signal sh : std_logic_vector(7 downto 0);
  signal ra : std_logic_vector(0 to 7);
  signal so : std_logic_vector(5 downto 2);
  signal ss : std_logic_vector(5 downto -2);
begin
  process (clk)
    variable k : natural range 7 downto 0;
  begin
    if rising_edge(clk) then
      i <= d;
      j <= 2 + d / 2;
      k := 7 - d;
      if en = '1' then
        sh(i) <= din;
        ra(k) <= din;
        so(j) <= din;
        ss(e) <= din;
      end if;
      c <= ra(k);
    end if;
  end process;
  q <= sh; r <= ra; o <= so; s <= ss; b <= sh(i);
end;
`;
  const x = await syn(IX, 'ix.vhd', 'ix');
  assert.match(x.text, /^ {6}sh\[i\] <= din;$/m);
  assert.match(x.text, /^ {6}ra\[\(3'd7 - p\w+\)\] <= din;$/m);
  assert.match(x.text, /^ {6}so\[\(j - 3'd2\)\] <= din;$/m);
  assert.match(x.text, /^ {6}ss\[\(e \+ 4'd2\)\] <= din;$/m);
  assert.match(x.text, /c <= 1'\(ra >> \(3'd7 - p\w+\)\);/);
  assert.doesNotMatch(x.text, /\[\(?\$signed/, 'no index as a 32-bit signed number');
  // (were 127 LUTs and 265 carry cells; its 8:1 reads on MUXF5 / MUXF6, #511: 66 LUTs without them)
  assert.deepEqual([x.r.util.luts, x.r.util.carry, x.r.depth.muxf?.kept], [60, 35, true]);
  assert.deepEqual(x.r.warnings, []);
  const cx = compareNetlist(x.d, x.r, { name: 'int-index-ix', seed: 'ix', sim: { cycles: 600, ranges: { d: [0, 7], e: [-2, 5] } } });
  assert.equal(cx.status, 'pass', cx.report || cx.reason);
});

// Regression (#523): an element written with its own value on one side (x[i] <= c ? v : x[i]) read the element, a
// multiplexer of the whole vector (iwls05-spi's 128:1, on its critical path), only to write the same bit back: now
// the conditional write if (c) x[i] <= v; not after another write to the vector in the process (x[i] keeps that
// value there), nor through a call
test('#523 an element written back with its own value (x[i] <= c ? v : x[i], VHDL\'s when / else and if / else): a conditional write without reading the vector, in Verilog and in VHDL; the netlists simulate like the designs', { timeout: 300000 }, async () => {
  const VLG = `module rb(input clk, c, v, clr, input [2:0] i, j, output reg [7:0] q, r, s, t);
  function [2:0] f(input [2:0] a); f = a ^ 3'd5; endfunction
  always @(posedge clk) begin
    q[i] <= c ? v : q[i];
    r[i + 3'd1] <= c ? r[i + 3'd1] : v;
    if (clr) s[j] <= 1'b0;
    s[i] <= c ? v : s[i];
    t[f(i)] <= c ? v : t[f(i)];
  end
endmodule`;
  const VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity rb is port (clk, c, v, clr : in std_logic; i, j : in unsigned(2 downto 0); q, r, s, t : out std_logic_vector(7 downto 0)); end;
architecture rtl of rb is
  signal qq, rr, ss, tt : std_logic_vector(7 downto 0);
  function f(a : unsigned(2 downto 0)) return unsigned is begin return a xor "101"; end;
begin
  process (clk) begin
    if rising_edge(clk) then
      qq(to_integer(i)) <= v when c = '1' else qq(to_integer(i));
      if c = '1' then rr(to_integer(i + 1)) <= rr(to_integer(i + 1)); else rr(to_integer(i + 1)) <= v; end if;
      if clr = '1' then ss(to_integer(j)) <= '0'; end if;
      ss(to_integer(i)) <= v when c = '1' else ss(to_integer(i));
      tt(to_integer(f(i))) <= v when c = '1' else tt(to_integer(f(i)));
    end if;
  end process;
  q <= qq; r <= rr; s <= ss; t <= tt;
end;`;
  const syn = async (text, p) => {
    const d = elaborate(compile([{ path: p, text }]), 'rb');
    return { d, r: await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode, effort: 'normal' }), text: toVerilog(d).text };
  };
  const a = await syn(VLG, 'rb.v'), b = await syn(VHD, 'rb.vhd');
  assert.match(a.text, /^ {4}if \(c\) begin\n {6}q\[i\] <= v;\n {4}end\n/m);
  assert.match(a.text, /^ {4}if \(!\(c\)\) begin\n {6}r\[3'\(i \+ 3'h1\)\] <= v;\n {4}end\n/m);
  assert.match(b.text, /^ {4}if \(\(c == 1'h1\)\) begin\n {6}qq\[i\] <= v;\n {4}end\n/m);
  assert.match(b.text, /^ {4}if \(\(c == 1'h1\)\) begin\n {4}end else begin\n {6}rr\[3'\(i \+ 3'h1\)\] <= v;\n {4}end\n/m, 'rr(i + 1) <= rr(i + 1): nothing');
  // after a write to s (s[j] <= 0 when clr, then s[i] keeps it), and an index through a function: as written
  assert.match(a.text, /^ {4}s\[i\] <= \(c \? 1'\(v\) : 1'\(1'\(s >> i\)\)\);$/m);
  assert.match(a.text, /^ {4}t\[fn_f\(i\)\] <= \(c \? 1'\(v\) : 1'\(1'\(t >> fn_f\(i\)\)\)\);$/m);
  assert.match(b.text, /^ {4}ss\[i\] <= \(\(c == 1'h1\) \? 1'\(v\) : 1'\(1'\(ss >> i\)\)\);$/m);
  assert.match(b.text, /^ {4}tt\[fn_f\(i\)\] <= /m);
  // (were 82 and 80 LUTs, 12 MUXF5 / MUXF6 each: the 8:1 reads of q and r)
  for (const x of [a, b]) {
    assert.deepEqual([x.r.util.luts, x.r.util.muxes], [71, 6]);
    assert.deepEqual(x.r.warnings, []);
    assert.deepEqual(x.d.diags, []);
    const c = compareNetlist(x.d, x.r, { name: 'read-back', seed: 'rb', sim: { cycles: 600 } });
    assert.equal(c.status, 'pass', c.report || c.reason);
  }
});

// ------------------------------------------------------------------ logic depth (#52, 15.10.3)
const cell = (type, ins, outs) => ({ type, port_directions: { ...Object.fromEntries(Object.keys(ins).map(p => [p, 'input'])), ...Object.fromEntries(Object.keys(outs).map(p => [p, 'output'])) },
  connections: { ...Object.fromEntries(Object.entries(ins).map(([p, b]) => [p, [b]])), ...Object.fromEntries(Object.entries(outs).map(([p, b]) => [p, [b]])) } });
const netlistOf = cells => ({ modules: { t: { attributes: { top: 1 }, cells } } });

test('logic depth: the scripts (the design before the LUT mapping written, mapped again by the depth-oriented ABC script)', () => {
  // (and the wide multiplexer trees counted on a copy of it, #511; the memories left to logic counted, #54)
  const S = 'synth_xilinx -family xc3se -ise -flatten -top top';
  assert.equal(yosysScript('top', 'spartan3e', { premap: PREMAP_FILE }), yosysScript('top', 'spartan3e').replace(`${S} -run :fine;`, `${memorySteps(S, { count: true })};`).replace('abc -luts', 'write_rtlil silinx_premap.il; '
    + 'design -save silinx_premap; muxcover -mux8 -mux16 -nodecode -nopartial; tee -q -o silinx_muxes.txt select -count t:$_MUX8_ t:$_MUX16_; design -load silinx_premap; abc -luts'));
  assert.equal(remapCommands('top', 'spartan3e'), 'read_rtlil silinx_premap.il; abc -luts 1,1,1,1,2,4 -script silinx_depth.abc; clean; techmap -map +/xilinx/ff_map.v; '
    + 'techmap -map silinx_lut6_map.v t:$lut r:WIDTH=6 %i; techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; synth_xilinx -family xc3se -ise -flatten -top top -run finalize:');
  // (the usual mapping, onto LUT4s alone, has no 6-input function to split: no LUT6_MAP, #54)
  assert.ok(!synthCommands('top', 'spartan3e').includes(LUT6_MAP_FILE));
  // onto LUT4s alone (#370): no 6-input function to split either
  assert.equal(remapCommands('top', 'spartan3e', { luts: '1,1,1,1' }), 'read_rtlil silinx_premap.il; abc -luts 1,1,1,1 -script silinx_depth.abc; clean; techmap -map +/xilinx/ff_map.v; '
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

test('#653 the ends of the estimated paths: each flip-flop pin with its arrival and setup; the clock enables that end the critical path', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  // FF -> LUT -> CE of f2 (critical), the same LUT into f3's D (inside the slice)
  const cells = { f1: cell('FDRE', { C: 2, D: 3, CE: '1', R: '0' }, { Q: 10 }), l1: cell('LUT1', { I0: 10 }, { O: 11 }),
    f2: cell('FDRE', { C: 2, D: 3, CE: 11, R: '0' }, { Q: 13 }), f3: cell('FDCE', { C: 2, D: 11, CE: '1', CLR: '0' }, { Q: 14 }) };
  const { worst, ends } = pathEnds(netlistOf(cells), 't');
  close(worst, 0.59 + 0.45 + 0.70 + 0.45 + 0.55);
  const by = Object.fromEntries(ends.map(e => [`${e.cell}.${e.port}`, e]));
  assert.deepEqual(Object.keys(by).sort(), ['f2.CE', 'f3.D'], 'the pins driven by logic (not the constants, not the inputs)');
  close(by['f3.D'].ns, 0.59 + 0.45 + 0.70 + 0.13);
  assert.equal(by['f2.CE'].type, 'FDRE');
  assert.equal(criticalDelay(netlistOf(cells), 't'), worst);
  assert.deepEqual(criticalEnables(netlistOf(cells), 't'), ['f2']);
  // f3's D 0.87 ns from the worst, within the margin: not an enable; none when the critical path ends on a D
  assert.deepEqual(criticalEnables(netlistOf(cells), 't', 1), ['f2']);
  delete cells.f2;
  assert.deepEqual(criticalEnables(netlistOf(cells), 't', 1), []);
});

test('#652 #653 the mappings for speed: their scripts, from the design before the LUT mapping', () => {
  const tail = 'clean; techmap -map +/xilinx/ff_map.v; techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; synth_xilinx -family xc3se -ise -flatten -top top -run finalize:';
  const speed = '+strash;&get,-n;&fraig,-x;&put;scorr;dc2;dretime;strash;dch,-f;if;speedup;if;mfs2;lutpack,-S,1';
  assert.equal(speedRemapCommands('top', 'spartan3e'), `read_rtlil silinx_premap.il; abc -luts 1,1,1,1 -script ${speed}; ${tail}`);
  // (the usual mapping's own script, Yosys's for -luts, with ABC's speedup after the first mapping)
  assert.match(SPEED_ABC, /dch -f; if; speedup; if; mfs2; lutpack -S 1$/);
  const fold = 'read_rtlil silinx_premap.il; select -set silinx_fold -read silinx_fold_ce.txt; techmap -max_iter 1 -map silinx_fold_ce.v @silinx_fold; select -clear; opt_expr -mux_undef -noclkinv; ';
  assert.equal(foldRemapCommands('top', 'spartan3e'), `${fold}abc -luts 1,1,1,1; ${tail}`);
  assert.equal(foldRemapCommands('top', 'spartan3e', { script: SPEED_ABC }), `${fold}abc -luts 1,1,1,1 -script ${speed}; ${tail}`);
  assert.deepEqual([FOLD_CE_MAP_FILE, FOLD_CE_FILE], ['silinx_fold_ce.v', 'silinx_fold_ce.txt']);
  // every flip-flop with a clock enable that synth_xilinx makes on the 4-input-LUT families, both clock edges
  for (const t of ['FDRE', 'FDSE', 'FDCE', 'FDPE']) for (const n of [t, `${t}_1`]) assert.match(FOLD_CE_MAP, new RegExp(`^module ${n} \\(`, 'm'), n);
  assert.deepEqual(SPEED_RULE, { maxLuts: 1500, margin: 0.05 });
});

// the fold of FOLD_CE_MAP on every flip-flop of a design (each kind: synchronous reset and set, asynchronous clear and
// preset, both edges): the netlist simulates as the design, its flip-flops' CE tied high
test('#653 FOLD_CE_MAP: every kind of flip-flop with its clock enable folded into D simulates as the design', { timeout: 300000 }, async () => {
  const FF = `library ieee; use ieee.std_logic_1164.all;
entity ffs is port (clk, rst, e1, e2 : in std_logic; d : in std_logic_vector(4 downto 0); q : out std_logic_vector(4 downto 0)); end ffs;
architecture rtl of ffs is
  signal r : std_logic_vector(4 downto 0) := "00000";
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then r(0) <= '0'; elsif e1 = '1' and e2 = '0' then r(0) <= d(0); end if;
      if rst = '1' then r(1) <= '1'; elsif e1 = '0' or e2 = '1' then r(1) <= d(1); end if;
    end if;
  end process;
  process (clk, rst) begin
    if rst = '1' then r(2) <= '0'; r(3) <= '1';
    elsif rising_edge(clk) then if e1 = '1' then r(2) <= d(2); r(3) <= d(3) xor d(2); end if; end if;
  end process;
  process (clk) begin
    if falling_edge(clk) then if e2 = '1' and e1 = '1' then r(4) <= d(4); end if; end if;
  end process;
  q <= r;
end rtl;
`;
  const des = design(FF, 'ffs');
  const { text, top } = toVerilog(des);
  const out = await yosysNode(['-q', '-p', yosysScript(top, 'spartan3e', { premap: PREMAP_FILE })], yosysFiles(top, text));
  const usual = JSON.parse(out[`${top}.json`]).modules[top].cells;
  const ffs = Object.entries(usual).filter(([, c]) => /^FD/.test(c.type) && c.connections.CE.some(b => typeof b === 'number'));
  assert.deepEqual(ffs.map(([, c]) => c.type).sort(), ['FDCE', 'FDPE', 'FDRE', 'FDRE_1', 'FDSE'], 'every kind, an enable each');
  const outF = await yosysNode(['-q', '-p', `${foldRemapCommands(top, 'spartan3e')}; delete t:$scopeinfo; ${TOP_ONLY}; write_json -selected ${top}.json`],
    { [PREMAP_FILE]: out[PREMAP_FILE], [FOLD_CE_MAP_FILE]: FOLD_CE_MAP, [FOLD_CE_FILE]: ffs.map(([n]) => `${top}/${n}\n`).join('') });
  const json = outF[`${top}.json`];
  const folded = JSON.parse(json).modules[top].cells;
  for (const [n, c] of ffs) {
    assert.equal(folded[n]?.type, c.type, n);
    assert.deepEqual(folded[n].connections.CE, ['1'], `${n}: its enable in D`);
  }
  const syn = { top, files: { [`${top}.json`]: json }, cells: cellCounts(json, top) };
  const cmp = compareNetlist(des, syn, { name: 'fold-ce', seed: 'fold', sim: { cycles: 400 } });
  assert.equal(cmp.status, 'pass', cmp.report || cmp.reason);
});

// Regression (#653): a flip-flop whose enable, a LUT of two LUTs, ended the critical path on its CE (Tceck 0.55 ns after
// it): the enable's last LUT and the hold are one LUT before D now, at both efforts; the netlist simulates as the design
test('#653 an enable on the critical path folded into the D logic: one LUT before D instead of the CE\'s setup, kept by DEPTH_RULE, at both efforts', { timeout: 300000 }, async () => {
  const CE = `library ieee; use ieee.std_logic_1164.all;
entity ce is port (clk, d : in std_logic; a, b : in std_logic_vector(3 downto 0); q : out std_logic); end ce;
architecture rtl of ce is
  signal ra, rb : std_logic_vector(3 downto 0) := (others => '0');
  signal rd, r : std_logic := '0';
begin
  process (clk) begin
    if rising_edge(clk) then
      ra <= a; rb <= b; rd <= d;
      if ra = "1011" and rb = "0110" then r <= rd; end if;
    end if;
  end process;
  q <= r;
end rtl;
`;
  const des = design(CE, 'ce');
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  for (const effort of ['normal', 'high']) {
    const r = await synthesizeOpen(des, { run: yosysNode, effort });
    const json = r.files['ce.json'];
    // (it was 0.59 + 2 LUTs and their connections + 0.45 + the CE's 0.55: 3.89 ns)
    close(criticalDelay(json, 'ce'), 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.13);
    assert.deepEqual(criticalEnables(json, 'ce'), [], effort);
    assert.deepEqual({ ...r.depth.fold, ns: +r.depth.fold.ns.toFixed(2) }, { flipFlops: 1, ns: 3.02, luts: 3, slices: 5, kept: true }, effort);
    assert.equal(r.depth.speed.kept, false, effort);
    assert.deepEqual([r.util.luts, r.util.flipFlops], [3, 10], effort);
    assert.deepEqual(r.warnings, [], effort);
    const cmp = compareNetlist(des, r, { name: `fold-${effort}`, seed: 'ce', sim: { cycles: 600 } });
    assert.equal(cmp.status, 'pass', cmp.report || cmp.reason);
  }
  // speed: false, the netlist as before
  const before = await synthesizeOpen(des, { run: yosysNode, effort: 'normal', speed: false });
  close(criticalDelay(before.files['ce.json'], 'ce'), 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.45 + 0.55);
  assert.equal(before.depth.fold, undefined);
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

// #377: the slices too, when known (sliceCount: core/fpga/pack.js's count): a netlist with 5 % fewer slices is
// smaller even with more LUTs; fewer LUTs, more slices is not; a faster one is not larger in slices either
// Regression (#742): the netlist with the carry chains against the one without them, both ways. The EPFL adder in the
// corpus's I/O wrapper: its chains' netlist 17.81 ns estimated, 171 LUTs, 194 slices; without them the SOP-balanced
// one (#654) 9.92 ns, 675 LUTs, 338 slices, kept before (the chains had to beat it, it never had to beat them), routed
// 12.98 -> 11.84 ns, 9 % faster for 4 times the LUTs
test('#742 the carry chains\' netlist against the one without them, both ways: the EPFL adder keeps its chains; a chain netlist driven twice never kept (#746)', () => {
  const chains = { ns: 17.81, luts: 171, slices: 194 }, sopb = { ns: 9.92, luts: 675, slices: 338 };
  assert.equal(keepChains(sopb, chains), true);
  // (as before: the chains kept only when better than the netlist without them, here not)
  assert.equal(keepDepth([sopb.ns, chains.ns], [sopb.luts, chains.luts], DEPTH_RULE, [sopb.slices, chains.slices]), false);
  // without them kept when better than the chains by the rule: faster with no more LUTs, or as fast and 5 % smaller
  assert.equal(keepChains({ ns: 10, luts: 160, slices: 190 }, chains), false);
  assert.equal(keepChains({ ns: 17.9, luts: 150, slices: 180 }, chains), false);
  // neither better: the chains
  assert.equal(keepChains({ ns: 17.81, luts: 171, slices: 194 }, chains), true);
  // the EPFL multiplier's chains' run warned that nets are driven twice (#746): never kept, whatever its numbers
  const twice = 'Warning: multiple conflicting drivers for top.\\n13325:';
  assert.equal(keepChains(sopb, chains, { linesC: [twice], linesN: [] }), false);
  // (unless the run without them warns the same: the design's own, not the rewrite's)
  assert.equal(keepChains(sopb, chains, { linesC: [twice], linesN: [twice] }), true);
});

// Regression (#746): the EPFL multiplier's chains' netlist, once driven once, estimated 111.32 ns, 5322 LUTs, 2768
// slices; without them 52.20 ns, 8729 LUTs, 4365 slices (routed 128.6 -> 63.9 ns): 2.1 times faster for 1.6 times the
// LUTs and slices, refused by DEPTH_RULE alone (its gain, 53 %, below the LUTs' growth, 64 %)
test('#746 the netlist without the chains kept when larger by no more times than it is faster: the EPFL multiplier\'s; the adder\'s not', () => {
  const chains = { ns: 111.32, luts: 5322, slices: 2768 }, none = { ns: 52.2, luts: 8729, slices: 4365 };
  assert.equal(keepDepth([chains.ns, none.ns], [chains.luts, none.luts], DEPTH_RULE, [chains.slices, none.slices]), false);
  assert.equal(keepChains(none, chains), false);
  // (the LUTs or the slices more times larger than it is faster: the chains)
  const k = chains.ns / none.ns;
  assert.equal(keepChains({ ...none, luts: Math.ceil(chains.luts * k) + 1 }, chains), true);
  assert.equal(keepChains({ ...none, slices: Math.ceil(chains.slices * k) + 1 }, chains), true);
  assert.equal(keepChains({ ...none, luts: Math.floor(chains.luts * k), slices: Math.floor(chains.slices * k) }, chains), false);
  // (slices unknown: the LUTs alone)
  assert.equal(keepChains({ ...none, slices: null }, { ...chains, slices: null }), false);
  // (not faster by the rule's gain: the chains, the netlist without them larger)
  assert.equal(keepChains({ ns: chains.ns * (1 - DEPTH_RULE.gain / 2), luts: chains.luts + 1, slices: chains.slices + 1 }, chains), true);
  // the EPFL adder's (above): 1.8 times faster for 3.9 times the LUTs, the chains kept
  assert.equal(keepChains({ ns: 9.92, luts: 675, slices: 338 }, { ns: 17.81, luts: 171, slices: 194 }), true);
});

test('#377 logic depth: the rule weighs the slices too, when known; sliceCount packs a netlist as the open flow', () => {
  assert.ok(keepDepth([10, 10.05], [100, 104], DEPTH_RULE, [80, 76]), '5 % fewer slices, more LUTs, as fast: smaller');
  assert.ok(!keepDepth([10, 10.05], [100, 104], DEPTH_RULE, [80, 77]), 'not 5 % fewer slices');
  assert.ok(!keepDepth([3.78, 3.78], [64, 81], DEPTH_RULE, [57, 52]), 'the adder fixture\'s ABC9 netlist: 9 % fewer slices, 27 % more LUTs');
  assert.ok(keepDepth([10, 10], [100, 110], DEPTH_RULE, [80, 76]) && !keepDepth([10, 10], [100, 111], DEPTH_RULE, [80, 76]), 'fewer slices, at most 10 % more LUTs');
  assert.ok(!keepDepth([10, 10.05], [100, 104]), 'without the slices: larger');
  assert.ok(!keepDepth([10, 10.05], [100, 90], DEPTH_RULE, [80, 81]), '10 % fewer LUTs, more slices: not smaller');
  assert.ok(keepDepth([10, 10.05], [100, 90], DEPTH_RULE, [80, 80]), '10 % fewer LUTs, as many slices');
  assert.ok(!keepDepth([10, 9], [100, 105], DEPTH_RULE, [80, 90]), '10 % faster, 12 % more slices');
  assert.ok(keepDepth([10, 9], [100, 105], DEPTH_RULE, [80, 88]), '10 % faster, 10 % more slices');
  assert.ok(!keepDepth([10, 10], [100, 100], DEPTH_RULE, [80, 80]) && keepDepth([10, 10], [100, 100], DEPTH_RULE, [80, 79]), 'the same; one slice fewer');
  assert.ok(!keepDepth([10, 10], [100, 99], DEPTH_RULE, [80, 81]), 'one LUT fewer, a slice more');
  assert.ok(!keepDepth([10, 10.11], [100, 50], DEPTH_RULE, [80, 40]), 'more than 1 % slower');
  // #54 (regression, #648): a faster netlist's slices no more in proportion than it is faster: femtorv32-quark's third
  // balancing with LUT6_MAP (3.7 % faster by the estimate, 8.8 % more slices than the second, slower once routed)
  assert.ok(!keepDepth([16.9, 16.28], [642, 680], DEPTH_RULE, [409, 445]), '3.7 % faster, 8.8 % more slices');
  assert.ok(!keepDepth([10, 9.6], [100, 105], DEPTH_RULE, [80, 84]) && keepDepth([10, 9.6], [100, 105], DEPTH_RULE, [80, 83]), '4 % faster: 4 % more slices at most');
  assert.ok(keepDepth([10, 9.6], [100, 108]), 'the slices unknown: the LUTs\' bound alone (10 %)');
  // #54: faster with no more slices, up to `luts` more LUTs again (verilog-uart's ABC9 netlist)
  assert.ok(keepDepth([8.07, 7.28], [130, 148], DEPTH_RULE, [130, 125]), '10 % faster, fewer slices, 14 % more LUTs');
  assert.ok(keepDepth([10, 9], [100, 120], DEPTH_RULE, [80, 80]) && !keepDepth([10, 9], [100, 121], DEPTH_RULE, [80, 80]), '10 % faster, as many slices: 20 % more LUTs at most');
  assert.ok(!keepDepth([10, 9], [100, 115], DEPTH_RULE, [80, 81]) && !keepDepth([10, 9], [100, 115]), 'more slices, or the slices unknown: 10 % more LUTs at most');
  // a slice count unknown (a netlist that does not pack): the LUTs alone
  assert.ok(keepDepth([10, 10.1], [100, 95], DEPTH_RULE, [null, 99]));
  assert.ok(keepSecond([20, 10, 9.9], [100, 110, 112], DEPTH_RULE, [80, 90, 85]), 'not 3 % faster than the first, but 5 % fewer slices');
  assert.ok(!keepSecond([20, 10, 9], [100, 110, 108], DEPTH_RULE, [80, 88, 130]), 'faster than the first, but 62 % more slices than the usual one for 55 % of speed');
  // sliceCount: two LUT4s into flip-flops of the same clock, in one slice; a netlist that does not pack: null
  const ff = (d, q) => cell('FDRE', { C: 2, D: d, CE: '1', R: '0' }, { Q: q });
  const lut = (o, init) => ({ ...cell('LUT4', { I0: 3, I1: 4, I2: 5, I3: 6 }, { O: o }), parameters: { INIT: init } });
  const two = { a: lut(10, '1000000000000000'), b: lut(11, '0111111111111110'), f: ff(10, 12), g: ff(11, 13) };
  assert.equal(sliceCount(netlistOf(two), 't'), 1);
  assert.equal(sliceCount('{"modules":{}}', 't'), null);
});

// Regression (#54): a shifter onto LUT4s alone, its 2:1 multiplexers in LUT3s (with the wider functions,
// as before: 213 LUTs and 120 MUXF5 / MUXF6), equal to the RTL; a rotator too. Since LUT6_MAP the wider
// mapping's 4:1 multiplexers are two LUT4s into a MUXF5 each: the shifter's then as fast with 2 LUTs fewer, kept
test('a 32-bit shifter and a rotator: onto LUT4s alone, or with the 4:1 multiplexers as two LUT4s and a MUXF5 (LUT6_MAP); not 6-input functions of four LUT4s (#54)', { timeout: 300000 }, async () => {
  const SHL = `module shl(input clk, input [31:0] d, input [4:0] s, output reg [31:0] q);
  reg [31:0] rd; reg [4:0] rs;
  always @(posedge clk) begin rd <= d; rs <= s; q <= rd << rs; end
endmodule
`;
  const shl = elaborate(compile([{ path: 'shl.v', lang: 'verilog', text: SHL }]), 'shl');
  const r = await synthesizeOpen(shl, { family: 'spartan3e', run: yosysNode });
  assert.deepEqual([r.util.luts, r.util.muxes, r.depth.wide.kept, r.depth.kept], [139, 47, true, false], JSON.stringify(r.depth));
  assert.equal(r.cells.MUXF6 || 0, 0);
  assert.ok(r.depth.wide.ns <= r.depth.ns[0], JSON.stringify(r.depth));
  assert.deepEqual(r.warnings, []);
  const d = compareNetlist(shl, r, { name: 'lut4-shl', sim: { cycles: 300 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
  const rot = elaborate(compile([{ path: 'rot.v', lang: 'verilog', text: SHL.replace('rd << rs', '(rd << rs) | (rd >> (32 - rs))').replace(/shl/g, 'rot') }]), 'rot');
  const r2 = await synthesizeOpen(rot, { family: 'spartan3e', run: yosysNode });
  // (raised by Yosys 0.70 (#368): 313 LUTs with 0.68, 319 with 0.70; 313 again with the speedup's mapping, #652: as fast,
  // 6 LUTs and 4 slices fewer)
  assert.deepEqual([r2.util.luts, r2.util.muxes, r2.depth.wide.kept, r2.depth.speed.kept, r2.depth.speed.luts], [313, 0, false, true, 313], JSON.stringify(r2.depth));
  const d2 = compareNetlist(rot, r2, { name: 'lut4-rot', sim: { cycles: 300 } });
  assert.equal(d2.status, 'pass', d2.report || JSON.stringify(d2));
});

// #54: a 6-input function of the wider mapping split on the input whose cofactors are of 4 inputs at most (LUT6_MAP):
// two LUT4s into a MUXF5; one without such an input left to lut_map.v (four LUT4s, two MUXF5, a MUXF6); each netlist
// equal to its table on all 64 inputs
test('#54 LUT6_MAP: a 6-input function with a select of two 4-input cofactors is two LUT4s and a MUXF5, the others as lut_map.v splits them; every one its own table', { timeout: 120000 }, async () => {
  // a table of 64 bits from f(x), x the 6 inputs as a number
  const table = f => Array.from({ length: 64 }, (_, x) => f(x) & 1);
  const bit = (x, k) => (x >> k) & 1;
  const mux4 = (s1, s0, d) => x => bit(x, d[bit(x, s1) * 2 + bit(x, s0)]);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  // a random function of 4 of the inputs (not v) for each value of input v
  const split = v => { const fs = [0, 1].map(() => { const ins = [0, 1, 2, 3, 4, 5].filter(k => k !== v).sort(() => rnd() - 0.5).slice(0, 4); const t = Array.from({ length: 16 }, () => (rnd() < 0.5 ? 1 : 0)); return x => t[ins.reduce((i, k, j) => i | (bit(x, k) << j), 0)]; }); return x => fs[bit(x, v)](x); };
  const cases = [
    ['4:1 multiplexer, selects 5 and 4', table(mux4(5, 4, [0, 1, 2, 3])), 2],
    ['4:1 multiplexer, selects 0 and 3', table(mux4(0, 3, [1, 2, 4, 5])), 2],
    ['split on input 0', table(split(0)), 2],
    ['split on input 2', table(split(2)), 2],
    ['split on input 5', table(split(5)), 2],
    ['a cofactor constant', table(x => bit(x, 1) & bit(x, 0) & bit(x, 2) & bit(x, 3) & bit(x, 4)), 2],
    ['parity of 6 (no such input)', table(x => [0, 1, 2, 3, 4, 5].reduce((p, k) => p ^ bit(x, k), 0)), 4],
    ['8 of the 16 values of 5 inputs by input 5 (no such input)', table(x => (bit(x, 5) ? [0, 1, 2, 3, 4].reduce((p, k) => p ^ bit(x, k), 0) : bit(x, 0) & bit(x, 1) | bit(x, 2) & bit(x, 3) & bit(x, 4))), 4],
  ];
  // (RTLIL: Yosys's Verilog reads \\$lut as a module of that name, not its $lut cell)
  const il = `module \\top\n  wire width 6 input 1 \\a\n  wire width ${cases.length} output 2 \\y\n${cases.map(([, t], i) => `  cell $lut \\l${i}\n    parameter \\WIDTH 6\n    parameter \\LUT 64'${[...t].reverse().join('')}\n    connect \\A \\a\n    connect \\Y \\y [${i}]\n  end\n`).join('')}end\n`;
  const out = await yosysNode(['-q', '-p', `read_rtlil t.il; hierarchy -top top; techmap -map ${LUT6_MAP_FILE}; techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; opt_clean; write_json o.json`],
    { 't.il': il, [LUT6_MAP_FILE]: LUT6_MAP });
  const nl = readYosysJson(out['o.json'], { top: 'top' });
  // the LUT4s of each output: those of its cone
  const driver = new Map(nl.cells.flatMap(c => Object.entries(c.pins).filter(([p]) => p === 'O').map(([, n]) => [n, c])));
  const cone = (n, seen = new Set()) => { const c = driver.get(n); if (!c || seen.has(c)) return seen; seen.add(c); for (const [p, m] of Object.entries(c.pins)) if (p !== 'O') cone(m, seen); return seen; };
  const yNets = nl.ports.find(p => p.name === 'y').bits;
  const sim = netlistSim(nl);
  cases.forEach(([what, t, luts], i) => {
    const cells = [...cone(yNets[i].net)].map(c => c.type).sort();
    assert.equal(cells.filter(c => /^LUT/.test(c)).length, luts, `${what}: ${cells}`);
    assert.deepEqual(cells.filter(c => /^MUXF/.test(c)), luts === 2 ? ['MUXF5'] : ['MUXF5', 'MUXF5', 'MUXF6'], what);
    for (let x = 0; x < 64; x++) {
      sim.step(Object.fromEntries([0, 1, 2, 3, 4, 5].map(k => [`a<${k}>`, bit(x, k)])));
      assert.equal(sim.out()[`y<${i}>`], t[x], `${what}: input ${x}`);
    }
  });
});

// Regression (#54): a barrel rotator written as gates (as the EPFL barrel shifter: decoded 4:1 multiplexers);
// the wider mapping's 4:1 multiplexers two LUT4s and a MUXF5 each (four LUT4s, two MUXF5 and a MUXF6 before),
// that mapping kept, equal to the RTL; at Normal (one mapping) onto LUT4s alone as before
const ROT_GATES = `module rotg(input clk, input [31:0] d, input [3:0] s, output reg [31:0] q);
  reg [31:0] rd; reg [3:0] rs;
  wire [31:0] m1, m2;
  genvar i;
  for (i = 0; i < 32; i = i + 1) begin : g
    assign m1[i] = (rd[i] & ~rs[1] & ~rs[0]) | (rd[(i + 1) % 32] & ~rs[1] & rs[0]) | (rd[(i + 2) % 32] & rs[1] & ~rs[0]) | (rd[(i + 3) % 32] & rs[1] & rs[0]);
    assign m2[i] = (m1[i] & ~rs[3] & ~rs[2]) | (m1[(i + 4) % 32] & ~rs[3] & rs[2]) | (m1[(i + 8) % 32] & rs[3] & ~rs[2]) | (m1[(i + 12) % 32] & rs[3] & rs[2]);
  end
  always @(posedge clk) begin rd <= d; rs <= s; q <= m2; end
endmodule
`;
test('#54 a barrel rotator written as gates: its 4:1 multiplexers two LUT4s and a MUXF5 each, the wider mapping kept at High (faster, as large), equal to the RTL; at Normal too', { timeout: 300000 }, async () => {
  const rot = elaborate(compile([{ path: 'rotg.v', lang: 'verilog', text: ROT_GATES }]), 'rotg');
  const r = await synthesizeOpen(rot, { family: 'spartan3e', run: yosysNode });
  // (two levels of 32 4:1 multiplexers: 128 LUTs and 64 MUXF5, 64 slices; before LUT6_MAP the wider mapping was 256 LUTs)
  assert.deepEqual([r.util.luts, r.util.muxes, r.cells.MUXF6 || 0, r.depth.wide.kept, r.depth.wide.slices], [128, 64, 0, true, 64], JSON.stringify(r.depth));
  assert.deepEqual(r.warnings, []);
  const c = compareNetlist(rot, r, { name: 'lut6-rotg', seed: 'rotg', sim: { cycles: 400 } });
  assert.equal(c.status, 'pass', c.report || JSON.stringify(c));
  // Normal (#54): the wider mapping tried too, kept, High's netlist; 30 % faster than the LUT4s alone by the estimate
  // (3.66 ns against 5.32)
  const n = await synthesizeOpen(rot, { family: 'spartan3e', run: yosysNode, effort: 'normal' });
  assert.deepEqual([n.util.luts, n.util.muxes, n.depth.wide.kept, n.depth.tried], [128, 64, true, false], JSON.stringify(n.depth));
  assert.deepEqual(n.warnings, []);
  const top = 'rotg';
  assert.equal(n.files[`${top}.json`], r.files[`${top}.json`]);
  const lut4 = await synthesizeOpen(rot, { family: 'spartan3e', run: yosysNode, effort: 'normal', wide: false });
  assert.deepEqual([lut4.util.luts, lut4.util.muxes, lut4.depth.wide], [128, 0, undefined]);
  assert.ok(criticalDelay(n.files[`${top}.json`], top) < 0.75 * criticalDelay(lut4.files[`${top}.json`], top));
});

// #370: a round-robin arbiter written as gates, as the EPFL arbiter (its grant i: request i and, from the position holding
// the priority round the ring, no request before it): each grant a ring-shaped priority chain, the chains of the
// outputs sharing nothing as written. Balanced (if -g) their trees overlap; mapped onto LUT4s alone (DEPTH_ABC2 on
// LUT4_ONLY) they take fewer LUTs and slices than with the wider functions (161 LUTs, 81 slices, 7.6 ns estimated,
// against the second balancing's 159, 99, 8.7)
const arbiter = n => {
  const grant = i => Array.from({ length: n }, (_, k) => {
    const j = (i - k + n) % n;
    return `(p[${j}]${Array.from({ length: k }, (_, m) => ` & ~r[${(j + m) % n}]`).join('')})`;
  }).join(' | ');
  return `module arb(input clk, input [${n - 1}:0] req, input [${n - 1}:0] pri, output reg [${n - 1}:0] g);
  reg [${n - 1}:0] r, p; wire [${n - 1}:0] gw;
  always @(posedge clk) begin r <= req; p <= pri; g <= gw; end
${Array.from({ length: n }, (_, i) => `  assign gw[${i}] = r[${i}] & (${grant(i)});`).join('\n')}
endmodule
`;
};
test('#370 a round-robin arbiter written as gates: balanced once more onto LUT4s alone, a fourth candidate, kept (fewer slices, faster), equal to the RTL', { timeout: 300000 }, async () => {
  const d = elaborate(compile([{ path: 'arb.v', lang: 'verilog', text: arbiter(24) }]), 'arb');
  const r = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode });
  assert.deepEqual([r.depth.kept, r.depth.lut4.kept, r.depth.second.kept, r.depth.delays.kept, r.depth.third.kept], [true, true, false, false, false], JSON.stringify(r.depth));
  assert.deepEqual([r.util.luts, sliceCount(r.files['arb.json'], 'arb')], [r.depth.lut4.luts, r.depth.lut4.slices]);
  // fewer slices than each of the other three, and faster than the second balancing, which was kept before
  for (const k of ['second', 'delays', 'third']) assert.ok(r.depth.lut4.slices < r.depth[k].slices, `${k}: ${JSON.stringify(r.depth)}`);
  assert.ok(r.depth.lut4.ns < r.depth.second.ns, JSON.stringify(r.depth));
  assert.equal(r.util.muxes, 0);
  assert.deepEqual(r.warnings, []);
  const c = compareNetlist(d, r, { name: 'lut4-arbiter', seed: 'arb', sim: { cycles: 400 } });
  assert.equal(c.status, 'pass', c.report || JSON.stringify(c));
});

// #54: a register file of 8 x 8 bits written at one address and read at three (as the T80's), its first read
// address decoded from an instruction register; the word read incremented or decremented and written back
const REGFILE_V = `module rf(input clk, input [7:0] din, input load, output reg [7:0] q);
  reg [7:0] ir, acc;
  reg [2:0] rb, rc;
  reg [1:0] t;
  reg [7:0] r [0:7];
  wire [2:0] ra = (t == 2 && ir[7:6] == 2'b01) ? {ir[0], ir[2:1] ^ ir[5:4]} : (ir[3] & acc[0]) ? {1'b1, ir[5:4]} : (t == 3 ? ir[6:4] : rb);
  wire [7:0] a = r[ra], b = r[rb], c = r[rc];
  wire [7:0] id = ir[7] ? a - 8'd1 : a + 8'd1;
  always @(posedge clk) begin
    t <= t + 2'd1;
    if (load) ir <= din; else ir <= {ir[6:0], ir[7] ^ acc[3]};
    rb <= ir[2:0] ^ acc[2:0];
    rc <= {acc[7], ir[1:0]};
    if (t != 0 || load) r[ra] <= load ? din : id;
    acc <= (b & c) ^ id;
    q <= acc ^ c;
  end
endmodule
`;
const REGFILE_VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity rf is port (clk, load : in std_logic; din : in std_logic_vector(7 downto 0); q : out std_logic_vector(7 downto 0)); end rf;
architecture rtl of rf is
  type regs_t is array (0 to 7) of std_logic_vector(7 downto 0);
  signal r : regs_t;
  signal ir, acc, a, b, c, id : std_logic_vector(7 downto 0);
  signal rb, rc, ra : std_logic_vector(2 downto 0);
  signal t : unsigned(1 downto 0);
begin
  ra <= ir(0) & (ir(2 downto 1) xor ir(5 downto 4)) when t = 2 and ir(7 downto 6) = "01" else
        '1' & ir(5 downto 4) when (ir(3) and acc(0)) = '1' else
        ir(6 downto 4) when t = 3 else rb;
  a <= r(to_integer(unsigned(ra))); b <= r(to_integer(unsigned(rb))); c <= r(to_integer(unsigned(rc)));
  id <= std_logic_vector(unsigned(a) - 1) when ir(7) = '1' else std_logic_vector(unsigned(a) + 1);
  process (clk) begin
    if rising_edge(clk) then
      t <= t + 1;
      if load = '1' then ir <= din; else ir <= ir(6 downto 0) & (ir(7) xor acc(3)); end if;
      rb <= ir(2 downto 0) xor acc(2 downto 0);
      rc <= acc(7) & ir(1 downto 0);
      if t /= 0 or load = '1' then
        if load = '1' then r(to_integer(unsigned(ra))) <= din; else r(to_integer(unsigned(ra))) <= id; end if;
      end if;
      acc <= (b and c) xor id;
      q <= acc xor c;
    end if;
  end process;
end rtl;
`;
// the same register file with a second write port: distributed RAM has one, the memory stays in logic
const REGFILE2_V = REGFILE_V.replace('if (t != 0 || load) r[ra] <= load ? din : id;', 'if (t != 0 || load) r[ra] <= load ? din : id;\n    if (t == 0) r[rc] <= acc;');

test('#54 the memories as distributed RAM: the scripts (the memories left to logic counted by the usual run; the memory step at LUTRAM_COST), the count read', () => {
  const S = 'synth_xilinx -family xc3se -ise -flatten -top top';
  assert.equal(memorySteps(S), `${S} -run :fine`);
  assert.equal(memorySteps(S, { count: true }), `${S} -run :map_ffram; tee -q -o silinx_memories.txt select -count t:$mem_v2 r:WR_PORTS>0 %i; ${S} -run map_ffram:fine`);
  assert.equal(memorySteps(S, { lutram: true }), `${S} -run :map_memory; memory_libmap -lib +/xilinx/lutrams_xcv.txt -lib +/xilinx/brams_xc2v.txt -logic-cost-ram 2; `
    + `techmap -map +/xilinx/lutrams_xcv_map.v; techmap -map +/xilinx/brams_xc2v_map.v; tee -q -o silinx_memories.txt select -count t:$mem_v2 r:WR_PORTS>0 %i; ${S} -run map_ffram:fine`);
  assert.equal(LUTRAM_COST, 2);
  assert.equal(MEMORIES_FILE, 'silinx_memories.txt');
  // the usual run (premap) counts them; lutram, the memory step priced; neither, as before
  assert.ok(synthCommands('top', 'spartan3e', { premap: PREMAP_FILE }).startsWith(`${memorySteps(S, { count: true })}; memory_map;`));
  assert.ok(synthCommands('top', 'spartan3e', { lutram: true }).startsWith(`${memorySteps(S, { lutram: true })}; memory_map;`));
  assert.ok(synthCommands('top', 'spartan3e').startsWith(`${S} -run :fine; memory_map;`));
  assert.ok(synthCommands('top', 'spartan3', { premap: PREMAP_FILE }).includes('-run :map_ffram; tee -q -o silinx_memories.txt'));
  // Virtex-4: its memory step reads other libraries (brams_xc4v), neither counted nor priced
  for (const o of [{ premap: PREMAP_FILE }, { lutram: true }]) assert.ok(synthCommands('top', 'virtex4', o).startsWith('synth_xilinx -family xc4v -ise -flatten -top top -run :fine; memory_map;'));
  assert.equal(logicMemories({ [MEMORIES_FILE]: '2 objects.\n' }), 2);
  assert.equal(logicMemories({ [MEMORIES_FILE]: new TextEncoder().encode('0 objects.\n') }), 0);
  assert.equal(logicMemories({}), null);
});

// a ROM (a case of constants: Yosys's proc_rom), no write port: not counted (its price is another, -logic-cost-rom)
const ROM_V = `module rf(input clk, input [3:0] a, output reg [7:0] q);
  always @(posedge clk) case (a)
    0: q <= 8'h3c; 1: q <= 8'ha5; 2: q <= 8'h0f; 3: q <= 8'h96; 4: q <= 8'h5a; 5: q <= 8'hc3; 6: q <= 8'h18; 7: q <= 8'h7e;
    8: q <= 8'he1; 9: q <= 8'h24; 10: q <= 8'hdb; 11: q <= 8'h42; 12: q <= 8'hbd; 13: q <= 8'h81; 14: q <= 8'h66; default: q <= 8'h99;
  endcase
endmodule
`;

test('#54 the memories left to logic: counted by the usual run, its netlist unchanged; at LUTRAM_COST a register file of three read ports is RAM16X1D, one of two write ports stays in logic', { timeout: 300000 }, async () => {
  const S = 'synth_xilinx -family xc3se -ise -flatten -top rf';
  const TWO_READS = 'module rf(input clk, we, input [2:0] a, b, input [7:0] d, output [7:0] qa, qb); reg [7:0] r [0:7]; always @(posedge clk) if (we) r[a] <= d; assign qa = r[a]; assign qb = r[b]; endmodule';
  const rams = o => cellCounts(o['rf.json'], 'rf').RAM16X1D || 0;
  for (const [name, text, logic, lutram] of [['three reads', REGFILE_V, 1, 16], ['two reads', TWO_READS, 0, 8], ['two writes', REGFILE2_V, 1, 0], ['none', 'module rf(input clk, input [7:0] d, output reg [7:0] q); always @(posedge clk) q <= q + d; endmodule', 0, 0], ['a ROM', ROM_V, 0, 0]]) {
    const { text: v, top } = toVerilog(elaborate(compile([{ path: 'rf.v', lang: 'verilog', text }]), 'rf'));
    assert.equal(top, 'rf');
    const counted = yosysScript('rf', 'spartan3e', { premap: PREMAP_FILE });
    const [a, b, c] = await Promise.all([counted, counted.replace(memorySteps(S, { count: true }), `${S} -run :fine`), yosysScript('rf', 'spartan3e', { lutram: true })]
      .map(sc => yosysNode(['-q', '-p', sc], yosysFiles('rf', v))));
    assert.equal(logicMemories(a), logic, name);
    // (the count changes nothing: the same netlist, byte for byte, and the same netlist before the LUT mapping)
    assert.ok(a['rf.json'] === b['rf.json'] && asText(a[PREMAP_FILE]) === asText(b[PREMAP_FILE]), name);
    assert.equal(logicMemories(b), null, name);
    // at LUTRAM_COST: the register file of three reads as two copies of 8 RAM16X1D (none left in logic); of two reads,
    // RAM16X1D at both prices; of two writes, in logic at both
    assert.deepEqual([rams(a), rams(c), logicMemories(c)], [lutram === 16 ? 0 : lutram, lutram, logic && !lutram ? 1 : 0], name);
  }
});

test('#54 a register file read at three addresses: its memory as distributed RAM at both efforts (half the slices, as fast within the rule\'s slack; lutram: false, flip-flops), equal to the RTL, in Verilog and VHDL; with two write ports, not taken', { timeout: 600000 }, async () => {
  for (const [lang, text] of [['verilog', REGFILE_V], ['vhdl', REGFILE_VHD]]) {
    const d = elaborate(compile([{ path: lang === 'vhdl' ? 'rf.vhd' : 'rf.v', lang, text }]), 'rf');
    for (const effort of ['high', 'normal']) {
      const r = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode, effort });
      const ff = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode, effort, lutram: false });
      const l = r.depth.lutram, what = `${lang} ${effort}: ${JSON.stringify(r.depth)}`;
      assert.deepEqual([l.memories, l.left, l.kept], [1, 0, true], what);
      // (at Normal, a design that gets none of High's mappings: the RAM's usual mapping, or the one balanced onto LUT4s alone)
      if (effort === 'normal') assert.ok(['usual', 'lut4'].includes(l.netlist), what);
      assert.deepEqual([r.util.distributedRam, r.util.flipFlops, r.util.luts, sliceCount(r.files['rf.json'], 'rf')], [16, 32, l.luts, l.slices], what);
      // lutram: false: the 64 bits in flip-flops, as before #54
      assert.equal(ff.depth.lutram, undefined, what);
      assert.deepEqual([ff.util.distributedRam, ff.util.flipFlops], [0, 96], what);
      const slicesFF = sliceCount(ff.files['rf.json'], 'rf');
      assert.ok(l.slices <= slicesFF * 0.6, `${what}: ${l.slices} slices against ${slicesFF}`);
      assert.ok(l.ns <= criticalDelay(ff.files['rf.json'], 'rf') * 1.01, what);
      assert.deepEqual([r.warnings, ff.warnings], [[], []], what);
      const c = compareNetlist(d, r, { name: `regfile-${lang}-${effort}`, seed: 'rf', sim: { cycles: 600 } });
      assert.equal(c.status, 'pass', c.report || JSON.stringify(c));
    }
  }
  // two write ports: counted, not taken by distributed RAM, no more mapping made, at both efforts
  const d2 = elaborate(compile([{ path: 'rf.v', lang: 'verilog', text: REGFILE2_V }]), 'rf');
  for (const effort of ['high', 'normal']) {
    const r2 = await synthesizeOpen(d2, { family: 'spartan3e', run: yosysNode, effort });
    assert.deepEqual(r2.depth.lutram, { memories: 1, left: 1, netlist: null, ns: null, luts: null, slices: null, kept: false }, effort);
    assert.deepEqual([r2.util.distributedRam, r2.warnings], [0, []], effort);
  }
});

// #370: the arbiter's chains share their range terms once balanced, but mfs2's windows (ABC's don't-cares) are of
// 300 nodes at most: the requests' and the priorities' terms reach more. The fourth candidate (onto LUT4s alone)
// takes windows of MFS's 5000 nodes (the EPFL arbiter in the corpus's I/O wrapper 2019 -> 1537 LUTs, 1010 -> 769
// slices, as deep); the other candidates and the GIA's SOP balancing keep mfs2's own windows
test('#370 the fourth candidate with mfs2\'s windows of 5000 nodes: a 32-request arbiter in 320 LUTs instead of 354, as deep and as fast by the estimate, equal to the RTL', { timeout: 300000 }, async () => {
  assert.equal(MFS, 'mfs2 -M 5000');
  assert.ok(DEPTH_ABC2_LUT4.startsWith(DEPTH_ABC2.replaceAll('mfs2', 'mfs2 -M 5000')));
  for (const s of [DEPTH_ABC, DEPTH_ABC2, DEPTH_ABC3, DEPTH_SOPB]) assert.ok(!s.includes(' -M '), s);
  const d = elaborate(compile([{ path: 'arb.v', lang: 'verilog', text: arbiter(32) }]), 'arb');
  const { text, top } = toVerilog(d);
  const out = await yosysNode(['-q', '-p', yosysScript(top, 'spartan3e', { premap: PREMAP_FILE })], yosysFiles(top, text));
  const map = async script => {
    const o = await yosysNode(['-q', '-p', `${remapCommands(top, 'spartan3e', { luts: '1,1,1,1' })}; delete t:$scopeinfo; ${TOP_ONLY}; write_json -selected ${top}.json`],
      { [PREMAP_FILE]: String(out[PREMAP_FILE]), [DEPTH_ABC_FILE]: script });
    const j = o[`${top}.json`];
    return { top, files: { [`${top}.json`]: j }, luts: utilization(cellCounts(j, top)).luts, slices: sliceCount(j, top), ns: +criticalDelay(j, top).toFixed(2), levels: logicLevels(j, top) };
  };
  const a = await map(DEPTH_ABC2), b = await map(DEPTH_ABC2.replaceAll('mfs2', MFS));
  assert.deepEqual([a.luts, a.slices, a.ns, a.levels], [354, 177, 8.77, 7]);
  assert.deepEqual([b.luts, b.slices, b.ns, b.levels], [320, 160, 8.77, 7]);
  const c = compareNetlist(d, b, { name: 'mfs-arbiter', seed: 'arb32', sim: { cycles: 400 } });
  assert.equal(c.status, 'pass', c.report || JSON.stringify(c));
});

// #370: each more round of the fourth candidate's area mapping (choices, mapping, mfs2 on wide windows) shares more of
// the arbiter's terms, as deep: four more rounds (the EPFL arbiter in the corpus's I/O wrapper 1537 -> 1410 LUTs at High)
test('#370 the fourth candidate\'s area mapping made four more times: a 32-request arbiter in 248 LUTs instead of 320, as deep and as fast by the estimate, equal to the RTL', { timeout: 300000 }, async () => {
  assert.equal(DEPTH_ABC2_LUT4, `${DEPTH_ABC2.replaceAll('mfs2', 'mfs2 -M 5000')}${'; strash; dch -f; if; mfs2 -M 5000'.repeat(4)}`);
  const d = elaborate(compile([{ path: 'arb.v', lang: 'verilog', text: arbiter(32) }]), 'arb');
  const { text, top } = toVerilog(d);
  const out = await yosysNode(['-q', '-p', yosysScript(top, 'spartan3e', { premap: PREMAP_FILE })], yosysFiles(top, text));
  const map = async script => {
    const o = await yosysNode(['-q', '-p', `${remapCommands(top, 'spartan3e', { luts: '1,1,1,1' })}; delete t:$scopeinfo; ${TOP_ONLY}; write_json -selected ${top}.json`],
      { [PREMAP_FILE]: String(out[PREMAP_FILE]), [DEPTH_ABC_FILE]: script });
    const j = o[`${top}.json`];
    return { top, files: { [`${top}.json`]: j }, luts: utilization(cellCounts(j, top)).luts, slices: sliceCount(j, top), ns: +criticalDelay(j, top).toFixed(2), levels: logicLevels(j, top) };
  };
  const a = await map(DEPTH_ABC2.replaceAll('mfs2', MFS)), b = await map(DEPTH_ABC2_LUT4);
  assert.deepEqual([a.luts, a.slices, a.ns, a.levels], [320, 160, 8.77, 7]);
  assert.deepEqual([b.luts, b.slices, b.ns, b.levels], [248, 124, 8.77, 7]);
  const c = compareNetlist(d, b, { name: 'rounds-arbiter', seed: 'arb32r', sim: { cycles: 400 } });
  assert.equal(c.status, 'pass', c.report || JSON.stringify(c));
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
  // (or, better still, the speedup's mapping or the enables folded, #652, #653)
  const kept = [r.depth.fold, r.depth.speed].find(x => x?.kept) || r.depth.second;
  assert.ok(kept.ns <= r.depth.second.ns, JSON.stringify(r.depth));
  assert.equal(r.util.luts, kept.luts);
  assert.equal(criticalDelay(r.files['max4.json'], 'max4'), kept.ns);
  assert.deepEqual(r.warnings, []);
  const d = compareNetlist(max4, r, { name: 'depth-max4', sim: { cycles: 300 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
});

// a priority encoder of 128 bits (EPFL priority's design): the index of the first bit set, a chain of 128 choices
const PRIO = `module prio(input clk, input [127:0] x, output reg [6:0] q);
  reg [127:0] r;
  integer i;
  reg [6:0] idx; reg found;
  always @* begin
    idx = 7'd0; found = 1'b0;
    for (i = 0; i < 128; i = i + 1) begin
      idx = (~found & r[i]) ? i : idx;
      found = found | r[i];
    end
  end
  always @(posedge clk) begin r <= x; q <= idx; end
endmodule
`;
test('#52 logic depth: balanced twice more (DEPTH_ABC3, with the LUT delays), a third candidate; a priority encoder keeps it at both efforts (17 % faster than the mapping balanced once more, as large), equal to the RTL', { timeout: 300000 }, async () => {
  assert.equal(DEPTH_ABC3, 'strash; dc2; balance; dch -f; if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if; mfs2; strash; dch -f; if; mfs2');
  const prio = elaborate(compile([{ path: 'prio.v', lang: 'verilog', text: PRIO }]), 'prio');
  for (const effort of ['high', 'normal']) {
    const r = await synthesizeOpen(prio, { family: 'spartan3e', run: yosysNode, effort });
    const dp = JSON.stringify(r.depth);
    if (effort === 'normal') assert.equal(r.depth.auto, true, dp);
    assert.equal(r.depth.kept, true, dp);
    // (before #52's third candidate: the one balanced once more with the delays, 11.1 ns estimated)
    assert.deepEqual([r.depth.second.kept, r.depth.delays.kept, r.depth.third.kept], [false, false, true], dp);
    const before = Math.min(r.depth.second.ns, r.depth.delays.ns);
    assert.ok(r.depth.third.ns <= before * 0.9, dp);
    assert.ok(r.depth.third.luts <= Math.min(r.depth.second.luts, r.depth.delays.luts) && r.depth.third.slices <= Math.min(r.depth.second.slices, r.depth.delays.slices), dp);
    assert.equal(r.util.luts, r.depth.third.luts);
    assert.equal(criticalDelay(r.files['prio.json'], 'prio'), r.depth.third.ns);
    assert.deepEqual(r.warnings, []);
    const d = compareNetlist(prio, r, { name: `depth-prio-${effort}`, sim: { cycles: 400 } });
    assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
  }
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
test('a depth-oriented mapping that fails (Yosys crashed): the usual mapping\'s netlist kept, with a warning, not a failed synthesis (#401)', { timeout: 180000 }, async () => {
  const chain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text: CHAIN }]), 'chain');
  // the remaps (from the netlist before the LUT mapping) crash, as a second out-of-memory in the browser
  const crashed = Object.assign(new Error('Yosys failed: RangeError: out of memory'), { crash: true });
  const run = async (args, files, onLine) => { if (args.join(' ').includes('read_rtlil silinx_premap.il')) throw crashed; return yosysNode(args, files, onLine); };
  const r = await synthesizeOpen(chain, { family: 'spartan3e', run });
  assert.deepEqual(r.warnings, ['Warning: the depth-oriented mapping failed (Yosys failed: RangeError: out of memory): the usual mapping is kept']);
  assert.deepEqual([r.depth.tried, r.depth.kept, r.depth.failed], [false, false, 'Yosys failed: RangeError: out of memory']);
  // the usual mapping, as without the depth-oriented one
  const plain = await synthesizeOpen(chain, { family: 'spartan3e', run: yosysNode, depth: false });
  assert.equal(r.util.luts, plain.util.luts);
  assert.equal(criticalDelay(r.files['chain.json'], 'chain'), criticalDelay(plain.files['chain.json'], 'chain'));
  // at Normal, the critical path's remapping and the wider mapping (#54) crashing (#652): the usual netlist kept, said (a remap
  // that fails after the depth-oriented ones fail is not tried: no second warning above)
  const n = await synthesizeOpen(chain, { family: 'spartan3e', run, effort: 'normal' });
  assert.deepEqual(n.warnings, ['Warning: the critical path\'s remapping failed (Yosys failed: RangeError: out of memory): the netlist chosen before it is kept',
    'Warning: the mapping with the wider functions failed (Yosys failed: RangeError: out of memory): the netlist chosen before is kept']);
  assert.deepEqual([n.depth.speed, n.depth.fold, n.depth.speedFailed, n.depth.wide], [undefined, undefined, 'Yosys failed: RangeError: out of memory', { kept: false, failed: 'Yosys failed: RangeError: out of memory' }]);
  const plainN = await synthesizeOpen(chain, { family: 'spartan3e', run: yosysNode, effort: 'normal', speed: false });
  assert.equal(n.files['chain.json'], plainN.files['chain.json']);
  // the first mapping failing is still the synthesis failing
  const all = async () => { throw crashed; };
  await assert.rejects(synthesizeOpen(chain, { family: 'spartan3e', run: all }), /out of memory/);
});

test('logic depth: a comparator written as a chain of gates is mapped again for depth, that netlist kept and equal to the RTL; a counter keeps its usual mapping', { timeout: 180000 }, async () => {
  const chain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text: CHAIN }]), 'chain');
  const r = await synthesizeOpen(chain, { family: 'spartan3e', run: yosysNode });
  assert.equal(r.depth.tried, true);
  assert.equal(r.depth.kept, true, JSON.stringify(r.depth));
  assert.ok(r.depth.ns[1] < r.depth.ns[0] * 0.9, JSON.stringify(r.depth));
  // the netlist kept: the depth-oriented one, or one balanced once more (with or without the LUT delays)
  // (or, better still, the speedup's mapping or the enables folded, #652, #653)
  const kept = [r.depth.fold, r.depth.speed, r.depth.delays, r.depth.second].find(x => x?.kept) || { ns: r.depth.ns[1], luts: r.depth.luts[1] };
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

// Regression (#631): each run's JSON has the top module alone (#86), selected by its attribute: a top left with
// nothing in it (read_verilog makes it a black box, which write_json -selected leaves out) and an escaped
// identifier (select -module does not take \\1dff) are written too, at both efforts
test('#631 the netlist has its top: an empty one, and an escaped name, at Normal and High', { timeout: 300000 }, async () => {
  for (const effort of ['normal', 'high']) {
    const empty = elaborate(compile([{ path: 'e.v', lang: 'verilog', text: 'module empty_top(output o1, output o2);\nendmodule' }]), 'empty_top');
    const r = await synthesizeOpen(empty, { family: 'spartan3e', run: yosysNode, effort });
    assert.deepEqual(Object.keys(JSON.parse(r.files['empty_top.json']).modules), ['empty_top'], effort);
    assert.equal(r.util.cells, 0);
    const esc = elaborate(compile([{ path: 'x.v', lang: 'verilog', text: 'module \\1dff (input clk, input d, output reg q);\n  always @(posedge clk) q <= d;\nendmodule' }]), '1dff');
    const s = await synthesizeOpen(esc, { family: 'spartan3e', run: yosysNode, effort });
    assert.deepEqual(Object.keys(JSON.parse(s.files[`${s.top}.json`]).modules), [s.top], effort);
    assert.equal(s.cells.FDRE ?? s.cells.FD ?? s.cells.FDE, 1, JSON.stringify(s.cells));
    assert.deepEqual(s.warnings, [], effort);
  }
});

test('a shift register on the falling edge alone (SRL16E_1) gets its clock through a BUFG (#219)', { timeout: 120000 }, async () => {
  const design = elaborate(compile([{ path: 't.v', lang: 'verilog', text: 'module t(input clk, input d, output q); reg [7:0] r = 0; always @(negedge clk) r <= {r[6:0], d}; assign q = r[7]; endmodule' }]), 't');
  const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
  // (its last stage a flip-flop on the falling edge, #502)
  assert.deepEqual(Object.fromEntries(Object.entries(r.cells).sort()), { BUFG: 1, FDRE_1: 1, IBUF: 2, OBUF: 1, SRL16E_1: 1 });
});

// #502: a fixed-length shift register's last stage is a flip-flop (an SRL16E's clock-to-out, Treg, is 3.76 ns
// on the -4, a flip-flop's 0.59), the stages before it SRL16Es, their initial values kept
test('#502 a fixed-length shift register: its last stage a flip-flop, the stages before it SRL16Es (3, 16, 17, 33 stages; initial values, enable, falling edge, two taps); the netlists simulate like the designs', { timeout: 300000 }, async () => {
  const v = (text) => elaborate(compile([{ path: 't.v', lang: 'verilog', text }]), 't');
  const cases = [
    ['three stages', "module t(input clk, input d, output q); reg [2:0] r = 3'b101; always @(posedge clk) r <= {r[1:0], d}; assign q = r[2]; endmodule",
      { BUFG: 1, FDRE: 1, IBUF: 2, OBUF: 1, SRL16E: 1 }],
    ['16 stages, enable', "module t(input clk, input ce, input d, output q); reg [15:0] r = 16'hA5C3; always @(posedge clk) if (ce) r <= {r[14:0], d}; assign q = r[15]; endmodule",
      { BUFG: 1, FDRE: 1, IBUF: 3, OBUF: 1, SRL16E: 1 }],
    ['17 stages, falling edge', "module t(input clk, input d, output q); reg [16:0] r = 17'h1F0F1; always @(negedge clk) r <= {r[15:0], d}; assign q = r[16]; endmodule",
      { BUFG: 1, FDRE_1: 1, IBUF: 2, OBUF: 1, SRL16E_1: 1 }],
    ['33 stages, enable', "module t(input clk, input ce, input d, output q); reg [32:0] r = 33'h1_2345_6789; always @(posedge clk) if (ce) r <= {r[31:0], d}; assign q = r[32]; endmodule",
      { BUFG: 1, FDRE: 1, IBUF: 3, OBUF: 1, SRL16E: 2 }],
    ['two taps', 'module t(input clk, input d, output q, p); reg [9:0] r = 0; always @(posedge clk) r <= {r[8:0], d}; assign q = r[9]; assign p = r[4]; endmodule',
      { BUFG: 1, FDRE: 2, IBUF: 2, OBUF: 2, SRL16E: 2 }],
  ];
  for (const [what, text, cells] of cases) {
    const design = v(text);
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual(Object.fromEntries(Object.entries(r.cells).sort()), cells, what);
    assert.deepEqual(r.warnings, [], what);
    const d = compareNetlist(design, r, { name: what, sim: { cycles: 400 } });
    assert.equal(d.status, 'pass', `${what}: ${d.report || d.reason}`);
  }
});

// #511: the wide multiplexers onto MUXF5 / MUXF6 / MUXF7, from the netlist before the LUT mapping, when the usual run
// counted some trees of 8 or 16 inputs; kept by DEPTH_RULE
test('#511 wide multiplexers: the script (muxcover, Silinx\'s map, ABC onto LUT4s alone for the rest), the count of the trees', () => {
  assert.equal(muxfRemapCommands('top', 'spartan3e'), `read_rtlil ${PREMAP_FILE}; muxcover -mux8 -mux16 -nodecode -nopartial; techmap -map ${MUXF_MAP_FILE}; abc -luts 1,1,1,1; clean; `
    + 'techmap -map +/xilinx/ff_map.v; techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; '
    + 'synth_xilinx -family xc3se -ise -flatten -top top -run finalize:');
  assert.equal(muxfRemapCommands('m', 'spartan3'), muxfRemapCommands('m', 'spartan3e').replace('xc3se', 'xc3s'));
  // (the first select into 2:1 multiplexers, ABC's; the others the F-multiplexers)
  assert.match(MUXF_MAP, /module \\\$_MUX16_ [^]*MUXF7 f7 \(\.I0\(a\), \.I1\(b\), \.S\(V\)/);
  assert.match(MUXF_MAP, /module \\\$_MUX4_ [^]*\\\$_MUX_ l0 \(\.A\(A\), \.B\(B\), \.S\(S\)[^]*MUXF5 f5 \(\.I0\(a\), \.I1\(b\), \.S\(T\)/);
  assert.equal(muxTrees({ [MUX_COUNT_FILE]: '18 objects.\n' }), 18);
  assert.equal(muxTrees({ [MUX_COUNT_FILE]: new TextEncoder().encode('0 objects.\n') }), 0);
  assert.equal(muxTrees({}), 0);
  assert.equal(muxTrees(undefined), 0);
});

// a register file of 1-bit registers, written at one address and read at another (iwls05-spi's data[bit_pos])
const regFile = (n, top = `rf${n}`) => { const a = Math.log2(n); return `module ${top}(input clk, input we, input din, input [${a - 1}:0] ws, rs, output reg y);
  reg [${n - 1}:0] r; reg [${a - 1}:0] a;
  always @(posedge clk) begin a <= rs; if (we) r[ws] <= din; y <= r[a]; end
endmodule
`; };
const RF_VHDL = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity rfv is port (clk, we, din : in std_logic; ws, rs : in unsigned(4 downto 0); y : out std_logic); end rfv;
architecture rtl of rfv is
  signal r : std_logic_vector(31 downto 0);
  signal a : unsigned(4 downto 0);
begin
  process (clk) begin
    if rising_edge(clk) then
      a <= rs;
      if we = '1' then r(to_integer(ws)) <= din; end if;
      y <= r(to_integer(a));
    end if;
  end process;
end rtl;
`;
test('#511 wide multiplexers onto MUXF5 / MUXF6 / MUXF7, at Normal and High: faster and smaller, kept; the same function (Verilog and VHDL)', { timeout: 600000 }, async () => {
  const cases = [
    ['32:1, Verilog', elaborate(compile([{ path: 'rf32.v', lang: 'verilog', text: regFile(32) }]), 'rf32'), 2, { MUXF5: 8, MUXF6: 4, MUXF7: 2 }],
    ['128:1, Verilog', elaborate(compile([{ path: 'rf128.v', lang: 'verilog', text: regFile(128) }]), 'rf128'), 9, { MUXF5: 34, MUXF6: 17, MUXF7: 8 }],
    ['32:1, VHDL', design(RF_VHDL, 'rfv'), 2, { MUXF5: 8, MUXF6: 4, MUXF7: 2 }],
  ];
  for (const [what, d, trees, muxes] of cases) {
    const top = d.top.name;
    const count = () => { const f = (...a) => { if (!FSM_PROBE.test(a[0].join(' '))) f.n++; return yosysNode(...a); }; f.n = 0; return f; };
    const normal = count();
    const r = await synthesizeOpen(d, { family: 'spartan3e', run: normal, effort: 'normal' });
    // (the usual run and the one with the trees)
    assert.equal(normal.n, 2, what);
    const usual = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode, effort: 'normal', depth: false });
    assert.deepEqual([r.depth.muxf.trees, r.depth.muxf.kept, r.depth.tried], [trees, true, false], `${what}: ${JSON.stringify(r.depth)}`);
    assert.deepEqual(Object.fromEntries(Object.entries(r.cells).filter(([k]) => /^MUXF/.test(k)).sort()), muxes, what);
    assert.equal(usual.util.muxes, 0, what);
    const ns = [criticalDelay(usual.files[`${top}.json`], top), criticalDelay(r.files[`${top}.json`], top)];
    assert.ok(ns[1] < ns[0] * 0.85, `${what}: ${ns[1]} ns against ${ns[0]}`);
    assert.ok(r.util.luts < usual.util.luts, `${what}: ${r.util.luts} LUTs against ${usual.util.luts}`);
    assert.deepEqual(r.warnings, [], what);
    assert.deepEqual(usual.warnings, [], what);
    const c = compareNetlist(d, r, { name: `muxf-${top}`, seed: top, sim: { cycles: 600 } });
    assert.equal(c.status, 'pass', `${what}: ${c.report || c.reason}`);
    // High: the same netlist kept before its other mappings
    const hi = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual([hi.depth.muxf.kept, hi.util.luts, hi.util.muxes], [true, r.util.luts, r.util.muxes], what);
    assert.deepEqual(hi.warnings, [], what);
  }
});
test('#511 wide multiplexers: not kept when they take more slices than the rule allows (registers straight from the inputs: the F-multiplexers\' slices have no room for them); a design without them is one run at Normal', { timeout: 300000 }, async () => {
  const text = `module wide(input clk, input [127:0] d, input [6:0] s, output reg y);
  reg [127:0] rd; reg [6:0] rs;
  always @(posedge clk) begin rd <= d; rs <= s; y <= rd[rs]; end
endmodule
`;
  const d = elaborate(compile([{ path: 'wide.v', lang: 'verilog', text }]), 'wide');
  const r = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode, effort: 'normal' });
  const json = r.files['wide.json'];
  const sl = sliceCount(json, 'wide');
  assert.equal(r.depth.muxf.kept, false, JSON.stringify(r.depth));
  assert.equal(r.util.muxes, 0);
  // (faster and with fewer LUTs, but more slices than it gains in speed)
  assert.ok(r.depth.muxf.ns < criticalDelay(json, 'wide') && r.depth.muxf.luts < r.util.luts, JSON.stringify(r.depth));
  assert.ok(r.depth.muxf.slices > sl * (1 + Math.max(DEPTH_RULE.luts, 1 - r.depth.muxf.ns / criticalDelay(json, 'wide'))), `${r.depth.muxf.slices} slices against ${sl}`);
  assert.equal(keepDepth([criticalDelay(json, 'wide'), r.depth.muxf.ns], [r.util.luts, r.depth.muxf.luts], DEPTH_RULE, [sl, r.depth.muxf.slices]), false);
  assert.deepEqual(r.warnings, []);
  const c = compareNetlist(d, r, { name: 'muxf-wide', seed: 'wide', sim: { cycles: 300 } });
  assert.equal(c.status, 'pass', c.report || c.reason);
  // the counter: no tree, the usual run alone (and the mappings for speed from it, #652, #653, and the wider one, #54), no muxf in r.depth
  const count = () => { const f = (...a) => { if (!FSM_PROBE.test(a[0].join(' '))) f.n++; return yosysNode(...a); }; f.n = 0; return f; };
  const one = count();
  const n = await synthesizeOpen(design(COUNTER, 'counter'), { family: 'spartan3e', run: one, effort: 'normal' });
  assert.deepEqual([one.n - !!n.depth.speed - !!n.depth.fold - !!n.depth.wide, n.depth.muxf], [1, undefined]);
  assert.deepEqual(n.warnings, []);
});

// #377: ABC9 onto LUT4s alone, one more candidate of effort High (research/synth-quality/README.md, "ABC9")
test('ABC9 candidate (#377): its script, from the netlist before the LUT mapping, the cells\' models and Silinx\'s SRL16E_1 read first', () => {
  assert.equal(abc9RemapCommands('top', 'spartan3e'), 'read_verilog -lib -specify +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; '
    + `read_verilog -lib silinx_srl_cells.v; read_rtlil -nooverwrite ${PREMAP_FILE}; `
    // (the clock nets' names kept through ABC9, #496)
    + 'select -set silinx_clocks t:* %ci1:+[C]:+[CLK]:+[CLKA]:+[CLKB]:+[WCLK]:+[CLKIN] w:* %i; setattr -set keep 1 @silinx_clocks; '
    + 'synth_xilinx -family xc3se -ise -flatten -top top -abc9 -nowidelut -run map_luts:; setattr -unset keep @silinx_clocks');
});

test('ABC9 candidate (#377): kept when better (the gates example: 1 LUT instead of 2), equal to the RTL; abc9: false leaves it out; with 4 Yosys at once the same', { timeout: 300000 }, async () => {
  const fs = await import('node:fs');
  const text = fs.readFileSync(new URL('../examples/gates/src/gates.vhd', import.meta.url), 'utf8');
  const d = elaborate(compile([{ path: 'gates.vhd', lang: 'vhdl', text }]), 'gates');
  const r = await synthesizeOpen(d, { run: yosysNode });
  assert.deepEqual([r.depth.abc9.kept, r.depth.abc9.luts, r.util.luts], [true, 1, 1], JSON.stringify(r.depth));
  assert.deepEqual(r.warnings, []);
  const c = compareNetlist(d, r, { name: 'gates', seed: 'gates', sim: { cycles: 64 } });
  assert.equal(c.status, 'pass', c.report || c.reason);
  // without the candidate: the usual mapping's 2 LUTs, no abc9 in r.depth
  const off = await synthesizeOpen(d, { run: yosysNode, abc9: false });
  assert.deepEqual([off.depth.abc9, off.util.luts], [undefined, 2]);
  // started with the first mappings when run() has 4 Yosys at a time (#277): the same choice
  const run4 = Object.assign((...a) => yosysNode(...a), { parallel: 4 });
  const r4 = await synthesizeOpen(d, { run: run4 });
  assert.deepEqual([r4.depth.abc9.kept, r4.util.luts], [true, 1]);
});

test('ABC9 candidate (#377): a falling-edge shift register (SRL16E_1, a black box of Silinx\'s) maps, not a failed optional mapping', { timeout: 120000 }, async () => {
  const d = elaborate(compile([{ path: 't.v', lang: 'verilog', text: 'module t(input clk, input d, output q); reg [7:0] r = 0; always @(negedge clk) r <= {r[6:0], d}; assign q = r[7]; endmodule' }]), 't');
  const r = await synthesizeOpen(d, { run: yosysNode });
  assert.equal(r.depth.failed, undefined, r.depth.failed);
  assert.ok(r.depth.abc9, JSON.stringify(r.depth));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.cells.SRL16E_1, 1);
});

// #282: the synthesis's Optimization Effort: Normal (the projects' default) one Yosys run, the usual mapping
// (a design written as gates: its adders' chains too, #377, test/carry-chain.test.js), and since #652 / #653 the
// mappings for speed from its netlist before the LUT mapping (the speedup's, the enables folded: one or two
// remaps, 0.3 to 1 s more); High every mapping, the fastest kept (the default of synthesizeOpen, for the quality
// comparisons)
test('#282 Optimization Effort: Normal synthesizes once (no depth-oriented mapping, no carry chains; the mappings for speed and the wider one from that run, #652, #54), High as before; the project\'s property', { timeout: 180000 }, async () => {
  assert.equal(synthEffort(undefined), 'normal');
  assert.equal(synthEffort({ optLevel: 1 }), 'normal');
  assert.equal(synthEffort({ optLevel: 2 }), 'high');
  assert.equal(synthEffort({ optLevel: '2' }), 'high');
  const chain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text: CHAIN }]), 'chain');
  const count = () => { const f = (...a) => { if (!FSM_PROBE.test(a[0].join(' '))) f.n++; return yosysNode(...a); }; f.n = 0; return f; };
  const normal = count(), high = count();
  const n = await synthesizeOpen(chain, { family: 'spartan3e', run: normal, effort: 'normal' });
  const hi = await synthesizeOpen(chain, { family: 'spartan3e', run: high });
  // (the speedup's remap; the enables folded too when the critical path ends on a clock enable; the wider mapping, #54, not kept)
  assert.ok(n.depth.speed, JSON.stringify(n.depth));
  assert.equal(n.depth.wide.kept, false, JSON.stringify(n.depth));
  assert.equal(normal.n, 3 + !!n.depth.fold);
  assert.ok(high.n > 4, String(high.n));
  assert.deepEqual([n.depth.tried, n.chains.length], [false, 0]);
  // (its 9 levels of logic: not limited by its depth, #468)
  assert.deepEqual([n.depth.levels, n.depth.auto], [9, false]);
  assert.deepEqual(n.warnings, []);
  // the usual mapping: slower than High's on this comparator chain; the speedup's mapping kept, as fast as High's or
  // faster (#652); the same function
  const usualNs = (await synthesizeOpen(chain, { family: 'spartan3e', run: yosysNode, effort: 'normal', speed: false })).files['chain.json'];
  assert.ok(criticalDelay(usualNs, 'chain') > criticalDelay(hi.files['chain.json'], 'chain'));
  assert.equal(n.depth.speed.kept, true, JSON.stringify(n.depth));
  assert.ok(criticalDelay(n.files['chain.json'], 'chain') <= criticalDelay(hi.files['chain.json'], 'chain'), JSON.stringify([n.depth, hi.depth]));
  const d = compareNetlist(chain, n, { name: 'effort-normal-chain', sim: { cycles: 200 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
});

// #468: at Normal, a design limited by its logic depth (DEEP_RULE: more than 16 levels, 1500 LUTs at most since #611)
// gets High's mappings too, kept when a quarter faster than Normal's own netlist (#611); the others keep the one run
test('#611 Optimization Effort Normal: High\'s mappings not a given part faster than Normal\'s own netlist are dropped, that one kept', { timeout: 180000 }, async () => {
  const text = CHAIN.replace(/23/g, '47').replace('i < 24', 'i < 48');
  const deepChain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text }]), 'chain');
  // (a rule asking for 99 % less: refused; the netlist, its cells and warnings Normal's own, as with depth: false)
  const n = await synthesizeOpen(deepChain, { family: 'spartan3e', run: yosysNode, effort: 'normal', deepRule: { ...DEEP_RULE, gain: 0.99 } });
  const one = await synthesizeOpen(deepChain, { family: 'spartan3e', run: yosysNode, effort: 'normal', depth: false });
  assert.deepEqual([n.depth.levels, n.depth.auto, n.depth.normal.kept], [17, true, true]);
  assert.ok(n.depth.high.ns < n.depth.normal.ns * 0.6, JSON.stringify(n.depth));
  assert.equal(n.files['chain.json'], one.files['chain.json']);
  assert.deepEqual(n.cells, one.cells);
  assert.deepEqual(n.warnings, []);
  // a design of more LUTs than DEEP_RULE.maxLuts: High's mappings not tried (the SOP balancing alone, #654: refused here,
  // not 99 % faster; without the critical path's remaps, #652, Normal's own netlist)
  const big = await synthesizeOpen(deepChain, { family: 'spartan3e', run: yosysNode, effort: 'normal', deepRule: { ...DEEP_RULE, maxLuts: 10, gain: 0.99 }, speed: false });
  assert.deepEqual([big.depth.levels, big.depth.auto, big.depth.tried, big.depth.sopb.kept], [17, false, false, false]);
  assert.equal(big.files['chain.json'], one.files['chain.json']);
  assert.deepEqual(big.warnings, []);
});

// ------------------------------------------------------------------ the GIA's SOP balancing (#654)
test('#654 logic depth: the GIA\'s SOP balancing (DEPTH_SOPB), a deep design\'s candidate at both efforts; a comparator chain of 48 bits keeps it (6.5 ns estimated against DEPTH_ABC3\'s 8.3 and the usual 20.3), equal to the RTL; a shallow design does not make it', { timeout: 300000 }, async () => {
  assert.equal(DEPTH_SOPB, 'strash; &get -n; &sopb; &if -g -K 6; &synch2; &sopb; &if -g -K 6; &synch2; &if -K 4; &put; mfs2');
  assert.deepEqual(SOPB_RULE, { levels: 16, maxLuts: 20000 });
  const text = CHAIN.replace(/23/g, '47').replace('i < 24', 'i < 48');
  const deepChain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text }]), 'chain');
  for (const effort of ['high', 'normal']) {
    const r = await synthesizeOpen(deepChain, { family: 'spartan3e', run: yosysNode, effort });
    const dp = JSON.stringify(r.depth);
    assert.equal(r.depth.sopb.kept, true, dp);
    // (faster than every other candidate, the usual mapping's slices)
    assert.ok(r.depth.sopb.ns <= r.depth.third.ns * 0.85 && r.depth.sopb.ns <= r.depth.ns[0] * 0.4, dp);
    assert.ok(r.depth.sopb.slices <= r.depth.slices[0], dp);
    assert.deepEqual([r.util.luts, criticalDelay(r.files['chain.json'], 'chain'), logicLevels(r.files['chain.json'], 'chain') <= 6], [r.depth.sopb.luts, r.depth.sopb.ns, true]);
    assert.deepEqual(r.warnings, []);
    const d = compareNetlist(deepChain, r, { name: `sopb-chain-${effort}`, sim: { cycles: 300 } });
    assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
  }
  // at Normal, too large for High's mappings (DEEP_RULE.maxLuts): the SOP balancing alone, kept (69 % faster: more than
  // DEEP_RULE.gain), equal to the RTL
  const big = await synthesizeOpen(deepChain, { family: 'spartan3e', run: yosysNode, effort: 'normal', deepRule: { ...DEEP_RULE, maxLuts: 10 } });
  assert.deepEqual([big.depth.auto, big.depth.tried, big.depth.wide.kept, big.depth.sopb.kept], [false, false, false, true], JSON.stringify(big.depth));
  assert.equal(criticalDelay(big.files['chain.json'], 'chain'), big.depth.sopb.ns);
  assert.deepEqual(big.warnings, []);
  const d = compareNetlist(deepChain, big, { name: 'sopb-chain-big', sim: { cycles: 300 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
  // a design of 16 levels or fewer: not made (the counter; the 24-bit chain, 9 levels)
  for (const [name, dsg] of [['counter', design(COUNTER, 'counter')], ['chain', elaborate(compile([{ path: 'chain.v', lang: 'verilog', text: CHAIN }]), 'chain')]]) {
    const r = await synthesizeOpen(dsg, { family: 'spartan3e', run: yosysNode });
    assert.equal(r.depth.sopb, undefined, name);
  }
});

test('#654 the SOP balancing failing (Yosys crashed): the netlist chosen before kept, with a warning', { timeout: 300000 }, async () => {
  const text = CHAIN.replace(/23/g, '47').replace('i < 24', 'i < 48');
  const deepChain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text }]), 'chain');
  const crashed = Object.assign(new Error('Yosys failed: RangeError: out of memory'), { crash: true });
  const run = async (args, files, onLine) => { if (files['silinx_depth.abc'] === DEPTH_SOPB) throw crashed; return yosysNode(args, files, onLine); };
  const r = await synthesizeOpen(deepChain, { family: 'spartan3e', run, effort: 'normal', deepRule: { ...DEEP_RULE, maxLuts: 10 } });
  assert.deepEqual(r.warnings, ['Warning: the mapping balanced as sums of products failed (Yosys failed: RangeError: out of memory): the netlist chosen before is kept']);
  assert.deepEqual(r.depth.sopb, { kept: false, failed: 'Yosys failed: RangeError: out of memory' });
  const one = await synthesizeOpen(deepChain, { family: 'spartan3e', run: yosysNode, effort: 'normal', depth: false });
  assert.equal(r.files['chain.json'], one.files['chain.json']);
});
test('#468 logicLevels: the LUTs and MUXF5s on the deepest path between sequential cells; deepDesign', () => {
  // a netlist by hand: FF -> LUT -> LUT -> MUXF5 (with a LUT on I1) -> MUXF6 -> FF; a carry chain of 3
  // MUXCYs after a LUT; an input -> INV -> output
  let bit = 2;
  const cells = {}, b = () => bit++;
  const cell = (name, type, ins, outs) => { cells[name] = { type, port_directions: { ...Object.fromEntries(Object.keys(ins).map(p => [p, 'input'])), ...Object.fromEntries(Object.keys(outs).map(p => [p, 'output'])) }, connections: { ...ins, ...outs } }; };
  const q = b(), l1 = b(), l2 = b(), l3 = b(), f5 = b(), f6 = b(), c0 = b(), c1 = b(), c2 = b(), s = b(), i = b(), o = b();
  cell('ff', 'FDRE', { D: [f6], C: [b()] }, { Q: [q] });
  cell('a', 'LUT2', { I0: [q], I1: [q] }, { O: [l1] });
  cell('b2', 'LUT1', { I0: [l1] }, { O: [l2] });
  cell('c', 'LUT1', { I0: [q] }, { O: [l3] });
  cell('m5', 'MUXF5', { I0: [l2], I1: [l3], S: [q] }, { O: [f5] });
  cell('m6', 'MUXF6', { I0: [f5], I1: [f5], S: [q] }, { O: [f6] });
  cell('sl', 'LUT2', { I0: [q], I1: [q] }, { O: [s] });
  cell('k0', 'MUXCY', { CI: ['0'], DI: [q], S: [s] }, { O: [c0] });
  cell('k1', 'MUXCY', { CI: [c0], DI: [q], S: [s] }, { O: [c1] });
  cell('k2', 'MUXCY', { CI: [c1], DI: [q], S: [s] }, { O: [c2] });
  cell('ff2', 'FDRE', { D: [c2], C: [b()] }, { Q: [b()] });
  cell('n', 'INV', { I: [i] }, { O: [o] });
  const json = { modules: { t: { ports: {}, cells, netnames: {} } } };
  // (a, b2, m5: the LUTs then the MUXF5, the MUXF6 none; the carry chain: its LUT alone)
  assert.equal(logicLevels(json, 't'), 3);
  assert.equal(deepDesign(json, 't'), false);
  assert.equal(deepDesign(json, 't', { levels: 2 }), true);
  assert.deepEqual(DEEP_RULE, { levels: 16, maxLuts: 1500, gain: 0.25 });
  // a chain of 20 LUTs: deep; of 6000 LUTs in parallel besides: too large for the depth mappings
  const chain = (n, extra) => {
    const cs = {};
    let prev = 2;
    cs.f = { type: 'FDRE', port_directions: { D: 'input', Q: 'output' }, connections: { D: [100 + n], Q: [2] } };
    for (let k = 0; k < n; k++) cs[`l${k}`] = { type: 'LUT1', port_directions: { I0: 'input', O: 'output' }, connections: { I0: [prev], O: [prev = 101 + k] } };
    for (let k = 0; k < extra; k++) cs[`x${k}`] = { type: 'LUT1', port_directions: { I0: 'input', O: 'output' }, connections: { I0: [2], O: [100000 + k] } };
    return { modules: { t: { ports: {}, cells: cs, netnames: {} } } };
  };
  assert.equal(logicLevels(chain(20, 0), 't'), 20);
  assert.equal(deepDesign(chain(16, 0), 't'), false);
  assert.equal(deepDesign(chain(17, 0), 't'), true);
  // (#611: 1500 LUTs at most, ITC'99 b20 to b22 and the EPFL voter and sin, of 2000 to 3300, as fast with High's mappings)
  assert.equal(deepDesign(chain(17, DEEP_RULE.maxLuts - 17), 't'), true);
  assert.equal(deepDesign(chain(17, DEEP_RULE.maxLuts - 16), 't'), false);
  assert.equal(deepDesign(chain(17, DEEP_RULE.maxLuts - 16), 't', { levels: 16 }), true);
});
test('#468 Optimization Effort Normal: a comparator chain of 17 levels gets the mappings for speed, faster; the same function', { timeout: 180000 }, async () => {
  const text = CHAIN.replace(/23/g, '47').replace('i < 24', 'i < 48');
  const deepChain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text }]), 'chain');
  const count = () => { const f = (...a) => { if (!FSM_PROBE.test(a[0].join(' '))) f.n++; return yosysNode(...a); }; f.n = 0; return f; };
  const auto = count(), alone = count();
  const n = await synthesizeOpen(deepChain, { family: 'spartan3e', run: auto, effort: 'normal' });
  // (depth: false, the usual mapping alone: Normal before #468)
  const one = await synthesizeOpen(deepChain, { family: 'spartan3e', run: alone, effort: 'normal', depth: false });
  assert.equal(alone.n, 1);
  assert.ok(auto.n > 1, String(auto.n));
  assert.deepEqual([n.depth.levels, n.depth.auto, n.depth.tried, n.depth.kept], [17, true, true, true]);
  // (#611: High's mappings a quarter faster than Normal's own netlist at least, kept)
  assert.equal(n.depth.normal.kept, false);
  assert.equal(n.depth.normal.luts, one.util.luts);
  assert.ok(criticalDelay(n.files['chain.json'], 'chain') <= n.depth.normal.ns * 0.75, JSON.stringify(n.depth.normal));
  assert.deepEqual(one.depth.levels, undefined);
  assert.deepEqual(n.warnings, []);
  assert.deepEqual(one.warnings, []);
  const [nsAuto, nsOne] = [criticalDelay(n.files['chain.json'], 'chain'), criticalDelay(one.files['chain.json'], 'chain')];
  assert.ok(nsAuto < nsOne * 0.6, `${nsAuto} ns against ${nsOne}`);
  const d = compareNetlist(deepChain, n, { name: 'effort-normal-deep-chain', sim: { cycles: 200 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
});
