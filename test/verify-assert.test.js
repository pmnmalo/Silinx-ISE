// Verify Assertions (#3177, core/verify-assert.js): a module's own assertions proved by Yosys's SAT solver (Yosys WASM,
// as in the browser): VHDL's assert (sequential and concurrent; a note is a message, not checked), Verilog's immediate
// assert / assume and concurrent assert / assume property (|->, |=>, disable iff, an else action); proved by
// induction, bounded, or failed: the counterexample replayed by the simulator, the assertion that fails and its clock
// cycle as the simulation reports them, its test bench (the module alone) in VHDL and in Verilog; the refusals; the
// flat SystemVerilog's assertions (toVerilog's formal, none without it). With SILINX_SBY (a SymbiYosys command), each
// verdict compared with sby's own (abc bmc3, abc pdr) on the same flat module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { verifyAssertions, assertMessages, countAssertions } from '../core/verify-assert.js';
import { assertScript } from '../core/verify.js';
import { counterexampleBench, benchName } from '../core/verify-bench.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { toVerilog } from '../core/synth-verilog.js';

const H = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\n';
// a counter whose assertion fails when it reaches 9 (clocked), and one that saturates at 9 (a concurrent assertion)
const CNT = { path: 'src/cnt.vhd', lang: 'vhdl', text: `${H}entity cnt is port (clk, rst, en : in std_logic; q : out unsigned(3 downto 0)); end cnt;
architecture rtl of cnt is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      assert c /= 9 report "c reached 9" severity error;
      if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  assert not (rst = '1' and en = '1') report "reset and enable" severity note;
  q <= c;
end rtl;
` };
const SAT = { path: 'src/sat9.vhd', lang: 'vhdl', text: `${H}entity sat9 is port (clk, rst, en : in std_logic; q : out unsigned(3 downto 0)); end sat9;
architecture rtl of sat9 is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif en = '1' and c /= 9 then c <= c + 1; end if;
    end if;
  end process;
  assert c <= 9 report "c above 9" severity error;
  q <= c;
end rtl;
` };
// a request / acknowledge: ack follows req a cycle later, unless reset
const HS = { path: 'src/hs.v', lang: 'verilog', text: `module hs (input clk, input rst, input req, output reg ack = 0);
  always @(posedge clk) ack <= rst ? 1'b0 : req;
  follows: assert property (@(posedge clk) disable iff (rst) req |=> ack) else $error("no ack after a request");
  assert property (@(posedge clk) !req |=> !ack);
endmodule
` };
// the same with a wrong one: req and ack never both high (they are, from the second cycle of a request)
const HS2 = { path: 'src/hs2.v', lang: 'verilog', text: HS.text.replace('module hs ', 'module hs2 ').replace('  assert property (@(posedge clk) !req |=> !ack);', '  assert property (@(posedge clk) req |-> !ack) else $error("req and ack together");') };
// an adder whose result never overflows: true only when the inputs are assumed below 8
const ADD = { path: 'src/add.v', lang: 'verilog', text: `module add (input [3:0] a, input [3:0] b, output [4:0] s);
  assign s = a + b;
  always @* begin
    assume (a < 8 && b < 8);
    assert (s < 15);
  end
endmodule
` };
const ADD_NO = { ...ADD, path: 'src/add_no.v', text: ADD.text.replace('module add ', 'module add_no ').replace('    assume (a < 8 && b < 8);\n', '') };

