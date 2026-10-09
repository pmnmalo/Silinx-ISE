// Verilog conformance: declarations, procedural statements and their scheduling, module
// hierarchy, generate, functions and tasks, system tasks, memories and the preprocessor
// (IEEE 1364-2005 §3–§12, §17, §19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out, sim, vinit, vlog } from './lang-util.js';

test('reg / wire / integer defaults: reg and integer start as x, an undriven wire is z', () => {
  const r = out(vinit(`#1 $display("%b %b %0d %b", r, w, i, t);`, `reg [3:0] r; wire [3:0] w; integer i; tri t;`));
  assert.deepEqual(r, ['xxxx zzzz x z']);
});

test('continuous assignments (assign, net declaration assignment) follow their operands', () => {
  const r = out(vinit(`
    a = 3; b = 4; #1 $display("%0d %0d", s, p);
    a = 10; #1 $display("%0d %0d", s, p);`,
  `reg [7:0] a, b; wire [7:0] s; wire [15:0] p = a * b; assign s = a + b;`));
  assert.deepEqual(r, ['7 12', '14 40']);
});

test('blocking vs non-blocking assignments: swap with <=, sequential update with =', () => {
  const r = out(vinit(`
    a = 1; b = 2;
    a <= b; b <= a; #1 $display("%0d %0d", a, b);
    a = b; b = a; #1 $display("%0d %0d", a, b);
    a <= 5; a <= 6; #1 $display("%0d", a);`,
  `integer a, b;`));
  // non-blocking assignments sample the right-hand sides first; the last one to a variable wins
  assert.deepEqual(r, ['2 1', '1 1', '6']);
});

test('non-blocking assignments to a shift register on a clock edge', () => {
  const r = out(vlog(`
  reg clk = 0; reg [3:0] q1 = 0, q2 = 0, q3 = 0; reg d = 1;
  always #5 clk = ~clk;
  always @(posedge clk) begin q1 <= {q1[2:0], d}; q2 <= q1; q3 <= q2; end
  initial begin #32 $display("%b %b %b", q1, q2, q3); $finish; end`));
  // edges at 5, 15, 25 ns
  assert.deepEqual(r, ['0111 0011 0001']);
});

test('delays: #d statement delay, intra-assignment delays a = #d b and a <= #d b, $time / $realtime', () => {
  const r = sim(vlog(`
  reg [7:0] a = 0, b = 0, c = 0;
  initial begin
    #2 a = 1;
    b = #3 a + 1;                // b at 5, sampled at 2
    c <= #4 b + 1;               // c at 9, sampled at 5
    $display("t=%0t a=%0d b=%0d", $time, a, b);
    #10 $display("t=%0d c=%0d", $time, c);
    $finish;
  end`));
  assert.deepEqual(r.out, ['t=5 a=1 b=2', 't=15 c=3']);
});

test('timescale: delays in the module time unit, rounded to the precision; $time in units', () => {
  const r = sim('`timescale 1ns / 100ps\n' + vlog(`
  initial begin #1.25 $display("%0t %0d %0.2f", $time, $time, $realtime); #2 $display("%0d", $time); $finish; end`));
  // 1.25 ns rounds to 1.3 ns (precision 100 ps); $time is an integer number of units
  assert.equal(r.r.status.now, 3300);
  assert.equal(r.out[1], '3');
});

test('event controls: @(a), @(posedge), @(negedge), @(a or b), @(a, b), @*, named events', () => {
  const r = sim(vlog(`
  reg a = 0, b = 0, clk = 0; event go;
  initial begin
    #1 a = 1; #1 b = 1; #1 clk = 1; #1 clk = 0; #1 -> go; #1 a = 0;
  end
  initial begin @(a); $display("%0t a", $time); end
  initial begin @(a or b); @(a, b); $display("%0t a|b twice", $time); end
  initial begin @(posedge clk); $display("%0t pos", $time); @(negedge clk); $display("%0t neg", $time); end
  initial begin @go; $display("%0t go", $time); end
  reg [1:0] y; always @* y = {a, b};
  initial begin #10 $display("y=%b", y); end`));
  // ($time counts the module's time unit: 1 ns without `timescale)
  assert.deepEqual(r.out, ['1 a', '2 a|b twice', '3 pos', '4 neg', '5 go', 'y=01']);
});

