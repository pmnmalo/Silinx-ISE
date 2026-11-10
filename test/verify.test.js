// Verify (#3177, core/verify.js, core/verify-bench.js): a module's equivalence with a reference module by Yosys's SAT
// solver (Yosys WASM, as in the browser): proved by induction, bounded, or the counterexample (its first difference at
// the shortest depth), in VHDL and in Verilog, the two languages mixed; the counterexample's test bench, in VHDL and in
// Verilog, simulated: the same difference at the same clock cycle; the refusals (ports, modules, depth); Yosys's log
// read. With SILINX_SBY (a SymbiYosys command, e.g. yowasp-sby), each result compared with sby's own on the same
// miter (abc bmc3 and abc pdr): the same verdict, the counterexample's same length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { verifyEquivalence, verifyMessages, verifyScript, readVerifyLog, isVerifyBench } from '../core/verify.js';
import { counterexampleBench, benchName } from '../core/verify-bench.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { toVerilog } from '../core/synth-verilog.js';
import { example, EXAMPLES } from './examples-lib.mjs';

const VHDL_HEAD = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\n';
// a 4-bit counter with a synchronous reset and an enable, counting to 15 (VHDL) or to 9 (the reference, Verilog)
const CNT_VHD = { path: 'src/cnt.vhd', text: `${VHDL_HEAD}entity cnt is port (clk, rst, en : in std_logic; q : out unsigned(3 downto 0)); end cnt;
architecture rtl of cnt is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= c;
end rtl;
` };
const DEC_V = { path: 'sim/cnt_ref.v', role: 'simulation', text: `module cnt_ref (input clk, rst, en, output [3:0] q);
  reg [3:0] c = 0;
  assign q = c;
  always @(posedge clk) if (rst) c <= 0; else if (en) c <= (c == 9) ? 0 : c + 1;
endmodule
` };
// the same counter as the VHDL one, in Verilog, with an asynchronous reset in both
const HEX_V = { path: 'sim/hex_ref.v', role: 'simulation', text: `module hex_ref (input clk, rst, en, output [3:0] q);
  reg [3:0] c = 0;
  assign q = c;
  always @(posedge clk or posedge rst) if (rst) c <= 0; else if (en) c <= c + 4'd1;
endmodule
` };
const ACNT_VHD = { path: 'src/acnt.vhd', text: `${VHDL_HEAD}entity acnt is port (clk, rst, en : in std_logic; q : out std_logic_vector(3 downto 0)); end acnt;
architecture rtl of acnt is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk, rst) begin
    if rst = '1' then c <= (others => '0');
    elsif rising_edge(clk) then
      if en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
end rtl;
` };
// a free-running 5-bit counter whose output says 12: equal to the reference's 0 for 12 cycles (not by induction)
const TICK_V = { path: 'src/tick.v', text: `module tick (input clk, output q);
  reg [4:0] c = 0;
  assign q = c == 12;
  always @(posedge clk) c <= c + 1;
endmodule
module tick_ref (input clk, output q);
  assign q = 1'b0;
endmodule
` };
// a 2:1 multiplexer and a wrong one (its select inverted): combinational
const MUX_VHD = { path: 'src/mux.vhd', text: `${VHDL_HEAD}entity mux is port (a, b : in std_logic_vector(1 downto 0); s : in std_logic; y : out std_logic_vector(1 downto 0)); end mux;
architecture rtl of mux is begin
  y <= a when s = '0' else b;
end rtl;
` };
const MUX_V = { path: 'src/mux_ref.v', text: `module mux_ref (input [1:0] a, b, input s, output [1:0] y);
  assign y = s ? a : b;
endmodule
` };