const runs = [];
const run = async (args, files, onLine) => { runs.push(files); return yosysNode(args, files, onLine); };
const check = (srcs, top, depth) => verifyAssertions(srcs, { top, depth, run });
const msgs = (r, o) => assertMessages(r, o).map(m => [m.kind, m.text.trim()]).filter(([, t]) => t);
// the counterexample's test bench simulated: the module's messages (its assertions'), their times
function replay(r, lang, srcs) {
  const tb = { path: `sim/${benchName(r.top)}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, role: 'simulation', text: counterexampleBench(r, { lang }) };
  const s = simulate([...srcs, tb], benchName(r.top), { until: 1e15 });
  assert.deepEqual(s.errors, []);
  return s.sim.log.filter(l => l.file !== tb.path && ['warning', 'error', 'failure'].includes(l.kind)).map(l => [l.time / 1000, l.line, l.text]);
}

test('a clocked VHDL assertion that fails: at clock cycle 10, its message, replayed in VHDL and Verilog (a note not checked)', async () => {
  const r = await check([CNT], 'cnt');
  assert.equal(r.status, 'failed');
  assert.deepEqual([r.cycle, r.steps, r.failure, r.asserts, r.assumes, r.clocks, r.warnings, r.errors], [10, 11, { file: 'src/cnt.vhd', line: 8, text: 'c reached 9' }, 1, 0, ['clk'], [], []]);
  r.cycles.forEach((c, k) => assert.equal(c.uut.q, k.toString(2).padStart(4, '0')));
  assert.deepEqual(msgs(r, { bench: 'sim/verify_cnt.vhd' }), [
    ['hdr', 'Started : "Verify Assertions".'],
    ['info', 'Proving the 1 assertion(s) of \'cnt\': Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.'],
    ['err', 'ERROR:Verify - an assertion of \'cnt\' fails at clock cycle 10: src/cnt.vhd:8: c reached 9.'],
    ['info', 'The counterexample\'s test bench: sim/verify_cnt.vhd (it replays the 10 clock cycle(s) in the simulator).'],
    ['err', 'Process "Verify Assertions" failed'],
  ]);
  // (the rising edge of cycle 10 at 190 ns: c = 9 before it)
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(replay(r, lang, [CNT]), [[190, 8, 'c reached 9']], lang);
  const tb = counterexampleBench(r, { lang: 'vhdl' });
  assert.match(tb, /^-- Counterexample of Verify \(Silinx\): an assertion of 'cnt' fails at clock cycle 10\.\n/);
  assert.doesNotMatch(tb, /reference/);
});

test('a concurrent VHDL assertion on a register: the cycle where its value is 9, as the clocked one\'s (simulated at the edge before)', async () => {
  const CC = { ...CNT, text: CNT.text.replace('      assert c /= 9 report "c reached 9" severity error;\n', '').replace('  q <= c;', '  assert c /= 9 report "c is 9" severity error;\n  q <= c;') };
  const r = await check([CC], 'cnt');
  assert.deepEqual([r.status, r.cycle, r.steps, r.failure], ['failed', 10, 10, { file: 'src/cnt.vhd', line: 12, text: 'c is 9' }]);
  // (c becomes 9 at the rising edge of cycle 9, 170 ns: its value in cycle 10)
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(replay(r, lang, [CC]), [[170, 12, 'c is 9']], lang);
});

test('a concurrent VHDL assertion of a saturating counter: proved by induction; a smaller depth too', async () => {
  for (const depth of [20, 2]) {
    const r = await check([SAT], 'sat9', depth);
    assert.deepEqual([r.status, r.induction, r.warnings, r.errors], ['proved', 1, [], []]);
    assert.deepEqual(msgs(r).slice(1), [
      ['info', `Proving the 1 assertion(s) of 'sat9': Yosys's SAT solver, at most ${depth} clock cycle(s), then a proof by induction.`],
      ['ok', 'Proved: the assertions of \'sat9\' hold for every input sequence (by induction over 1 clock cycle(s)).'],
      ['ok', 'Process "Verify Assertions" completed successfully'],
    ]);
  }
});