test('posedge / negedge on x and z transitions (0->x and x->1 are posedges)', () => {
  const r = out(vlog(`
  reg c = 0; integer np = 0, nn = 0;
  always @(posedge c) np = np + 1;
  always @(negedge c) nn = nn + 1;
  initial begin #1 c = 1'bx; #1 c = 1; #1 c = 1'bz; #1 c = 0; #1 $display("%0d %0d", np, nn); end`));
  // 0->x pos, x->1 pos, 1->z neg, z->0 neg
  assert.deepEqual(r, ['2 2']);
});

test('wait (level-sensitive) statements', () => {
  const r = sim(vlog(`
  reg ready = 0;
  initial begin #7 ready = 1; end
  initial begin wait (ready) $display("%0t ready", $time); wait (ready) $display("%0t again", $time); end`));
  assert.deepEqual(r.out, ['7 ready', '7 again']);
});

test('if / else (x condition takes else), case / casez / casex with default, case with expressions', () => {
  const r = out(vinit(`
    x = 1'bx; if (x) $display("then"); else $display("else");
    for (i = 0; i < 4; i = i + 1)
      case (i)
        0, 1: $display("0|1");
        2: $display("2");
        default: $display("def");
      endcase
    v = 4'b1x0z;
    casez (v) 4'b1?0?: $display("casez hit"); default: $display("casez miss"); endcase
    casex (v) 4'b1100: $display("casex hit"); default: $display("casex miss"); endcase
    case (v) 4'b1x0z: $display("case exact"); default: $display("case miss"); endcase
    case (1'b1) v[3]: $display("v3"); v[1]: $display("v1"); endcase`,
  `reg x; integer i; reg [3:0] v;`));
  assert.deepEqual(r, ['else', '0|1', '0|1', '2', 'def', 'casez hit', 'casex hit', 'case exact', 'v3']);
});

test('loops: for, while, repeat, forever with disable; loop variable after the loop', () => {
  const r = out(vlog(`
  integer i, n, s;
  initial begin
    s = 0; for (i = 0; i < 5; i = i + 1) s = s + i; $display("%0d %0d", s, i);
    n = 0; while (n < 3) n = n + 1; $display("%0d", n);
    s = 0; repeat (4) s = s + 2; $display("%0d", s);
    n = 0;
    begin : blk
      forever begin n = n + 1; if (n == 7) disable blk; #1; end
    end
    $display("%0d %0t", n, $time);
    $finish;
  end`));
  assert.deepEqual(r, ['10 5', '3', '8', '7 6']);
});

test('functions: automatic recursive, functions calling functions, integer and vector return types, constant functions', () => {
  const r = out(vlog(`
  function automatic integer fact(input integer n); fact = n <= 1 ? 1 : n * fact(n - 1); endfunction
  function [7:0] rev(input [7:0] x); integer k; begin for (k = 0; k < 8; k = k + 1) rev[k] = x[7 - k]; end endfunction
  function integer clog2(input integer v); begin clog2 = 0; while ((1 << clog2) < v) clog2 = clog2 + 1; end endfunction
  localparam W = clog2(100);
  reg [W-1:0] r;
  initial begin
    $display("%0d %b %0d %0d", fact(10), rev(8'b0000_0011), W, $bits(r));
    $display("%h", rev(rev(8'hA7)));
  end`));
  assert.deepEqual(r, ['3628800 11000000 7 7', 'a7']);
});

