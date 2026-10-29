// Regression tests of the Silinx bugs found by the design corpus (test/designs-corpus/README.md):
// each one reduced from a real open-source design to a few lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { diffSynth } from './diff-synth.js';

const run = (sources, top, until = 1e6) => {
  const r = simulate(sources, top, { until });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), []);
  return r;
};
const prints = r => r.sim.log.filter(e => e.kind === 'print' || e.kind === 'note').map(e => e.text);
const v = (text, path = 'm.v') => ({ path, lang: 'verilog', text });
const vhd = (text, path = 'm.vhd') => ({ path, lang: 'vhdl', text });

test('$display %02d pads with zeros, %2d with blanks (secworks testbenches: "All 03 test cases")', () => {
  const r = run([v(`module tb; integer n = 3; initial begin
    $display("[%02d] [%2d] [%04d] [%0d] [%4d]", n, n, n, n, -n); end endmodule`)], 'tb');
  assert.deepEqual(prints(r).filter(l => l.startsWith('[')), ['[03] [ 3] [0003] [3] [  -3]']);
});

test('a task may assign the module\'s variables without a warning; a function that does is warned (secworks)', () => {
  const lib = compile([v(`module tb; reg r; reg [3:0] c;
    task t; begin r = 1; c = c + 1; end endtask
    function [3:0] f(input [3:0] x); begin c = x; f = x + 1; end endfunction
    initial begin c = 0; t; t; $display("c=%0d r=%0d f=%0d", c, r, f(4'd5)); end endmodule`)]);
  const d = elaborate(lib, 'tb');
  const warns = d.diags.filter(x => x.severity === 'warning').map(x => x.message);
  assert.ok(!warns.some(w => /assigns signal '(r|c)'/.test(w) && !/function/.test(w)), warns.join('; '));
  assert.equal(warns.filter(w => /function assigns signal/.test(w)).length, 1, warns.join('; '));
  assert.match(warns.find(w => /function assigns signal/.test(w)), /'c'/);
});

test('Verilog ?: of strings in a parameter, compared in a generate if (verilog-lfsr: STYLE_INT)', () => {
  const mod = style => v(`module m #(parameter STYLE = "${style}") (input a, output y);
    parameter STYLE_INT = (STYLE == "AUTO") ? "REDUCTION" : STYLE;
    generate if (STYLE_INT == "REDUCTION") begin : r assign y = a; end
    else begin : l assign y = ~a; end endgenerate
  endmodule`);
  const tb = v(`module tb; reg a = 1; wire y; m u (.a(a), .y(y)); initial #1 $display("y=%b", y); endmodule`, 'tb.v');
  assert.ok(prints(run([mod('AUTO'), tb], 'tb')).includes('y=1'));
  assert.ok(prints(run([mod('LOOP'), tb], 'tb')).includes('y=0'));
});

test('ieee.math_real: ceil, floor, log2, round… in constants, MATH_PI, and UNIFORM (jakubcabal uart / spi)', () => {
  const r = run([vhd(`library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all; use ieee.math_real.all;
entity tb is end entity;
architecture sim of tb is
  constant N : natural := 5;
  constant W : natural := natural(ceil(log2(real(N))));
  constant W1 : natural := natural(ceil(log2(real(1))));
  signal v : std_logic_vector(W-1 downto 0);
begin
  process
    variable s1, s2 : positive := 1;
    variable x : real;
    variable lo, hi : integer := 0;
  begin
    report "W=" & integer'image(W) & " W1=" & integer'image(W1) & " len=" & integer'image(v'length);
    report "floor=" & integer'image(integer(floor(2.7))) & " round=" & integer'image(integer(round(-2.5)))
      & " sqrt=" & integer'image(integer(sqrt(49.0))) & " pi100=" & integer'image(integer(MATH_PI * 100.0))
      & " max=" & integer'image(integer(realmax(2.0, 7.0))) & " log10=" & integer'image(integer(log10(1000.0)));
    for i in 1 to 1000 loop
      uniform(s1, s2, x);
      assert x > 0.0 and x < 1.0 report "uniform out of (0, 1)" severity failure;
      if x < 0.5 then lo := lo + 1; else hi := hi + 1; end if;
    end loop;
    report "lo=" & integer'image(lo) & " hi=" & integer'image(hi) & " s1=" & integer'image(s1);
    wait;
  end process;
end architecture;`)], 'tb');
  const out = prints(r);
  assert.ok(out.includes('W=3 W1=0 len=3'), out.join('\n'));
  assert.ok(out.includes('floor=2 round=-3 sqrt=7 pi100=314 max=7 log10=3'), out.join('\n'));
  const m = out.map(l => /^lo=(\d+) hi=(\d+) s1=(\d+)$/.exec(l)).find(Boolean);
  assert.ok(m, out.join('\n'));
  assert.equal(+m[1] + +m[2], 1000);
  assert.ok(+m[1] > 400 && +m[1] < 600, `uniform is not uniform: ${m[0]}`);
  // the same seeds give the same sequence (the generator is deterministic)
  assert.deepEqual(prints(run([vhd(r.lib.parsed.find(p => p.file === 'm.vhd').text)], 'tb')), out);
});

