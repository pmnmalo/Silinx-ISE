// Sequential ifs read back as an ASM chart (#3582): a state's statements became one tree, each `if` copied into both
// branches of the one before, so n of them made about 3 x 2^n boxes (16: 24573 boxes, 3.2 s; 30 did not fit in
// memory). The statements after an `if` are now one subtree shared by its branches (core/asm-trees.js), every walk of
// the trees takes a shared subtree once, and a state's tree past 1024 boxes written out is drawn with the branches
// meeting again at the box after them; the layout visits each box of a block once. A state with more than 256
// decisions on a path is refused with its message. The charts read are validated, then simulated cycle by cycle against
// the HDL they were read from, in VHDL and in Verilog: the chain of decisions Silinx generates, and sequential ifs
// written by hand.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { asmFromHdl } from '../core/asm-from-hdl.js';
import { generate, validate } from '../core/asm.js';
import { simulateAsm } from '../core/asm-sim.js';
import { randomVectors, runHdl } from './fsm-sim.js';
import { scratchEnv } from './server-helpers.js';

/** The chart of a chain of n decisions (test/asm-chain.test.js's): decision i tests a[i % 4], its 1 branch y = i % 256, its
 * 0 branch z = i % 2, both meet at decision i + 1; the last goes to B (1) or back to A (0). */
function chain(n, lang) {
  const nodes = [{ id: 'sA', type: 'state', name: 'A', actions: [] }, { id: 'sB', type: 'state', name: 'B', actions: ['w = 1'] }];
  const edges = [{ from: 'sA', to: 'd0' }, { from: 'sB', to: 'sA' }];
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? `d${i + 1}` : null;
    nodes.push({ id: `d${i}`, type: 'decision', cond: `a[${i % 4}]` }, { id: `t${i}`, type: 'output', actions: [`y = ${i % 256}`] },
      { id: `f${i}`, type: 'output', actions: [`z = ${i % 2}`] });
    edges.push({ from: `d${i}`, to: `t${i}`, port: 'true' }, { from: `t${i}`, to: next ?? 'sB' }, { from: `d${i}`, to: `f${i}`, port: 'false' },
      { from: `f${i}`, to: next ?? 'sA' });
  }
  return {
    version: 1, name: 'chain', lang, clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'binary',
    inputs: [{ name: 'a', width: 4 }],
    outputs: [{ name: 'y', width: 8, default: '0' }, { name: 'z', width: 1, default: '0' }, { name: 'w', width: 1, default: '0' }],
    nodes, edges, initial: 'sA'
  };
}
const headerless = code => code.split('\n').filter(l => !/^\s*(--|\/\/)/.test(l)).join('\n');
const hex = v => v.toString(16).padStart(2, '0');

/** n sequential ifs written by hand, in state A of a two-state machine (the next state set by the last one). */
function handWritten(n, lang) {
  const ifs = Array.from({ length: n }, (_, i) => (lang === 'vhdl'
    ? `        if a(${i % 4}) = '1' then y <= x"${hex(i % 256)}"; else z <= '${i % 2}'; end if;`
    : `        if (a[${i % 4}]) y = 8'h${hex(i % 256)}; else z = 1'b${i % 2};`));
  if (lang === 'vhdl') {
    return `library ieee;
use ieee.std_logic_1164.all;

entity seq is
  port (clk, rst : in std_logic; a : in std_logic_vector(3 downto 0); y : out std_logic_vector(7 downto 0); z, w : out std_logic);
end seq;

architecture rtl of seq is
  type state_t is (A_S, B_S);
  signal state, nxt : state_t;
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then state <= A_S; else state <= nxt; end if;
    end if;
  end process;
  process (state, a) begin
    nxt <= state; y <= x"00"; z <= '0'; w <= '0';
    case state is
      when A_S =>
${ifs.join('\n')}
        if a(3) = '1' and a(0) = '1' then nxt <= B_S; end if;
      when B_S =>
        w <= '1'; nxt <= A_S;
    end case;
  end process;
end rtl;
`;
  }
  return `module seq (input clk, input rst, input [3:0] a, output reg [7:0] y, output reg z, output reg w);
  localparam A_S = 1'b0, B_S = 1'b1;
  reg state, nxt;
  always @(posedge clk) if (rst) state <= A_S; else state <= nxt;
  always @(*) begin
    nxt = state; y = 8'h00; z = 1'b0; w = 1'b0;
    case (state)
      A_S: begin
${ifs.join('\n')}
        if (a[3] && a[0]) nxt = B_S;
      end
      B_S: begin w = 1'b1; nxt = A_S; end
    endcase
  end
endmodule
`;
}
const SEQ = { name: 'seq', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, inputs: [{ name: 'a', width: 4 }],
  outputs: [{ name: 'y', width: 8 }, { name: 'z', width: 1 }, { name: 'w', width: 1 }] };