test('tasks: input / output / inout arguments, timing inside tasks, automatic tasks', () => {
  const r = sim(vlog(`
  reg [7:0] a; integer q, rr, acc = 1;
  task divmod(input integer x, y, output integer qq, r2); begin qq = x / y; r2 = x % y; end endtask
  task dbl(inout integer v); v = v * 2; endtask
  task pulse(output reg [7:0] o, input integer d); begin o = 8'hFF; #d o = 8'h00; end endtask
  initial begin
    divmod(17, 5, q, rr); dbl(acc); dbl(acc);
    $display("%0d %0d %0d", q, rr, acc);
    pulse(a, 3); $display("%0t %h", $time, a);
  end`));
  // outputs are copied back when the task returns
  assert.deepEqual(r.out, ['3 2 4', '3 00']);
});

test('module hierarchy: named and positional port connections, parameters (#(), defparam), localparam, unconnected outputs', () => {
  const r = out(`
module add #(parameter W = 4, parameter K = 0) (input [W-1:0] a, b, output [W:0] s);
  localparam L = K + 1;
  assign s = a + b + L - 1;
endmodule
module tb;
  reg [7:0] a = 200, b = 100; wire [8:0] s; wire [4:0] t, u;
  add #(.W(8), .K(2)) u1 (.a(a), .b(b), .s(s));
  add u2 (4'd9, 4'd9, t);
  add #(4, 5) u3 (.a(4'd1), .b(4'd1), .s(u));
  add u4 (.a(4'd1), .b(4'd1), .s());
  defparam u2.K = 1;
  initial #1 $display("%0d %0d %0d", s, t, u);
endmodule`);
  assert.deepEqual(r, ['302 19 7']);
});

test('ANSI and non-ANSI port declarations, inout ports, port expressions', () => {
  const r = out(`
module m1(a, y); input [3:0] a; output [3:0] y; reg [3:0] y; always @* y = ~a; endmodule
module m2(input wire [1:0] a, output reg y); always @* y = ^a; endmodule
module tb; reg [3:0] a = 4'b0101; wire [3:0] y; wire z;
  m1 u1(.a(a), .y(y)); m2 u2(.a(a[1:0]), .y(z));
  initial #1 $display("%b %b", y, z);
endmodule`);
  assert.deepEqual(r, ['1010 1']);
});

test('generate: for loops with genvar (named blocks, hierarchical names), if / case generate', () => {
  const r = out(`
module tb;
  parameter MODE = 2;
  wire [3:0] g; reg [3:0] a = 4'b1010; wire y;
  genvar i;
  generate
    for (i = 0; i < 4; i = i + 1) begin : bit_
      wire t;
      assign t = ~a[i];
      assign g[i] = t;
    end
  endgenerate
  generate
    if (MODE == 1) begin : m1 assign y = 1; end
    else begin : m2 assign y = 0; end
  endgenerate
  wire [1:0] z;
  generate case (MODE) 1: assign z = 2'd1; 2: assign z = 2'd2; default: assign z = 2'd3; endcase endgenerate
  initial #1 $display("%b %b %0d %b", g, y, z, bit_[2].t);
endmodule`);
  assert.deepEqual(r, ['0101 0 2 1']);
});

test('memories: declaration, element read/write, bit-select of an element, $readmemh / $readmemb with addresses and comments', () => {
  const r = sim({ 't.v': vlog(`
  reg [7:0] mem [0:7]; reg [3:0] mb [0:3]; integer i;
  initial begin
    $readmemh("data.hex", mem);
    $readmemb("data.bin", mb);
    $display("%h %h %h %h %h", mem[0], mem[1], mem[4], mem[5], mem[7]);
    $display("%b %b", mb[3], mb[0]);
    mem[2] = 8'h5A; mem[2][0] = 1'b1; $display("%h %b", mem[2], mem[2][7:4]);
    i = 9; $display("%h", mem[i]);
  end`),
  'data.hex': '// comment\n11 22\n@4 44 55 /* block */\n66 77\n',
  'data.bin': '1010\n0101\n1111 0000\n' }).out;
  // out-of-range memory reads give x
  assert.deepEqual(r, ['11 22 44 55 77', '0000 1010', '5b 0101', 'xx']);
});