// Yosys's run, its files kept (the miter's sources, for sby)
const runs = [];
const run = async (args, files, onLine) => { runs.push(files); return yosysNode(args, files, onLine); };
const check = (srcs, top, reference, depth) => verifyEquivalence(srcs, { top, reference, depth, run });
// the counterexample's test bench simulated: its last messages, the time it stopped
function replay(r, lang, srcs) {
  const tb = { path: `sim/${benchName(r.top)}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, role: 'simulation', text: counterexampleBench(r, { lang }) };
  const s = simulate([...srcs, tb], benchName(r.top), { until: 1e15 });
  assert.deepEqual(s.errors, []);
  return { log: s.sim.log.map(l => l.text), ns: s.sim.now / 1000 };
}

test('the counter against a decimal reference: the counterexample at clock cycle 11 (q = 10, the reference\'s 0)', async () => {
  const srcs = [CNT_VHD, DEC_V];
  const r = await check(srcs, 'cnt', 'cnt_ref');
  assert.equal(r.status, 'failed');
  assert.deepEqual([r.cycle, r.differs, r.clocks, r.lang, r.warnings, r.errors], [11, ['q'], ['clk'], 'vhdl', [], []]);
  // (the shortest difference: ten counts with no reset, then the outputs differ)
  for (const c of r.cycles.slice(0, 10)) assert.deepEqual([c.in.rst, c.in.en], ['0', '1']);
  assert.deepEqual([r.cycles[10].uut.q, r.cycles[10].ref.q], ['1010', '0000']);
  r.cycles.forEach((c, k) => assert.equal(c.uut.q, k <= 10 ? k.toString(2).padStart(4, '0') : undefined));
  assert.deepEqual(verifyMessages(r, { bench: 'sim/verify_cnt.vhd' }).map(m => [m.kind, m.text]), [
    ['hdr', '\nStarted : "Verify Equivalence".\n'],
    ['info', 'Verifying \'cnt\' against its reference \'cnt_ref\': Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.'],
    ['err', 'ERROR:Verify - \'cnt\' differs from its reference \'cnt_ref\' at clock cycle 11: q = 1010, the reference\'s q = 0000.'],
    ['info', 'The counterexample\'s test bench: sim/verify_cnt.vhd (it replays the 11 clock cycle(s) in the simulator, both modules side by side).'],
    ['err', '\nProcess "Verify Equivalence" failed'],
  ]);
  // replayed in VHDL and in Verilog: the same difference, at the same cycle (20 ns each, compared 5 ns into it)
  for (const [lang, end] of [['vhdl', 'simulation finished ($failure) at 205 ns'], ['verilog', 'simulation finished ($finish) at 205 ns']]) {
    assert.deepEqual(replay(r, lang, srcs), { log: ['clock cycle 11: q = 1010, the reference\'s q = 0000',
      'VERIFY FAILED: \'cnt\' differs from its reference \'cnt_ref\' at clock cycle 11', end], ns: 205 });
  }
  // the test bench: the module's types (unsigned) and the reference's (std_logic_vector), both in the waves
  const vhd = counterexampleBench(r, { lang: 'vhdl' });
  assert.ok(isVerifyBench(vhd) && isVerifyBench(counterexampleBench(r, { lang: 'verilog' })) && !isVerifyBench(CNT_VHD.text));
  assert.match(vhd, /signal q : unsigned\(3 downto 0\);\n {2}signal ref_q : std_logic_vector\(3 downto 0\);/);
  assert.match(vhd, /^-- Counterexample of Verify \(Silinx\): 'cnt' differs from its reference 'cnt_ref' at clock cycle 11 \(q\)\.$/m);
});

test('equivalent modules, VHDL and Verilog, asynchronous resets: proved by induction, no warnings', async () => {
  const r = await check([ACNT_VHD, HEX_V], 'acnt', 'hex_ref');
  assert.deepEqual([r.status, r.induction, r.warnings, r.errors], ['proved', 1, [], []]);
  assert.deepEqual(verifyMessages(r).map(m => m.text).slice(1), [
    'Verifying \'acnt\' against its reference \'hex_ref\': Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.',
    'Proved: \'acnt\' gives the outputs of \'hex_ref\' for every input sequence (by induction over 1 clock cycle(s)).',
    '\nProcess "Verify Equivalence" completed successfully']);
  // (and the other way round, the Verilog module verified against the VHDL one)
  assert.equal((await check([ACNT_VHD, HEX_V], 'hex_ref', 'acnt')).status, 'proved');
  // the synchronous-reset counter against the asynchronous one: the reset's value seen at once, a cycle earlier
  const d = await check([CNT_VHD, HEX_V], 'cnt', 'hex_ref');
  assert.deepEqual([d.status, d.cycle, d.cycles[d.cycle - 1].in.rst, d.differs], ['failed', 2, '1', ['q']]);
});

test('a difference after the depth: bounded (a warning), then found with a larger depth', async () => {
  const b = await check([TICK_V], 'tick', 'tick_ref', 8);
  assert.deepEqual([b.status, b.depth, b.warnings], ['bounded', 8, []]);
  assert.deepEqual(verifyMessages(b).map(m => [m.kind, m.text]).slice(2), [
    ['warn', 'WARNING:Verify - no difference in the first 8 clock cycle(s), but not proved beyond them (the induction did not succeed): a larger depth checks more cycles.'],
    ['ok', '\nProcess "Verify Equivalence" completed successfully with 1 warning(s)']]);
  const f = await check([TICK_V], 'tick', 'tick_ref', 20);
  assert.deepEqual([f.status, f.cycle, f.differs, f.cycles[12].uut.q, f.cycles[12].ref.q], ['failed', 13, ['q'], '1', '0']);
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(replay(f, lang, [TICK_V]).log.slice(0, 2), ['clock cycle 13: q = 1, the reference\'s q = 0', 'VERIFY FAILED: \'tick\' differs from its reference \'tick_ref\' at clock cycle 13']);
});

test('a combinational module: its difference in the first cycle, replayed 10 ns after the inputs', async () => {
  const r = await check([MUX_VHD, MUX_V], 'mux', 'mux_ref');
  assert.deepEqual([r.status, r.cycle, r.clocks, r.differs], ['failed', 1, [], ['y']]);
  const c = r.cycles[0];
  assert.notEqual(c.in.a, c.in.b);
  assert.deepEqual([c.uut.y, c.ref.y], c.in.s === '0' ? [c.in.a, c.in.b] : [c.in.b, c.in.a]);
  for (const [lang, end] of [['vhdl', '$failure'], ['verilog', '$finish']]) {
    assert.deepEqual(replay(r, lang, [MUX_VHD, MUX_V]), { log: [`clock cycle 1: y = ${c.uut.y}, the reference's y = ${c.ref.y}`,
      'VERIFY FAILED: \'mux\' differs from its reference \'mux_ref\' at clock cycle 1', `simulation finished (${end}) at 10 ns`], ns: 10 });
  }
});