test('VHDL: an aggregate (others => \'0\') as the actual of an input port, sized by the instance\'s generics (spi-fpga)', () => {
  const sub = vhd(`library ieee; use ieee.std_logic_1164.all;
entity sub is generic (N : natural := 4); port (a : in std_logic_vector(N-1 downto 0); b : in std_logic; y : out std_logic_vector(N downto 0)); end entity;
architecture rtl of sub is begin y <= b & a; end architecture;`, 'sub.vhd');
  for (const n of [4, 1]) {
    const top = vhd(`library ieee; use ieee.std_logic_1164.all;
entity tb is end entity;
architecture sim of tb is
  signal y : std_logic_vector(${n} downto 0);
begin
  u : entity work.sub generic map (N => ${n}) port map (a => (others => '1'), b => '0', y => y);
  process begin wait for 1 ns; report "y len " & integer'image(y'length) & " y0 " & std_logic'image(y(0)); wait; end process;
end architecture;`, 'tb.vhd');
    const out = prints(run([sub, top], 'tb'));
    assert.ok(out.includes(`y len ${n + 1} y0 '1'`), `N=${n}: ${out.join('; ')}`);
  }
});

test('open synthesis: a memory declared in a function keeps its words (verilog-lfsr: lfsr_mask)', async () => {
  // the function's local memory was written as one vector: Yosys made the PRBS / CRC constant
  const r = await diffSynth({ name: 'fn-local-memory', top: 'm', sim: { cycles: 60 }, sources: [v(`module m (input clk, input [2:0] k, output reg [3:0] q);
  function [3:0] f(input [2:0] i);
    reg [3:0] t [0:7];
    integer j;
    begin
      for (j = 0; j < 8; j = j + 1) t[j] = j * 3 + 1;
      t[i[1:0]] = t[i[1:0]] ^ 4'b1010;
      f = t[i];
    end
  endfunction
  always @(posedge clk) q <= f(k);
endmodule`)] });
  assert.equal(r.status, 'pass', r.report || `${r.stage}: ${r.reason}`);
});

test('differential test: a block RAM never written (INIT x from Yosys) starts at 0, as in the bitstream (verilog-axis fifo)', async () => {
  // a registered read of a word never written: x in the netlist's INIT_xx / INIT_B / SRVAL_B, 0 on
  // the FPGA, as the RTL's power-up at 0 (powerUp: true: no second run with X's)
  const r = await diffSynth({ name: 'bram-x-init', top: 'm', sim: { cycles: 80 }, powerUp: true, sources: [v(`module m (input clk, input we, input [8:0] wa, input [8:0] ra, input [7:0] d, output reg [7:0] q);
  reg [7:0] mem [0:511];
  always @(posedge clk) begin
    if (we) mem[wa] <= d;
    q <= mem[ra];
  end
endmodule`)] });
  assert.equal(r.status, 'pass', r.report || `${r.stage}: ${r.reason}`);
  assert.ok(Object.keys(r.cells).some(c => /^RAMB16/.test(c)), JSON.stringify(r.cells));
});

test('VHDL: boolean(c), an aggregate as a generic\'s actual, an unconstrained array generic (NEORV32, light8080)', () => {
  const r = run([vhd(`library ieee; use ieee.std_logic_1164.all;
package p is
  type bytes_t is array (natural range <>) of std_logic_vector(7 downto 0);
  constant code : bytes_t(0 to 2) := (x"c3", x"60", x"55");
end package;`, 'p.vhd'), vhd(`library ieee; use ieee.std_logic_1164.all; use work.p.all;
entity sub is
  generic (BASE : std_ulogic_vector(7 downto 0) := x"00"; EN : boolean := false; CODE_G : bytes_t);
  port (y : out std_logic_vector(7 downto 0); n : out integer);
end entity;
architecture rtl of sub is begin
  y <= std_logic_vector(BASE) when EN else CODE_G(CODE_G'high);
  n <= CODE_G'length;
end architecture;`, 'sub.vhd'), vhd(`library ieee; use ieee.std_logic_1164.all; use work.p.all;
entity tb is end entity;
architecture sim of tb is
  constant MODE : natural := 2;
  constant EN_C : boolean := boolean(MODE = 2);
  signal y1, y2 : std_logic_vector(7 downto 0);
  signal n1 : integer;
begin
  u1 : entity work.sub generic map (BASE => (others => '1'), EN => EN_C, CODE_G => code) port map (y => y1, n => n1);
  u2 : entity work.sub generic map (BASE => (others => '1'), EN => boolean(MODE = 0), CODE_G => code) port map (y => y2, n => open);
  process begin wait for 1 ns;
    report "y1=" & integer'image(to_integer(unsigned(y1))) & " y2=" & integer'image(to_integer(unsigned(y2))) & " n=" & integer'image(n1); wait; end process;
end architecture;`, 'tb.vhd')], 'tb');
  assert.ok(prints(r).includes('y1=255 y2=85 n=3'), prints(r).join('; '));
});