test('$display formats: %d %b %o %h %x %c %s %t %m %e %f %g, widths, %0d, %%, escapes', () => {
  const r = out(vinit(`
    $display("[%d] [%0d] [%5d] [%b] [%o] [%h] [%x] [%c]", v, v, v, v, v, v, v, 8'd65);
    $display("[%e] [%f] [%0.3f] [%s] [%%] [%m]", 1.5, 1.5, 3.14159, "str");
    $display("a\\tb\\\\c");
    $write("no newline "); $write("then"); $display("");
    $display("%0d", sv);`,
  `reg [7:0] v = 8'd45; reg signed [7:0] sv = -3;`));
  assert.deepEqual(r, [
    '[ 45] [45] [   45] [00101101] [055] [2d] [2d] [A]',
    '[1.500000e+00] [1.500000] [3.142] [str] [%] [tb]',
    'a\tb\\c',
    'no newline then',
    '-3',
  ]);
});

test('$monitor prints when an argument changes (at the end of the time step); $strobe after the updates', () => {
  const r = sim(vlog(`
  reg [3:0] a = 0;
  initial begin
    $monitor("%0t a=%0d", $time, a);
    #1 a = 1; a = 2;
    #1 a = 2;
    #1 a <= 3; $strobe("strobe %0d", a); $display("display %0d", a);
    #1 $finish;
  end`));
  assert.deepEqual(r.out, ['0 a=0', '1 a=2', 'display 2', 'strobe 3', '3 a=3']);
});

test('$finish / $stop end the simulation; $random is repeatable with a seed; $time inside functions', () => {
  const r = sim(vlog(`
  integer s1 = 7, s2 = 7, a, b;
  initial begin
    a = $random(s1); b = $random(s2);
    $display("%0d", a == b);
    #5 $finish;
    $display("never");
  end
  initial #10 $display("never 2");`));
  assert.deepEqual(r.out, ['1']);
  assert.equal(r.r.status.now, 5000);
});

test('fork / join: parallel branches with delays; the block ends when the last branch ends', () => {
  const r = sim(vlog(`
  initial begin
    fork
      #3 $display("%0t b1", $time);
      #1 $display("%0t b2", $time);
      begin #2 $display("%0t b3", $time); #2 $display("%0t b3'", $time); end
    join
    $display("%0t joined", $time);
  end`));
  assert.deepEqual(r.out, ['1 b2', '2 b3', '3 b1', "4 b3'", '4 joined']);
});

test('wires with several drivers: tri-state buffers resolve; wand / wor', () => {
  const r = out(vlog(`
  reg en1 = 0, en2 = 0; reg [3:0] d1 = 4'h3, d2 = 4'hC;
  wire [3:0] bus;
  assign bus = en1 ? d1 : 4'bz;
  assign bus = en2 ? d2 : 4'bz;
  initial begin
    #1 $display("%b", bus);
    en1 = 1; #1 $display("%b", bus);
    en2 = 1; #1 $display("%b", bus);
    en1 = 0; #1 $display("%b", bus);
  end`));
  assert.deepEqual(r, ['zzzz', '0011', 'xxxx', '1100']);
});

test('wand / wor nets resolve with and / or; tri0 / tri1 pull an undriven net', () => {
  const r = out(vlog(`
  wand a; wor o; tri0 p0; tri1 p1; tri1 q; reg x = 1, y = 0, e = 0;
  assign a = x; assign a = y; assign o = x; assign o = y;
  assign p0 = e ? 1'b1 : 1'bz; assign q = e ? 1'b0 : 1'bz;
  initial begin #1 $display("%b %b %b %b %b", a, o, p0, p1, q); e = 1; #1 $display("%b %b", p0, q); end`));
  assert.deepEqual(r, ['0 1 0 1 1', '1 0']);
});

