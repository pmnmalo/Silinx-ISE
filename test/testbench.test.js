// Test Bench Wizard generator (core/testbench.js): vectors, value parsing, and the generated VHDL /
// Verilog test benches run in the Silinx simulator: expected values filled in from a trace run
// pass, a wrong expected value fails with a report of the vector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { tbPorts, guessClockReset, parseValue, showValue, makeVectors, generateTestbench, expectedFromTrace, MAX_VECTORS } from '../core/testbench.js';

const ADDER_VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity adder is
  port (a, b : in std_logic_vector(2 downto 0); cin : in std_logic; s : out unsigned(2 downto 0); cout : out std_logic);
end adder;
architecture rtl of adder is
  signal t : unsigned(3 downto 0);
begin
  t <= resize(unsigned(a), 4) + resize(unsigned(b), 4) + ("000" & cin);
  s <= t(2 downto 0);
  cout <= t(3);
end rtl;`;
const ADDER_V = `module adder(input [2:0] a, input [2:0] b, input cin, output [2:0] s, output cout);
  assign {cout, s} = a + b + cin;
endmodule`;
const COUNTER_VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity counter is
  generic (W : integer := 4);
  port (clk, rst, en : in std_logic; q : out std_logic_vector(W - 1 downto 0); tc : out std_logic);
end counter;
architecture rtl of counter is
  signal c : unsigned(W - 1 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
  tc <= '1' when c = (W - 1 downto 0 => '1') else '0';
end rtl;`;
const COUNTER_V = `module counter #(parameter W = 4) (input clk, input rst, input en, output reg [W-1:0] q, output tc);
  always @(posedge clk) if (rst) q <= 0; else if (en) q <= q + 1;
  assign tc = &q;
endmodule`;