test('an assertion that fails after the depth: bounded (a warning), then found with a larger depth', async () => {
  const r = await check([CNT], 'cnt', 5);
  assert.deepEqual([r.status, r.warnings], ['bounded', []]);
  assert.deepEqual(msgs(r).slice(2), [
    ['warn', 'WARNING:Verify - no assertion fails in the first 5 clock cycle(s), but they are not proved beyond them (the induction did not succeed): a larger depth checks more cycles.'],
    ['ok', 'Process "Verify Assertions" completed successfully with 1 warning(s)'],
  ]);
  assert.deepEqual([(await check([CNT], 'cnt', 11)).cycle], [10]);
});

test('SystemVerilog concurrent assertions: |=> with disable iff proved; |-> that fails, its else action\'s message', async () => {
  const ok = await check([HS], 'hs');
  assert.deepEqual([ok.status, ok.asserts, ok.warnings], ['proved', 2, []]);
  const r = await check([HS2], 'hs2');
  assert.deepEqual([r.status, r.cycle, r.failure, r.asserts, r.cycles.map(c => [c.in.rst, c.in.req, c.uut.ack])],
    ['failed', 2, { file: 'src/hs2.v', line: 4, text: 'req and ack together' }, 2, [['0', '1', '0'], ['0', '1', '1']]]);
  // (the edge of cycle 2 at 30 ns)
  for (const lang of ['verilog', 'vhdl']) assert.deepEqual(replay(r, lang, [HS2]), [[30, 4, 'req and ack together']], lang);
});

test('a combinational module: an assumption makes its assertion hold; without it, the counterexample at once', async () => {
  const ok = await check([ADD], 'add');
  assert.deepEqual([ok.status, ok.asserts, ok.assumes, ok.clocks], ['proved', 1, 1, []]);
  assert.equal(msgs(ok)[1][1], 'Proving the 1 assertion(s) of \'add\' (1 assumption(s) taken as true): Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.');
  const r = await check([ADD_NO], 'add_no');
  assert.deepEqual([r.status, r.cycle, r.failure], ['failed', 1, { file: 'src/add_no.v', line: 4, text: 'Assertion violation.' }]);
  assert.ok(parseInt(r.cycles[0].uut.s, 2) >= 15);
  assert.ok(parseInt(r.cycles[0].in.a, 2) + parseInt(r.cycles[0].in.b, 2) >= 15);
  // (10 ns after the inputs: they are applied at 0)
  for (const lang of ['verilog', 'vhdl']) assert.deepEqual(replay(r, lang, [ADD_NO]), [[0, 4, 'Assertion violation.']], lang);
});

test('the refusals: no module, no assertion (a note is not one), a depth out of range, a syntax error', async () => {
  const NOTE = { path: 'src/n.vhd', lang: 'vhdl', text: `${H}entity n is port (a : in std_logic; y : out std_logic); end n;\narchitecture r of n is begin\n  assert a = '0' report "a high" severity note;\n  y <= a;\nend r;\n` };
  const errs = async (srcs, top, depth) => (await check(srcs, top, depth)).errors;
  assert.deepEqual(await errs([CNT], undefined), ['no module to verify']);
  assert.deepEqual(await errs([CNT], 'nope'), ['the module \'nope\' is not a module of the project']);
  assert.deepEqual(await errs([NOTE], 'n'), ['\'n\' has no assertion to prove (VHDL: assert … severity warning, error or failure; Verilog: assert (…) or assert property (@(posedge clk) …))']);
  assert.deepEqual(await errs([CNT], 'cnt', 0), ['the depth must be a number of clock cycles from 1 to 1000']);
  assert.match((await errs([{ ...CNT, text: CNT.text.replace('end rtl;', 'end') }], 'cnt'))[0], /^src\/cnt\.vhd:\d+ /);
  const r = await check([NOTE], 'n');
  assert.deepEqual(msgs(r), [['hdr', 'Started : "Verify Assertions".'], ['err', `ERROR:Verify - ${r.errors[0]}`], ['err', 'Process "Verify Assertions" failed']]);
});