test('placer: the I/Os of a bank share its VCCO (ISE DRC PhysDesignRules:755: a 3.3 V clock on B8 and 2.5 V outputs in bank 0)', async () => {
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const { readYosysJson } = await import('../packages/silinx-fpga/src/fpga/netlist.js');
  const { pack } = await import('../packages/silinx-fpga/src/fpga/pack.js');
  const { deviceSites, place, PlaceError, bankOfPad, vccoOfStandard } = await import('../packages/silinx-fpga/src/fpga/place.js');
  const { loadDeviceCache } = await import('../packages/silinx-fpga/src/fpga/device-node.js');
  assert.equal(vccoOfStandard('LVCMOS33'), 3.3);
  assert.equal(vccoOfStandard('lvttl'), 3.3);
  assert.equal(vccoOfStandard('LVCMOS25'), 2.5);
  assert.equal(vccoOfStandard('FOO'), null);
  const lib = compile([v(`module m (input clk, input [15:0] a, output reg [31:0] q);
  always @(posedge clk) q <= {a, ~a};
endmodule`)]);
  const syn = await synthesizeOpen(elaborate(lib, 'm'), { run: yosysNode });
  const nl = readYosysJson(syn.files['m.json']);
  const sites = deviceSites(loadDeviceCache('xc3s250ecp132-4'));
  // the clock at 3.3 V on B8 (bank 0); everything else unconstrained: LVCMOS25, ISE's default
  const ucf = 'NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33 ;\n';
  for (const seed of [1, 2, 3]) {
    const packed = pack(nl, { ucf, part: 'xc3s250ecp132-4' });
    const r = place(packed, sites, { seed, effort: 0.3 });
    const banks = new Map();
    packed.insts.forEach((inst, i) => {
      if (inst.kind !== 'iob') return;
      const std = inst.cfg.find(c => c.attr === 'IOATTRBOX').value;
      const b = bankOfPad(r.sites[i]);
      (banks.get(b) || banks.set(b, new Set()).get(b)).add(vccoOfStandard(std));
    });
    for (const [b, vs] of banks) assert.equal(vs.size, 1, `seed ${seed}: bank ${b} mixes ${[...vs].join(' and ')} V`);
    assert.deepEqual([...banks.get(0)], [3.3]);
  }
  // two fixed I/Os of one bank at different voltages: refused, as ISE refuses them
  const bad = pack(nl, { ucf: `${ucf}NET "q<0>" LOC = "A10" | IOSTANDARD = LVCMOS25 ;\n`, part: 'xc3s250ecp132-4' });
  assert.throws(() => place(bad, sites, { seed: 1, effort: 0.3 }), e => e instanceof PlaceError && /bank 0.*VCCO 3.3 V, not 2.5 V/.test(e.message));
});