const types = { a: 'std_logic_vector(2 downto 0)', b: 'std_logic_vector(2 downto 0)', cin: 'std_logic', s: 'unsigned(2 downto 0)', cout: 'std_logic', q: 'std_logic_vector(W - 1 downto 0)' };
const portsOf = (src, lang, top) => tbPorts(elaborate(compile([{ path: `d.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: src }]), top), types);
const run = (dut, tb, top) => {
  const r = simulate([dut, tb], top, { until: 1e12 });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], tb.text);
  return r.sim.log.map(l => l.text);
};

test('values: binary, hex, decimal, negative, don\'t care; display', () => {
  assert.equal(parseValue('101', 4), '0101');
  assert.equal(parseValue('0x1F', 8), '00011111');
  assert.equal(parseValue('h1f', 5), '11111');
  assert.equal(parseValue('d12', 4), '1100');
  assert.equal(parseValue('-3', 4), '1101');
  assert.equal(parseValue('-000', 4), '-000', 'every bit given, with a don\'t care: binary (not -0)');
  assert.equal(parseValue('-1', 4), '1111');
  assert.equal(parseValue('-1', 2), '-1');
  assert.equal(parseValue('1-x0', 4), '1--0');
  assert.equal(parseValue('', 4), null);
  assert.throws(() => parseValue('d16', 4), /does not fit/);
  assert.throws(() => parseValue('12a', 4), /cannot read/);
  assert.equal(parseValue('12', 4), '1100');
  assert.equal(parseValue('10', 4), '0010');   // only 0s and 1s: binary
  assert.equal(showValue('0101', 4), '0101');
  assert.equal(showValue('1'.repeat(20), 20), '0xFFFFF');
});

test('ports, clock / reset guess, vectors (exhaustive, count, random, walking)', () => {
  const p = portsOf(ADDER_VHD, 'vhdl', 'adder');
  assert.deepEqual(p.map(x => `${x.name}:${x.dir}:${x.kind}:${x.width}`), ['a:in:slv:3', 'b:in:slv:3', 'cin:in:sl:1', 's:out:unsigned:3', 'cout:out:sl:1']);
  const c = portsOf(COUNTER_VHD, 'vhdl', 'counter');
  assert.deepEqual(guessClockReset(c), { clock: 'clk', reset: 'rst', resetActive: '1' });
  const ins = p.filter(x => x.dir === 'in');
  const ex = makeVectors(ins, { mode: 'exhaustive' });
  assert.equal(ex.length, 128);
  assert.deepEqual(ex[5].in, { a: '000', b: '010', cin: '1' });
  assert.equal(makeVectors(ins, { mode: 'count', count: 10 }).length, 10);
  const r1 = makeVectors(ins, { mode: 'random', count: 20, seed: 7 }), r2 = makeVectors(ins, { mode: 'random', count: 20, seed: 7 });
  assert.deepEqual(r1, r2);
  assert.equal(makeVectors(ins, { mode: 'walking' }).length, 2 + 2 * 7);
  assert.throws(() => makeVectors([{ name: 'x', width: 13 }], { mode: 'exhaustive' }), new RegExp(`more than ${MAX_VECTORS}`));
});

for (const lang of ['vhdl', 'verilog']) {
  test(`${lang}: combinational adder, all 128 cases: trace fills the expected values, the bench passes; a wrong value fails`, () => {
    const dut = { path: `adder.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: lang === 'vhdl' ? ADDER_VHD : ADDER_V };
    const ports = portsOf(dut.text, lang, 'adder');
    const outs = ports.filter(x => x.dir === 'out');
    let vectors = makeVectors(ports.filter(x => x.dir === 'in'), { mode: 'exhaustive' });
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    // 1. trace run: the outputs of the current design
    const tr = generateTestbench({ name: 'tb_adder', lang, uut: { name: 'adder', params: [] }, ports, vectors, trace: true });
    const exp = expectedFromTrace(run(dut, { path: `tb.${ext}`, lang, text: tr }, 'tb_adder'), outs, vectors.length);
    // they are the sums
    exp.forEach((e, k) => {
      const v = vectors[k].in, sum = parseInt(v.a, 2) + parseInt(v.b, 2) + +v.cin;
      assert.equal(parseInt(e.cout + e.s, 2), sum, `vector ${k}`);
    });
    vectors = vectors.map((v, k) => ({ ...v, exp: exp[k] }));
    // 2. the self-checking bench passes
    const tb = generateTestbench({ name: 'tb_adder', lang, uut: { name: 'adder', params: [] }, ports, vectors });
    const log = run(dut, { path: `tb.${ext}`, lang, text: tb }, 'tb_adder');
    assert.ok(log.some(l => /TEST PASSED: 128 vector/.test(l)), log.slice(-5).join('\n'));
    // 3. a wrong expected value (and a don't care elsewhere) fails with the vector in the report
    const bad = vectors.map((v, k) => (k === 9 ? { ...v, exp: { ...v.exp, s: v.exp.s === '111' ? '000' : '111' } } : k === 10 ? { ...v, exp: { s: '---', cout: '-' } } : v));
    const log2 = run(dut, { path: `tb.${ext}`, lang, text: generateTestbench({ name: 'tb_adder', lang, uut: { name: 'adder', params: [] }, ports, vectors: bad }) }, 'tb_adder');
    const v9 = vectors[9].in;
    assert.ok(log2.some(l => l.includes(`vector 9: a=${v9.a} b=${v9.b} cin=${v9.cin} -> expected`)), log2.join('\n'));
    assert.ok(log2.some(l => /TEST FAILED: 1 of 128/.test(l)), log2.slice(-3).join('\n'));
  });

  test(`${lang}: sequential counter with clock, reset and a generic: counts and terminal count are checked`, () => {
    const dut = { path: `counter.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: lang === 'vhdl' ? COUNTER_VHD : COUNTER_V };
    const ports = portsOf(dut.text, lang, 'counter');
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    // en = 1 for 18 cycles, then 0 for 2: q counts 1..15, 0, 1, 2 then holds
    const vectors = Array.from({ length: 20 }, (_, k) => {
      const q = k < 18 ? (k + 1) % 16 : 2;
      return { in: { en: k < 18 ? '1' : '0' }, exp: { q: q.toString(2).padStart(4, '0'), tc: q === 15 ? '1' : '0' } };
    });
    const opts = { name: 'tb_counter', lang, uut: { name: 'counter', params: [{ name: 'W', value: 4 }] }, ports, clock: { port: 'clk', periodNs: 20 }, reset: { port: 'rst', active: '1', cycles: 2 }, vectors };
    const log = run(dut, { path: `tb.${ext}`, lang, text: generateTestbench(opts) }, 'tb_counter');
    assert.ok(log.some(l => /TEST PASSED: 20 vector/.test(l)), log.join('\n'));
    const bad = vectors.map((v, k) => (k === 14 ? { ...v, exp: { ...v.exp, tc: '0' } } : v));
    const log2 = run(dut, { path: `tb.${ext}`, lang, text: generateTestbench({ ...opts, vectors: bad }) }, 'tb_counter');
    assert.ok(log2.some(l => /vector 14:.*en=1.*expected/.test(l)) && log2.some(l => /TEST FAILED: 1 of 20/.test(l)), log2.join('\n'));
  });
}

test('generator errors: bad names, no vectors, unsupported ports', () => {
  const ports = portsOf(ADDER_VHD, 'vhdl', 'adder');
  const v = [{ in: { a: '000', b: '000', cin: '0' } }];
  assert.throws(() => generateTestbench({ name: '1tb', uut: { name: 'adder' }, ports, vectors: v }), /invalid test bench name/);
  assert.throws(() => generateTestbench({ name: 'tb', uut: { name: 'adder' }, ports, vectors: [] }), /no vectors/);
  assert.throws(() => generateTestbench({ name: 'tb', uut: { name: 'adder' }, ports: [...ports, { name: 'io', dir: 'inout', width: 32, kind: 'int' }], vectors: v }), /bidirectional port\(s\) of a type/);
});
