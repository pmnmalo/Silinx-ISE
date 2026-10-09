// RTL schematic extraction (core/schematic.js): HDL -> graph of symbols and nets. Equivalent VHDL
// and Verilog designs give the same graph; every edge joins existing ports; clocks, resets,
// constants, selections, instances and process blocks are recognised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { buildSchematic, buildSymbol, clocksOf, processTitle } from '../core/schematic.js';

function design(files, top, allow = /^$/) {
  const lib = compile(Object.entries(files).map(([path, text]) => ({ path, text })));
  const d = elaborate(lib, top);
  assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error' && !allow.test(x.message)).map(x => x.message), []);
  return d;
}
function graph(files, top, allow) {
  const d = design(files, top, allow);
  const g = buildSchematic(d.top);
  // well-formed: unique ids, every edge joins two existing ports
  assert.equal(new Set(g.nodes.map(n => n.id)).size, g.nodes.length);
  for (const e of g.edges) {
    for (const end of [e.from, e.to]) {
      const n = g.nodes.find(x => x.id === end.node);
      assert.ok(n && n.ports.some(p => p.id === end.port), `edge ${e.id} end ${end.node}.${end.port}`);
    }
  }
  return { g, d };
}
const gates = g => g.nodes.filter(n => n.kind === 'gate').map(n => n.gate).sort();
const kinds = g => g.nodes.map(n => n.kind).sort();

test('equivalent VHDL and Verilog combinational logic give the same gates', () => {
  const vl = graph({ 'm.v': `module m(input [3:0] a, b, input s, input [1:0] k, output [3:0] y, output z, output [7:0] w, output [3:0] r);
  assign y = s ? (a + b) : (a - b);
  assign z = (a == b) | (a < b);
  assign w = {a, b};
  assign r = a << k;
endmodule` }, 'm').g;
  const vh = graph({ 'm.vhd': `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity m is port (a, b : in unsigned(3 downto 0); s : in std_logic; k : in unsigned(1 downto 0); y : out unsigned(3 downto 0); z : out boolean; w : out unsigned(7 downto 0); r : out unsigned(3 downto 0)); end;
architecture rtl of m is begin
  y <= a + b when s = '1' else a - b;
  z <= (a = b) or (a < b);
  w <= a & b;
  r <= a sll to_integer(k);
end;` }, 'm').g;
  assert.deepEqual(gates(vl), ['add', 'concat', 'eq', 'lt', 'mux', 'or', 'shl', 'sub']);
  // (VHDL: the condition s = '1' is an extra comparator, to_integer() is a conversion)
  assert.deepEqual(gates(vh).filter(x => x !== 'eq' && x !== 'fn'), gates(vl).filter(x => x !== 'eq'));
  assert.equal(vl.nodes.filter(n => n.kind === 'in').length, 4);
  assert.equal(vh.nodes.filter(n => n.kind === 'out').length, 4);
});

test('unary operators, reductions, replication, selections and constants', () => {
  const { g } = graph({ 'm.v': `module m(input [7:0] a, input [2:0] i, output y1, output [7:0] y2, output y3, output [3:0] y4, output [7:0] y5, output y6, output [15:0] y7);
  assign y1 = ^a;
  assign y2 = -a;
  assign y3 = a[i];
  assign y4 = a[7:4];
  assign y5 = 8'hA5;
  assign y6 = !a[0];
  assign y7 = {2{a}};
endmodule` }, 'm');
  assert.deepEqual(gates(g), ['buf', 'concat', 'neg', 'not', 'select', 'xor']);
  assert.ok(g.nodes.some(n => n.kind === 'const' && n.label === '0xA5'));
  assert.ok(g.edges.some(e => e.label === 'a[7:4]'));
  assert.ok(g.edges.some(e => e.label === 'a[0]'));
  assert.ok(g.nodes.some(n => n.gate === 'concat' && n.label === '{2{}}'));
});

test('constants of every kind are labelled: enumeration, integer, boolean, small vectors', () => {
  const { g } = graph({ 'm.vhd': `library ieee; use ieee.std_logic_1164.all;
entity m is port (y : out std_logic_vector(2 downto 0); n : out integer; b : out boolean; e : out std_logic); end;
architecture rtl of m is
  type st is (idle, run); signal s : st;
begin
  y <= "101"; n <= 42; b <= true; s <= run; e <= '1' when s = run else '0';
end;` }, 'm');
  const labels = g.nodes.filter(n => n.kind === 'const').map(n => n.label).sort();
  for (const l of ["'101'", '42', 'true', 'run', "'1'", "'0'"]) assert.ok(labels.includes(l), `${l} in ${labels}`);
});