test('placer: no pad for I/Os because of the banks\' VCCO (every bank holds LVCMOS33 pins, the others LVCMOS25) is said, not "not enough pads" (#128)', async () => {
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const { readYosysJson } = await import('../packages/silinx-fpga/src/fpga/netlist.js');
  const { pack } = await import('../packages/silinx-fpga/src/fpga/pack.js');
  const { deviceSites, place, PlaceError } = await import('../packages/silinx-fpga/src/fpga/place.js');
  const { loadDeviceCache } = await import('../packages/silinx-fpga/src/fpga/device-node.js');
  const lib = compile([v(`module m (input clk, input [2:0] a, input [3:0] b, output reg [3:0] q);
  always @(posedge clk) q <= {a, 1'b0} ^ b;
endmodule`)]);
  const syn = await synthesizeOpen(elaborate(lib, 'm'), { run: yosysNode });
  const nl = readYosysJson(syn.files['m.json']);
  const sites = deviceSites(loadDeviceCache('xc3s250ecp132-4'));
  // one LVCMOS33 pin in each of the 4 banks (B8: bank 0, C14: 1, M2: 2, B2: 3); b and q: LVCMOS25
  const ucf = ['NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33 ;', 'NET "a<0>" LOC = "C14" | IOSTANDARD = LVCMOS33 ;',
    'NET "a<1>" LOC = "M2" | IOSTANDARD = LVCMOS33 ;', 'NET "a<2>" LOC = "B2" | IOSTANDARD = LVCMOS33 ;', ''].join('\n');
  const packed = pack(nl, { ucf, part: 'xc3s250ecp132-4' });
  let err;
  try { place(packed, sites, { seed: 1, effort: 0.3 }); } catch (e) { err = e; }
  assert.ok(err instanceof PlaceError, String(err));
  assert.equal(err.message, `place: no pad for 8 I/O(s) of LVCMOS25 (VCCO 2.5 V): b<0>, b<1>, b<2>, b<3>, q<0>, q<1>, q<2>, q<3>: the banks with free pads need another VCCO: bank 0 VCCO 3.3 V (LVCMOS33: clk), bank 1 VCCO 3.3 V (LVCMOS33: a<0>), bank 2 VCCO 3.3 V (LVCMOS33: a<1>), bank 3 VCCO 3.3 V (LVCMOS33: a<2>)`);
  assert.equal(err.hint, `Give them the I/O standard of a bank in the constraints (UCF), e.g. NET "b<0>" IOSTANDARD = LVCMOS33; (or LOC them on pads of a bank of their own).`);
  // given that standard: placed
  const fixed = pack(nl, { ucf: ucf + [0, 1, 2, 3].map(k => `NET "b<${k}>" IOSTANDARD = LVCMOS33 ;\nNET "q<${k}>" IOSTANDARD = LVCMOS33 ;\n`).join(''), part: 'xc3s250ecp132-4' });
  assert.ok(place(fixed, sites, { seed: 1, effort: 0.3 }).sites.length);
  // too few pads, whatever the standards: still "not enough pads"
  const wide = compile([v(`module w (input [199:0] a, output [199:0] q);
  assign q = ~a;
endmodule`)]);
  const wsyn = await synthesizeOpen(elaborate(wide, 'w'), { run: yosysNode });
  assert.throws(() => place(pack(readYosysJson(wsyn.files['w.json']), { part: 'xc3s250ecp132-4' }), sites, { seed: 1, effort: 0.3 }),
    e => e instanceof PlaceError && e.message === 'place: not enough pads' && e.hint === undefined);
});

test('open synthesis: a for loop in an instance\'s process (its variable named after the instance: \\u.j) is not lost (verilog-axis FIFO in a wrapper)', async () => {
  // Yosys 0.68 does not unroll `for (\u.j = 3; …)` on an escaped name with a dot: the pipeline vanished
  const r = await diffSynth({ name: 'loop-in-instance', top: 'top', sim: { cycles: 60 }, sources: [v(`module pipe (input clk, input [7:0] d, output [7:0] q);
  reg [7:0] p [0:3];
  integer j;
  always @(posedge clk) begin
    for (j = 3; j > 0; j = j - 1) p[j] <= p[j - 1];
    p[0] <= d;
  end
  assign q = p[3];
endmodule
module top (input clk, input [7:0] d, output [7:0] q);
  pipe u (.clk(clk), .d(d), .q(q));
endmodule`)] });
  assert.equal(r.status, 'pass', r.report || `${r.stage}: ${r.reason}`);
  // the FIFO's 32 pipeline bits: flip-flops, or (since SRL16 inference) shift registers of 4 bits each
  assert.ok((r.cells.FDRE ?? 0) === 32 || (r.cells.SRL16E ?? 0) === 8, JSON.stringify(r.cells));
});

test('RAMB16 model: a port reading the word the other port writes at the same edge reads the old word (verilog-axis FIFO)', async () => {
  // Yosys maps the memory's write port READ_FIRST; the model used to write port A before reading port B
  const r = await diffSynth({ name: 'bram-collision', top: 'm', sim: { cycles: 200, ranges: { wa: [0, 3], ra: [0, 3] } }, sources: [v(`module m (input clk, input we, input [5:0] wa, input [5:0] ra, input [7:0] d, output reg [7:0] q);
  reg [7:0] mem [0:63];
  always @(posedge clk) begin
    if (we) mem[wa] <= d;
    q <= mem[ra];
  end
endmodule`)] });
  assert.equal(r.status, 'pass', r.report || `${r.stage}: ${r.reason}`);
  assert.ok(Object.keys(r.cells).some(c => /^RAMB16/.test(c)), JSON.stringify(r.cells));
});
