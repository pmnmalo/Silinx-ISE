// The MCP server's verify (#3177, server/mcp-verify.js): a project's module against a reference module of its simulation
// sources, through core/verify.js as the interface's Verify Equivalence: proved, bounded, a counterexample written as
// sim/verify_<module> (VHDL or Verilog), replayed by the simulator with the same difference (and simulate shows it
// too), written again by the next check; the refusals (a file of the user's in its place, wrong ports, no reference).
// With no reference: the module's own assertions proved (core/verify-assert.js), a failure's test bench (the module
// alone) replayed, the assertion's message in its simulation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

const CNT = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is port (clk, rst, en : in std_logic; q : out std_logic_vector(3 downto 0)); end cnt;
architecture rtl of cnt is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
end rtl;
`;
const REF = top => `module cnt_ref (input clk, rst, en, output [3:0] q);
  reg [3:0] c = 0;
  assign q = c;
  always @(posedge clk) if (rst) c <= 0; else if (en) c <= ${top === 15 ? 'c + 1' : `(c == ${top}) ? 0 : c + 1`};
endmodule
`;
const HEAD = ['Started : "Verify Equivalence".', 'Verifying \'cnt\' against its reference \'cnt_ref\': Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.'];

before(async () => {
  tmp = await scratchEnv('silinx-mcp-verify-');
  await ok('new_project', { name: 'v' });
  await ok('write_file', { project: 'v', path: 'src/cnt.vhd', text: CNT });
  await ok('set_top', { project: 'v', top: 'cnt' });
  await ok('write_file', { project: 'v', path: 'sim/cnt_ref.v', text: REF(9) });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('verify: a difference: the counterexample written as a test bench, replayed with the same difference, in VHDL and in Verilog', async () => {
  for (const [lang, ext, end] of [['vhdl', 'vhd', 'simulation finished ($failure) at 205 ns'], ['verilog', 'v', 'simulation finished ($finish) at 205 ns']]) {
    const r = await call('verify', { project: 'v', reference: 'cnt_ref', ...(lang === 'verilog' ? { language: lang } : {}) });
    assert.equal(r.isError, false, r.text);
    const bench = `sim/verify_cnt.${ext}`;
    assert.equal(r.text, [...HEAD, 'ERROR:Verify - \'cnt\' differs from its reference \'cnt_ref\' at clock cycle 11: q = 1010, the reference\'s q = 0000.',
      `The counterexample's test bench: ${bench} (it replays the 11 clock cycle(s) in the simulator, both modules side by side).`,
      'Process "Verify Equivalence" failed', 'Simulation of verify_cnt:', '  clock cycle 11: q = 1010, the reference\'s q = 0000',
      '  VERIFY FAILED: \'cnt\' differs from its reference \'cnt_ref\' at clock cycle 11', `  ${end}`].join('\n'));
    assert.deepEqual([r.data.status, r.data.cycle, r.data.differs, r.data.testBench, r.data.counterexample.length, r.data.warnings], ['failed', 11, ['q'], bench, 11, []]);
    assert.equal((await P.readProject('v')).files.find(f => f.path === bench)?.role, 'sim');
    // the project's simulate on it: the same messages, the waves of both modules' outputs
    const s = await ok('simulate', { project: 'v', top: 'verify_cnt', time_ns: 1000, signals: ['q', 'ref_q'] });
    assert.deepEqual(s.data.log.map(l => l.text), r.data.replay);
    assert.deepEqual(s.data.warnings, []);
    await ok('delete_file', { project: 'v', path: bench });
  }
});

test('verify: written again by the next check; the reference fixed: proved; a depth too small: bounded', async () => {
  await ok('verify', { project: 'v', reference: 'cnt_ref' });
  await ok('verify', { project: 'v', reference: 'cnt_ref', depth: 30 });   // (its own test bench, replaced)
  await ok('verify', { project: 'v', reference: 'cnt_ref', language: 'verilog' });   // (the VHDL one replaced by the Verilog one)
  assert.deepEqual((await P.readProject('v')).files.filter(f => /verify_cnt/.test(f.path)).map(f => f.path), ['sim/verify_cnt.v']);
  await ok('verify', { project: 'v', reference: 'cnt_ref' });
  await ok('write_file', { project: 'v', path: 'sim/cnt_ref.v', text: REF(15) });
  const p = await ok('verify', { project: 'v', module: 'cnt', reference: 'cnt_ref' });
  assert.equal(p.text, [...HEAD, 'Proved: \'cnt\' gives the outputs of \'cnt_ref\' for every input sequence (by induction over 1 clock cycle(s)).', 'Process "Verify Equivalence" completed successfully'].join('\n'));
  assert.deepEqual(p.data, { project: 'v', module: 'cnt', reference: 'cnt_ref', status: 'proved', depth: 20, induction: 1, errors: [], warnings: [] });
  await ok('write_file', { project: 'v', path: 'sim/cnt_ref.v', text: REF(9) });
  const b = await ok('verify', { project: 'v', reference: 'cnt_ref', depth: 5 });
  assert.deepEqual([b.data.status, b.text.split('\n').slice(2)], ['bounded', ['WARNING:Verify - no difference in the first 5 clock cycle(s), but not proved beyond them (the induction did not succeed): a larger depth checks more cycles.',
    'Process "Verify Equivalence" completed successfully with 1 warning(s)']]);
  // test_bench false: the counterexample only
  await ok('delete_file', { project: 'v', path: 'sim/verify_cnt.vhd' });
  const n = await ok('verify', { project: 'v', reference: 'cnt_ref', test_bench: false });
  assert.deepEqual([n.data.testBench, n.data.replay], [null, []]);
  assert.ok(!(await P.readProject('v')).files.some(f => f.path === 'sim/verify_cnt.vhd'));
});