test('clocked processes become registers with clock and asynchronous reset pins (Verilog and VHDL)', () => {
  const vl = design({ 'r.v': `module r(input clk, rst, d, output reg q, output reg q2);
  always @(posedge clk or posedge rst) if (rst) q <= 0; else q <= d;
  always @(negedge clk) q2 <= d;
endmodule` }, 'r');
  const [p1, p2] = vl.top.procs.filter(p => p.kind === 'process');
  assert.deepEqual([...clocksOf(p1).clocks].map(s => s.name), ['clk']);
  assert.deepEqual([...clocksOf(p1).resets].map(s => s.name), ['rst']);
  assert.equal(processTitle(p1), 'always @(posedge clk, posedge rst)');
  assert.equal(processTitle(p2), 'always @(negedge clk)');
  const g = buildSchematic(vl.top);
  const regs = g.nodes.filter(n => n.kind === 'reg');
  assert.equal(regs.length, 2);
  assert.ok(regs[0].ports.some(p => p.clock && p.label === 'clk') && regs[0].ports.some(p => p.reset && p.label === 'rst'));
  const vh = design({ 'r.vhd': `library ieee; use ieee.std_logic_1164.all;
entity r is port (clk, rst, d : in std_logic; q : out std_logic); end;
architecture a of r is begin
  process (clk, rst) begin if rst = '1' then q <= '0'; elsif rising_edge(clk) then q <= d; end if; end process;
  c : process (all) begin end process;
  process begin wait; end process;
end;` }, 'r');
  const ps = vh.top.procs.filter(p => p.kind === 'process');
  assert.deepEqual([...clocksOf(ps[0]).resets].map(s => s.name), ['rst']);
  assert.equal(processTitle(ps[0]), 'process(clk, rst)');
  assert.equal(processTitle(ps[1]), 'process(all)');
  assert.equal(processTitle(ps[2]), 'process');
  const gv = buildSchematic(vh.top);
  assert.deepEqual(kinds(gv).filter(k => k === 'reg' || k === 'comb' || k === 'tb'), ['comb', 'reg', 'tb']);
});

test('combinational always blocks and initial blocks; Verilog process titles', () => {
  const d = design({ 'c.v': `module c(input [1:0] s, input a, b, output reg y);
  always @* case (s) 0: y = a; 1: y = b; default: y = 0; endcase
  always @(a or b) ;
  always #5 ;
  initial y = 0;
endmodule` }, 'c');
  const ps = d.top.procs.filter(p => p.kind === 'process');
  assert.deepEqual(ps.map(processTitle), ['always @*', 'always @(a, b)', 'always', 'initial']);
  const g = buildSchematic(d.top);
  assert.ok(g.nodes.some(n => n.kind === 'comb' && n.ports.some(p => p.label === 's')));
  assert.ok(g.nodes.some(n => n.kind === 'tb'));
});

test('child instances: parameters, constant and expression connections, unconnected and black-box instances, inout pads', () => {
  const { g } = graph({ 'h.v': `module leaf #(parameter W = 4) (input [W-1:0] a, input en, output [W-1:0] y, inout io); assign y = en ? a : 0; endmodule
module h(input [3:0] a, b, inout pad, output [3:0] y1, y2, y3, output z);
  leaf #(.W(4)) u1 (.a(a), .en(1'b1), .y(y1), .io(pad));
  leaf u2 (.a(a & b), .en(b[0]), .y(y2), .io());
  leaf u3 (.a(a[3:0]), .en(b[1]), .y(y3));
  mystery u4 (.x(a), .z(z));
  assign pad = z ? 1'b0 : 1'bz;
endmodule` }, 'h', /'mystery' not found/);
  const insts = g.nodes.filter(n => n.kind === 'inst');
  assert.deepEqual(insts.map(n => n.label), ['u1', 'u2', 'u3']);
  assert.deepEqual(insts[0].params, ['W=4']);
  assert.ok(insts.every(n => n.sub === 'leaf'));
  assert.ok(g.nodes.some(n => n.kind === 'blackbox' && n.label === 'u4'));
  assert.ok(g.nodes.some(n => n.kind === 'const' && n.label === "'1'"));
  assert.ok(g.nodes.some(n => n.kind === 'gate' && n.gate === 'and'));
  assert.ok(g.nodes.some(n => n.kind === 'inout' && n.label === 'pad'));
});

test('partial drivers of a vector are merged by a bus joiner; undriven nets get a net label', () => {
  const { g } = graph({ 'p.v': `module p(input [1:0] a, output [1:0] y, output z);
  wire floating;
  assign y[0] = a[1];
  assign y[1] = a[0];
  assign z = floating;
endmodule` }, 'p');
  const j = g.nodes.find(n => n.gate === 'concat' && n.label === 'y');
  assert.ok(j);
  assert.equal(g.edges.filter(e => e.to.node === j.id).length, 2);
  assert.ok(g.nodes.some(n => n.kind === 'netlabel' && n.label === 'floating'));
});

test('function calls and edge functions become function boxes; very large expressions become logic blocks', () => {
  const { g } = graph({ 'f.vhd': `library ieee; use ieee.std_logic_1164.all;
entity f is port (a, b, clk : in std_logic; y, e : out std_logic; big : out std_logic); end;
architecture rtl of f is
  function inv(x : std_logic) return std_logic is begin return not x; end function;
begin
  y <= inv(a);
  e <= '1' when rising_edge(clk) else '0';
  big <= a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a xor b xor a;
end;` }, 'f');
  assert.ok(g.nodes.some(n => n.gate === 'fn' && n.label === 'inv()'));
  assert.ok(g.nodes.some(n => n.gate === 'fn' && n.label === 'rising_edge'));
  assert.ok(g.nodes.some(n => n.kind === 'comb' && n.label === 'assign'));
});

test('buildSymbol lists inputs, outputs and parameters', () => {
  const d = design({ 's.v': 'module s #(parameter N = 3, parameter [7:0] V = 8\'h0F) (input [N-1:0] a, inout b, output y); assign y = &a; endmodule' }, 's');
  assert.deepEqual(buildSymbol(d.top), {
    module: 's',
    inputs: [{ name: 'a', w: 3, dir: 'in' }, { name: 'b', w: 1, dir: 'inout' }],
    outputs: [{ name: 'y', w: 1, dir: 'out' }],
    params: ['N=3', 'V=0xF'],
  });
});