test('the refusals: no reference, the same module, different ports, a depth out of range', async () => {
  const errs = async (srcs, top, ref, depth) => { const r = await check(srcs, top, ref, depth); assert.equal(r.status, 'error'); assert.equal(verifyMessages(r).at(-1).text, '\nProcess "Verify Equivalence" failed'); return r.errors; };
  assert.deepEqual(await errs([CNT_VHD], 'cnt', 'nothing'), ['the reference \'nothing\' is not a module of the project']);
  assert.deepEqual(await errs([CNT_VHD], 'cnt', 'CNT'), ['\'cnt\' cannot be its own reference']);
  assert.deepEqual(await errs([CNT_VHD, MUX_VHD], 'cnt', undefined), ['no reference module for \'cnt\'']);
  for (const depth of [0, 1001, 2.5]) assert.deepEqual(await errs([CNT_VHD, DEC_V], 'cnt', 'cnt_ref', depth), ['the depth must be a number of clock cycles from 1 to 1000']);
  assert.deepEqual(await errs([CNT_VHD, MUX_V], 'cnt', 'mux_ref'), ['\'cnt\' and its reference \'mux_ref\' must have the same ports: port clk of \'cnt\' is not a port of \'mux_ref\'; port rst of \'cnt\' is not a port of \'mux_ref\'; port en of \'cnt\' is not a port of \'mux_ref\'; port q of \'cnt\' is not a port of \'mux_ref\'; port a of \'mux_ref\' is not a port of \'cnt\'; port b of \'mux_ref\' is not a port of \'cnt\'; port s of \'mux_ref\' is not a port of \'cnt\'; port y of \'mux_ref\' is not a port of \'cnt\'']);
  const wide = { path: 'src/w.v', text: 'module w_ref (input clk, rst, en, output [4:0] q); assign q = 0; endmodule\nmodule d_ref (input clk, rst, output [3:0] q, input en); assign q = 0; endmodule\nmodule o_ref (input clk, rst, en, inout [3:0] q); endmodule\n' };
  assert.deepEqual(await errs([CNT_VHD, wide], 'cnt', 'w_ref'), ['\'cnt\' and its reference \'w_ref\' must have the same ports: port q has 4 bit(s) in \'cnt\' and 5 in \'w_ref\'']);
  assert.equal((await check([CNT_VHD, wide], 'cnt', 'd_ref')).status, 'failed');   // (checked: the ports' order does not matter)
  assert.deepEqual(await errs([CNT_VHD, wide], 'cnt', 'o_ref'), ['\'cnt\' and its reference \'o_ref\' must have the same ports: port q is an output of \'cnt\' and an inout of \'o_ref\'; port q of \'o_ref\' is bidirectional: Verify compares inputs and outputs only']);
  assert.deepEqual(await errs([{ path: 'x.v', text: 'module x(input a, output y); assign y = ; endmodule' }, MUX_V], 'x', 'mux_ref'), ['x.v:1 unexpected \';\' in expression']);
});