test('gate primitives and buf / not / bufif with delays', () => {
  const r = out(vlog(`
  reg a = 1, b = 0, en = 1; wire y1, y2, y3, y4, y5;
  and g1(y1, a, b); or g2(y2, a, b); xor g3(y3, a, b); nand #2 g4(y4, a, a); bufif1 g5(y5, a, en);
  initial begin #1 $display("%b %b %b %b %b", y1, y2, y3, y4, y5); #2 $display("%b", y4); en = 0; #1 $display("%b", y5); end`));
  assert.deepEqual(r, ['0 1 1 x 1', '0', 'z']);
});

test('preprocessor: `define with and without arguments, `ifdef / `ifndef / `elsif / `else, `undef, `include', () => {
  const r = out({
    'defs.vh': '`define WIDTH 8\n`define MAX(a, b) ((a) > (b) ? (a) : (b))\n',
    't.v': `\`include "defs.vh"
\`define DEBUG
module tb;
  reg [\`WIDTH-1:0] r = 8'hFF;
  initial begin
    $display("%0d %0d", $bits(r), \`MAX(3, 9));
\`ifdef DEBUG
    $display("debug");
\`else
    $display("release");
\`endif
\`undef DEBUG
\`ifndef DEBUG
    $display("no debug");
\`elsif OTHER
    $display("other");
\`endif
  end
endmodule` });
  assert.deepEqual(r, ['8 9', 'debug', 'no debug']);
});

test('hierarchical references to signals in child instances', () => {
  const r = out(`
module child; reg [3:0] secret = 4'd9; endmodule
module tb; child c1(); initial #1 $display("%0d", c1.secret); endmodule`);
  assert.deepEqual(r, ['9']);
});

test('named blocks with local variables; disable of a named block', () => {
  const r = out(vinit(`
    begin : outer
      integer k;
      for (k = 0; k < 10; k = k + 1) begin
        if (k == 3) disable outer;
        $display("k=%0d", k);
      end
    end
    $display("after");`));
  assert.deepEqual(r, ['k=0', 'k=1', 'k=2', 'after']);
});

test('VHDL and Verilog agree: a 4-bit counter with synchronous reset and enable', () => {
  const vl = out(`
module cnt(input clk, rst, en, output reg [3:0] q);
  always @(posedge clk) if (rst) q <= 0; else if (en) q <= q + 1;
endmodule
module tb; reg clk = 0, rst = 1, en = 1; wire [3:0] q;
  cnt u(clk, rst, en, q);
  always #5 clk = ~clk;
  initial begin #12 rst = 0; #100 $display("%0d", q); en = 0; #20 $display("%0d", q); #50 $finish; end
endmodule`);
  const vh = out(`library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is port (clk, rst, en : in std_logic; q : out unsigned(3 downto 0)); end;
architecture rtl of cnt is signal c : unsigned(3 downto 0); begin
  process(clk) begin if rising_edge(clk) then if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if; end if; end process;
  q <= c;
end;
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture sim of tb is signal clk : std_logic := '0'; signal rst, en : std_logic := '1'; signal q : unsigned(3 downto 0); begin
  u : entity work.cnt port map (clk, rst, en, q);
  clk <= not clk after 5 ns when now < 200 ns;
  process begin wait for 12 ns; rst <= '0'; wait for 100 ns; report integer'image(to_integer(q)); en <= '0'; wait for 20 ns; report integer'image(to_integer(q)); wait; end process;
end;`);
  // 10 rising edges (15 .. 105 ns) after the reset is released, none counted once en is 0
  assert.deepEqual(vl, ['10', '10']);
  assert.deepEqual(vh, vl);
});