test('the flat SystemVerilog\'s assertions: written with formal only, a note left out, an assumption as assume', () => {
  const flat = (src, top, formal) => toVerilog(elaborate(compile([src]), top), { name: 'm', formal }).text;
  const asserts = t => t.split('\n').filter(l => /^\s*(assert|assume) /.test(l)).map(l => l.trim());
  assert.deepEqual(asserts(flat(CNT, 'cnt', true)), ['assert ((32\'(32\'(c)) != 32\'h9));']);
  // (few input bits: the comparisons as tables of their values, as the synthesis writes them)
  assert.deepEqual(asserts(flat(ADD, 'add', true)), ['assume ((tab0(a) && tab0(b)));', 'assert (tab1(s));']);
  for (const [src, top] of [[CNT, 'cnt'], [ADD, 'add'], [HS, 'hs']]) assert.deepEqual(asserts(flat(src, top, false)), [], top);
  assert.deepEqual(countAssertions(elaborate(compile([HS]), 'hs')), { asserts: 2, assumes: 0 });
  assert.equal(assertScript(7), 'read_verilog -sv -formal silinx_uut.sv; proc; memory; opt_clean; async2sync; chformal -lower; hierarchy -top silinx_uut; opt_clean; sat -tempinduct -prove-asserts -set-assumes -set-init-zero -maxsteps 7 -show-inputs -show-outputs silinx_uut');
});

// SymbiYosys on the same flat module, natively (SILINX_SBY: its command), as an independent reference
const SBY = process.env.SILINX_SBY;
function sby(files, depth) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-sby-'));
  try {
    for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), t);
    const script = assertScript(depth).split('; ').filter(c => !/^sat /.test(c)).join('\n');
    fs.writeFileSync(path.join(dir, 'a.sby'), `[tasks]\nbmc\nprove\n[options]\nbmc: mode bmc\nprove: mode prove\ndepth ${depth}\naigsmt none\n[engines]\nbmc: abc bmc3\nprove: abc pdr\n[script]\n${script}\nsetundef -zero -init\n[files]\n${Object.keys(files).join('\n')}\n`);
    let out = '';
    try { out = execFileSync(SBY, ['-f', 'a.sby'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { out = e.stdout || ''; }
    const done = task => /\[a_(\w+)\] DONE \((\w+),/.exec(out.split('\n').filter(l => l.includes(`[a_${task}] DONE`))[0] || '')?.[2];
    const frame = /\[a_bmc\] engine_0: Output \d+ of miter .* was asserted in frame (\d+)/.exec(out)?.[1];
    return { bmc: done('bmc'), prove: done('prove'), steps: frame === undefined ? null : +frame + 1 };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('the same verdicts as SymbiYosys\'s (abc bmc3, abc pdr), natively', { skip: !SBY && 'SILINX_SBY (a SymbiYosys command) not set' }, async () => {
  for (const [srcs, top, depth] of [[[CNT], 'cnt', 20], [[CNT], 'cnt', 5], [[SAT], 'sat9', 20], [[HS], 'hs', 20], [[HS2], 'hs2', 20], [[ADD], 'add', 20], [[ADD_NO], 'add_no', 20]]) {
    runs.length = 0;
    const r = await check(srcs, top, depth);
    const s = sby(runs[0], depth);
    const what = `${top}, ${depth}`;
    if (!r.clocks.length) assert.deepEqual([r.status, s.prove], [r.status === 'failed' ? 'failed' : 'proved', r.status === 'failed' ? 'FAIL' : 'PASS'], what);
    else if (r.status === 'failed') assert.deepEqual(s, { bmc: 'FAIL', prove: 'FAIL', steps: r.steps }, what);
    else if (r.status === 'proved') assert.deepEqual(s, { bmc: 'PASS', prove: 'PASS', steps: null }, what);
    else assert.deepEqual([r.status, s.bmc, s.steps], ['bounded', 'PASS', null], what);
  }
});