test('Yosys\'s script, and its log read: a proof, a bounded check, a counterexample', () => {
  assert.equal(verifyScript(7), 'read_verilog -sv silinx_ref.sv silinx_uut.sv; proc; memory; opt_clean; async2sync; miter -equiv -flatten -make_outputs -make_assert silinx_ref silinx_uut silinx_miter; hierarchy -top silinx_miter; opt_clean; sat -tempinduct -prove-asserts -set-init-zero -maxsteps 7 -show-inputs -show-outputs silinx_miter');
  assert.deepEqual(readVerifyLog(['** Trying induction with length 1 **', '** Trying induction with length 2 **', 'Induction step proven: SUCCESS!', 'Warning: odd']), { status: 'proved', induction: 2, warnings: ['odd'] });
  assert.deepEqual(readVerifyLog(['Reached maximum number of time steps -> proof failed.']), { status: 'bounded', warnings: [] });
  assert.deepEqual(readVerifyLog(['nothing']), { status: 'error', warnings: [] });
  const log = ['  Time Signal Name  Dec Hex Bin', '     1 \\in_a  0 0 0', // (an induction step's table, before the base case's: not read)
    'SAT temporal induction proof finished - model found for base case: FAIL!', '', '  Time Signal Name             Dec       Hex           Bin',
    '  ---- --------------- ----------- --------- -------------', '     1 \\gate_y   1   1   01', '     1 \\gold_y   1   1   01', '     1 \\in_a     1   1   01', '     1 \\trigger  0   0    0',
    '  ---- --------------- ----------- --------- -------------', '     2 \\gate_y   2   2   10', '     2 \\gold_y   3   3   11', '     2 \\in_a     3   3   11', '     2 \\trigger  1   1    1', '', 'Dumping SAT model'];
  assert.deepEqual(readVerifyLog(log, ['y']), { status: 'failed', cycle: 2, differs: ['y'], warnings: [],
    cycles: [{ in: { a: '01' }, uut: { y: '01' }, ref: { y: '01' } }, { in: { a: '11' }, uut: { y: '10' }, ref: { y: '11' } }] });
});