// the chart's outputs per cycle, as runHdl prints them
const chartRun = (model, vectors) => simulateAsm(model, vectors).map(row => model.outputs.map(o => row.outputs[o.name].toString(2).padStart(o.width, '0')).join('_'));
const timed = (f) => { const t = performance.now(); const r = f(); return { r, ms: performance.now() - t }; };
// the chart read: validated with no errors and no warnings, its HDL simulated in both languages, and the chart itself, as
// the source
function same(model, source, lang, io, vectors) {
  assert.deepEqual(validate(model), []);
  const want = runHdl(source, lang, io, vectors);
  assert.equal(want.length, vectors.length);
  assert.ok(new Set(want).size > 3, 'the outputs change');
  assert.deepEqual(chartRun(model, vectors), want, 'the chart');
  for (const l of ['vhdl', 'verilog']) assert.deepEqual(runHdl(generate({ ...model, lang: l }, l).code, l, model, vectors), want, l);
}

test('#3582 a chain of 8 decisions (a small tree): read as before, every path\'s boxes apart', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const { model } = asmFromHdl(generate(chain(8, lang), lang).code, { lang });
    assert.equal(model.nodes.length, 383, lang);
    assert.equal(model.edges.filter(e => e.to === 'd3').length, 1, 'no box reached twice');
  }
});

for (const n of [16, 30, 200]) {
  test(`#3582 a chain of ${n} decisions generated by Silinx, read back in a bounded time, its branches meeting again; simulated as its HDL`, { timeout: 120000 }, () => {
    for (const lang of ['vhdl', 'verilog']) {
      for (const code of [generate(chain(n, lang), lang).code, headerless(generate(chain(n, lang), lang).code)]) {
        const { r: { model, warnings }, ms } = timed(() => asmFromHdl(code, { lang }));
        assert.ok(ms < 20000, `${lang}: ${Math.round(ms)} ms`);
        assert.ok(model.nodes.length < 6 * n, `${lang}: ${model.nodes.length} boxes`);
        assert.deepEqual(warnings, code.includes('--') || code.includes('//')
          ? ['the file was changed by hand after it was generated: regenerating it from the chart will rewrite it in the generator style'] : []);
        same(model, code, lang, chain(n, lang), randomVectors(chain(n, lang), n <= 30 ? 60 : 20, n));
      }
    }
  });
}

for (const n of [30, 200]) {
  test(`#3582 ${n} sequential ifs written by hand, in VHDL and in Verilog: read in a bounded time, simulated as the HDL`, { timeout: 120000 }, () => {
    for (const lang of ['vhdl', 'verilog']) {
      const code = handWritten(n, lang);
      const { r: { model, warnings }, ms } = timed(() => asmFromHdl(code, { lang }));
      assert.ok(ms < 20000, `${lang}: ${Math.round(ms)} ms`);
      assert.deepEqual(warnings, []);
      // a decision and its two output boxes per if, the last if's decisions, the states
      assert.ok(model.nodes.length < 4 * n, `${lang}: ${model.nodes.length} boxes`);
      same(model, code, lang, SEQ, randomVectors(SEQ, 40, n + 1));
    }
  });
}

test('#3582 a state with more than 256 decisions on a path: refused with its message, not a stack overflow', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const code = handWritten(256, lang);
    // (the 257th decision: the if that sets the next state, after the 256 sequential ones)
    const line = code.split('\n').findIndex(l => l.includes(lang === 'vhdl' ? "if a(3) = '1' and a(0) = '1'" : 'if (a[3] && a[0])')) + 1;
    assert.throws(() => asmFromHdl(code, { lang }), (e) => {
      assert.equal(e.message, `if statement at line ${line}: more than 256 decisions on a path of a state (if and case statements one after the other or nested), too many for a chart`);
      return true;
    });
    assert.doesNotThrow(() => asmFromHdl(handWritten(255, lang), { lang }));
  }
});

// the MCP server: convert_module to an ASM chart of 30 sequential ifs
let tmp;
before(async () => { tmp = await scratchEnv('silinx-seq-ifs-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
let id = 0;
async function ok(name, args) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  assert.equal(r.isError, false, r.content[0].text);
  return { text: r.content[0].text, data: r.structuredContent };
}

test('#3582 MCP: convert_module of 30 sequential ifs to an ASM chart, checked with no errors', async () => {
  await ok('new_project', { name: 'q' });
  await ok('write_file', { project: 'q', path: 'src/seq.vhd', text: handWritten(30, 'vhdl') });
  await ok('set_top', { project: 'q', top: 'seq' });
  const t = performance.now();
  assert.equal((await ok('convert_module', { project: 'q', module: 'seq', to: 'asm' })).text, '\'seq\' converted to the ASM chart src/seq.asm.json; it stays in sync with src/seq.vhd.');
  assert.ok(performance.now() - t < 20000);
  const c = await ok('check_drawing', { project: 'q', file: 'src/seq.asm.json' });
  assert.deepEqual([c.text, c.data.errors, c.data.warnings], ['Process "Validate" of seq.asm.json completed successfully.', [], []]);
});
