// Open synthesis (core/synth-open.js): Silinx's front end + Yosys compiled to WebAssembly (YoWASP),
// here in Node (in the browser the same module runs in a Web Worker: test/ui/synth-open.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen, synthEffort, yosysScript, yosysFiles, synthCommands, remapCommands, abc9RemapCommands, muxfRemapCommands, muxTrees, MUXF_MAP, MUXF_MAP_FILE, MUX_COUNT_FILE, criticalDelay, keepDepth, keepSecond, sliceCount, cellCounts, utilization, lineStream, YOSYS_FAMILY, QUIET, DEPTH_ABC, DEPTH_ABC2, PREMAP_FILE, DEPTH_RULE, LUT_LIB, LUT_LIB_FILE, abcInline, logicLevels, deepDesign, DEEP_RULE } from '../core/synth-open.js';
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
  // (and the wide multiplexer trees counted on a copy of it, #511)
  assert.equal(yosysScript('top', 'spartan3e', { premap: PREMAP_FILE }), yosysScript('top', 'spartan3e').replace('abc -luts', 'write_rtlil silinx_premap.il; '
    + 'design -save silinx_premap; muxcover -mux8 -mux16 -nodecode -nopartial; tee -q -o silinx_muxes.txt select -count t:$_MUX8_ t:$_MUX16_; design -load silinx_premap; abc -luts'));
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

// #377: the slices too, when known (sliceCount: core/fpga/pack.js's count): a netlist with 5 % fewer slices is
// smaller even with more LUTs; fewer LUTs, more slices is not; a faster one is not larger in slices either
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
  // (raised by Yosys 0.70 (#368): 313 LUTs with 0.68, 319 with 0.70)
  assert.deepEqual([r2.util.luts, r2.util.muxes, r2.depth.wide.kept], [319, 0, false], JSON.stringify(r2.depth));
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
    const count = () => { const f = (...a) => { f.n++; return yosysNode(...a); }; f.n = 0; return f; };
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
  // the counter: no tree, the usual run alone, no muxf in r.depth
  const count = () => { const f = (...a) => { f.n++; return yosysNode(...a); }; f.n = 0; return f; };
  const one = count();
  const n = await synthesizeOpen(design(COUNTER, 'counter'), { family: 'spartan3e', run: one, effort: 'normal' });
  assert.deepEqual([one.n, n.depth.muxf], [1, undefined]);
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
// (a design written as gates: its adders' chains too, #377, test/carry-chain.test.js); High every mapping, the
// fastest kept (the default of synthesizeOpen, for the quality comparisons)
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
  // (its 9 levels of logic: not limited by its depth, #468)
  assert.deepEqual([n.depth.levels, n.depth.auto], [9, false]);
  assert.deepEqual(n.warnings, []);
  // the usual mapping: slower than High's on this comparator chain, the same function
  assert.ok(criticalDelay(n.files['chain.json'], 'chain') > criticalDelay(hi.files['chain.json'], 'chain'));
  const d = compareNetlist(chain, n, { name: 'effort-normal-chain', sim: { cycles: 200 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
});

// #468: at Normal, a design limited by its logic depth (DEEP_RULE: more than 16 levels, DEPTH_RULE.maxLuts LUTs at
// most) gets High's mappings too; the others keep the one run
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
  assert.deepEqual(DEEP_RULE, { levels: 16 });
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
  assert.equal(deepDesign(chain(17, DEPTH_RULE.maxLuts - 17), 't'), true);
  assert.equal(deepDesign(chain(17, DEPTH_RULE.maxLuts - 16), 't'), false);
});
test('#468 Optimization Effort Normal: a comparator chain of 17 levels gets the mappings for speed, faster; the same function', { timeout: 180000 }, async () => {
  const text = CHAIN.replace(/23/g, '47').replace('i < 24', 'i < 48');
  const deepChain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text }]), 'chain');
  const count = () => { const f = (...a) => { f.n++; return yosysNode(...a); }; f.n = 0; return f; };
  const auto = count(), alone = count();
  const n = await synthesizeOpen(deepChain, { family: 'spartan3e', run: auto, effort: 'normal' });
  // (depth: false, the usual mapping alone: Normal before #468)
  const one = await synthesizeOpen(deepChain, { family: 'spartan3e', run: alone, effort: 'normal', depth: false });
  assert.equal(alone.n, 1);
  assert.ok(auto.n > 1, String(auto.n));
  assert.deepEqual([n.depth.levels, n.depth.auto, n.depth.tried, n.depth.kept], [17, true, true, true]);
  assert.deepEqual(one.depth.levels, undefined);
  assert.deepEqual(n.warnings, []);
  assert.deepEqual(one.warnings, []);
  const [nsAuto, nsOne] = [criticalDelay(n.files['chain.json'], 'chain'), criticalDelay(one.files['chain.json'], 'chain')];
  assert.ok(nsAuto < nsOne * 0.6, `${nsAuto} ns against ${nsOne}`);
  const d = compareNetlist(deepChain, n, { name: 'effort-normal-deep-chain', sim: { cycles: 200 } });
  assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
});