// The examples against their own flat Verilog (the open synthesis's, core/synth-verilog.js, read back by Silinx's Verilog
// front end): no difference in 10 clock cycles, no warnings; gates (combinational) proved. (stopwatch and micro80 left
// out: Yosys's SAT solver takes minutes from their second clock cycle on, #3177's later parts)
const SLOW = new Set(['stopwatch', 'micro80']);
test('the examples against their own flat Verilog: no difference, no warnings', async () => {
  const got = {};
  for (const ex of EXAMPLES.filter(e => !SLOW.has(e))) {
    const { design, project: { top } } = example(ex);
    const d = elaborate(compile([...primitiveSources(design), ...design]), top);
    const ref = { path: 'sim/ref.sv', lang: 'verilog', role: 'simulation', text: toVerilog(d, { name: `${top}_ref` }).text };
    const r = await check([...design, ref], top, `${top}_ref`, 10);
    got[ex] = [r.status, r.warnings, r.errors];
  }
  assert.deepEqual(got, Object.fromEntries(EXAMPLES.filter(e => !SLOW.has(e)).map(e => [e, [e === 'gates' ? 'proved' : 'bounded', [], []]])));
});

// SymbiYosys on the same miter, natively (SILINX_SBY: its command), as an independent reference
const SBY = process.env.SILINX_SBY;
function sby(files, depth) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-sby-'));
  try {
    for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), t);
    const script = verifyScript(depth).split('; ').filter(c => !/^sat /.test(c)).join('\n');
    fs.writeFileSync(path.join(dir, 'eq.sby'), `[tasks]\nbmc\nprove\n[options]\nbmc: mode bmc\nprove: mode prove\ndepth ${depth}\naigsmt none\n[engines]\nbmc: abc bmc3\nprove: abc pdr\n[script]\n${script}\nsetundef -zero -init\n[files]\n${Object.keys(files).join('\n')}\n`);
    let out = '';
    try { out = execFileSync(SBY, ['-f', 'eq.sby'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { out = e.stdout || ''; }
    const done = task => /\[eq_(\w+)\] DONE \((\w+),/.exec(out.split('\n').filter(l => l.includes(`[eq_${task}] DONE`))[0] || '')?.[2];
    const frame = /\[eq_bmc\] engine_0: Output 0 of miter .* was asserted in frame (\d+)/.exec(out)?.[1];
    return { bmc: done('bmc'), prove: done('prove'), cycle: frame === undefined ? null : +frame + 1 };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('the same verdicts as SymbiYosys\'s (abc bmc3, abc pdr), natively', { skip: !SBY && 'SILINX_SBY (a SymbiYosys command) not set' }, async () => {
  for (const [srcs, top, ref, depth] of [[[CNT_VHD, DEC_V], 'cnt', 'cnt_ref', 20], [[ACNT_VHD, HEX_V], 'acnt', 'hex_ref', 20], [[TICK_V], 'tick', 'tick_ref', 8], [[TICK_V], 'tick', 'tick_ref', 20], [[MUX_VHD, MUX_V], 'mux', 'mux_ref', 20], [[CNT_VHD, HEX_V], 'cnt', 'hex_ref', 20]]) {
    runs.length = 0;
    const r = await check(srcs, top, ref, depth);
    const s = sby(runs[0], depth);
    const what = `${top} / ${ref}, ${depth}`;
    // (ABC's bmc3 refuses a combinational network, "Does not work for combinational networks": pdr's verdict only)
    if (!r.clocks.length) assert.deepEqual([r.status, s.prove], ['failed', 'FAIL'], what);
    else if (r.status === 'failed') assert.deepEqual(s, { bmc: 'FAIL', prove: 'FAIL', cycle: r.cycle }, what);
    else if (r.status === 'proved') assert.deepEqual(s, { bmc: 'PASS', prove: 'PASS', cycle: null }, what);
    else assert.deepEqual([r.status, s.bmc, s.cycle], ['bounded', 'PASS', null], what);
  }
});