test('verify: the refusals', async () => {
  const r = await call('verify', { project: 'v', reference: 'nothing' });
  assert.deepEqual([r.isError, r.text], [true, ['Started : "Verify Equivalence".', 'ERROR:Verify - the reference \'nothing\' is not a module of the project', 'Process "Verify Equivalence" failed'].join('\n')]);
  assert.deepEqual(r.data.errors, ['the reference \'nothing\' is not a module of the project']);
  // a file of the user's where the test bench goes: left as it is
  await ok('write_file', { project: 'v', path: 'sim/verify_cnt.vhd', text: '-- mine\n' });
  const m = await call('verify', { project: 'v', reference: 'cnt_ref' });
  assert.deepEqual([m.isError, m.text], [true, 'verify: sim/verify_cnt.vhd exists and is not a test bench of Verify: rename it, or give test_bench false']);
  assert.equal(await P.readFile('v', 'sim/verify_cnt.vhd'), '-- mine\n');
  const none = await call('verify', { project: 'v' });
  assert.deepEqual([none.isError, none.text], [true, ['Started : "Verify Assertions".', 'ERROR:Verify - \'cnt\' has no assertion to prove (VHDL: assert … severity warning, error or failure; Verilog: assert (…) or assert property (@(posedge clk) …))', 'Process "Verify Assertions" failed'].join('\n')]);
  assert.equal((await call('verify', { project: 'nope', reference: 'x' })).text, 'verify: no project \'nope\' in the workspace');
});

test('verify with no reference: the module\'s assertions; one that fails replayed, its message; fixed: proved', async () => {
  await ok('new_project', { name: 'a' });
  const text = CNT.replace('    if rising_edge(clk) then\n', '    if rising_edge(clk) then\n      assert c /= 9 report "c reached 9" severity error;\n');
  await ok('write_file', { project: 'a', path: 'src/cnt.vhd', text });
  await ok('set_top', { project: 'a', top: 'cnt' });
  const r = await ok('verify', { project: 'a' });
  assert.equal(r.text, ['Started : "Verify Assertions".', 'Proving the 1 assertion(s) of \'cnt\': Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.',
    'ERROR:Verify - an assertion of \'cnt\' fails at clock cycle 10: src/cnt.vhd:8: c reached 9.',
    'The counterexample\'s test bench: sim/verify_cnt.vhd (it replays the 10 clock cycle(s) in the simulator).', 'Process "Verify Assertions" failed',
    'Simulation of verify_cnt:', '  c reached 9', '  VERIFY: 10 clock cycle(s) replayed'].join('\n'));
  assert.deepEqual([r.data.reference, r.data.status, r.data.cycle, r.data.failure, r.data.asserts, r.data.assumes, r.data.testBench, r.data.counterexample.length, r.data.warnings],
    [null, 'failed', 10, { file: 'src/cnt.vhd', line: 8, text: 'c reached 9' }, 1, 0, 'sim/verify_cnt.vhd', 10, []]);
  const s = await ok('simulate', { project: 'a', top: 'verify_cnt', time_ns: 1000, signals: ['q'] });
  assert.deepEqual(s.data.log.map(l => l.text), r.data.replay);
  // saturating at 9: proved
  await ok('write_file', { project: 'a', path: 'src/cnt.vhd', text: text.replace("elsif en = '1' then", "elsif en = '1' and c /= 9 then").replace('assert c /= 9 report "c reached 9"', 'assert c <= 9 report "c above 9"') });
  const p = await ok('verify', { project: 'a', module: 'cnt', depth: 8 });
  assert.deepEqual(p.data, { project: 'a', module: 'cnt', reference: null, status: 'proved', depth: 8, asserts: 1, assumes: 0, induction: 2, errors: [], warnings: [] });
  assert.equal(p.text.split('\n')[2], 'Proved: the assertions of \'cnt\' hold for every input sequence (by induction over 2 clock cycle(s)).');
});
