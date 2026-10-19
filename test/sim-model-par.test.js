// The Post-Place & Route Simulation Model of the Silinx toolchain with its timing (core/sim-model.js
// postParModels, core/sdf.js, the flow's postpar step, #122): the SDF written, read and built into a netlist
// (wire and gate delays, the glitches a gate filters, the setup checks), in VHDL and in Verilog; the model of a
// placed and routed design against its static timing (every connection's delay in the SDF; simulated with a
// clock a little slower than the timing's minimum period it works with no violation, a clock faster than it
// reports violations); and every example's test bench passes on the model with its timing, in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { orderOpenSteps } from '../core/open-steps.js';
import { writeSdf, parseSdf, annotateSdf, CHECKS_FROM } from '../core/sdf.js';
import { parseXdl } from '../core/xdl.js';
import { analyzeTiming } from '../core/fpga/timing.js';
import { device, flow, simulate, sdfPeriod, exampleTimesim } from './timesim-lib.mjs';
import { EXAMPLES } from './examples-lib.mjs';

// ------------------------------------------------------------------ the SDF
test('writeSdf: per instance its connections\' delays, its paths (from an input, from the clock\'s edge) and its setup checks, in ps', () => {
  const M = { insts: [
    { type: 'X_LUT4', name: 'a_F', arcs: { port: [['ADR0', 0.5866], ['ADR2', 1.2]], iopath: [['ADR0', 'O', 0.704], ['ADR2', 'O', 0.704]] } },
    { type: 'X_BUF', name: 'nothing', arcs: null },
    { type: 'X_SFF', name: 'q_0', arcs: { port: [['CE', 0.877]], clocked: [['CLK', 'O', 0.591]], setup: [['I', 'CLK', 0.133], ['CE', 'CLK', 0.555]] } },
    { type: 'X_RAMB16_S18_S18', name: 'ram', arcs: { port: [['ADDRA[3]', 0.75]] } },
  ] };
  assert.equal(writeSdf(M, { design: 'top' }), `(DELAYFILE
(SDFVERSION "3.0")
(DESIGN "top")
(VENDOR "Silinx")
(PROGRAM "Silinx toolchain")
(DIVIDER /)
(TIMESCALE 1 ps)
(CELL (CELLTYPE "X_LUT4")
  (INSTANCE a_F)
    (DELAY
      (ABSOLUTE
        (PORT ADR0 ( 587 ))
        (PORT ADR2 ( 1200 ))
        (IOPATH ADR0 O ( 704 ))
        (IOPATH ADR2 O ( 704 ))
      )
    )
)
(CELL (CELLTYPE "X_SFF")
  (INSTANCE q_0)
    (DELAY
      (ABSOLUTE
        (PORT CE ( 877 ))
        (IOPATH (posedge CLK) O ( 591 ))
      )
    )
    (TIMINGCHECK
      (SETUPHOLD I (posedge CLK) (133) (0))
      (SETUPHOLD CE (posedge CLK) (555) (0))
    )
)
(CELL (CELLTYPE "X_RAMB16_S18_S18")
  (INSTANCE ram)
    (DELAY
      (ABSOLUTE
        (PORT ADDRA[3] ( 750 ))
      )
    )
)
)
`);
});

test('parseSdf: our SDF and one as ISE\'s netgen writes it (ns, min:typ:max triples, escaped names, INTERCONNECT)', () => {
  const ise = `(DELAYFILE (SDFVERSION "3.0") (DESIGN "top") (DATE "Mon Oct 19 2026") (VENDOR "Xilinx") (PROGRAM "Xilinx SDF Writer") (VERSION "P.20131013")
  (DIVIDER /) (VOLTAGE 1.14) (TEMPERATURE 85) (TIMESCALE 1 ns)
  (CELL (CELLTYPE "X_LUT4") (INSTANCE u_knight_count_0_G_X_LUT4)
    (DELAY (ABSOLUTE (PORT ADR0 ( 0.586 )) (IOPATH ADR0 O ( 0.612:0.704:0.704 )))))
  (CELL (CELLTYPE "X_SFF") (INSTANCE u_knight\\/count_0)
    (DELAY (ABSOLUTE (IOPATH CLK O ( 0.591 ))))
    (TIMINGCHECK (SETUPHOLD I (posedge CLK) (0.130) (-0.028)) (SETUP CE (posedge CLK) (0.555))))
  (CELL (CELLTYPE "top") (INSTANCE)
    (DELAY (ABSOLUTE (INTERCONNECT a/O b/ADR1 ( 1.25 )))))
)`;
  const s = parseSdf(ise);
  assert.equal(s.timescale, 1000);
  const lut = s.cells.get('u_knight_count_0_G_X_LUT4');
  assert.deepEqual([lut.type, [...lut.port], lut.iopath], ['X_LUT4', [['ADR0', 586]], [{ from: 'ADR0', to: 'O', edge: null, ps: 704 }]]);
  const ff = s.cells.get('u_knight/count_0');
  assert.deepEqual(ff.iopath, [{ from: 'CLK', to: 'O', edge: null, ps: 591 }]);
  assert.deepEqual(ff.setup, [{ pin: 'I', clock: 'CLK', edge: 'posedge', setup: 130, hold: -28 }, { pin: 'CE', clock: 'CLK', edge: 'posedge', setup: 555, hold: 0 }]);
  assert.deepEqual([...s.cells.get('').port], [['ADR1', 1250]]);
  // ours: read back as written
  const ours = parseSdf(`(DELAYFILE (TIMESCALE 1 ps) (CELL (CELLTYPE "X_SFF") (INSTANCE q) (DELAY (ABSOLUTE (PORT CE ( 877 )) (IOPATH (posedge CLK) O ( 591 )))) (TIMINGCHECK (SETUPHOLD I (posedge CLK) (133) (0)))))`);
  assert.deepEqual(ours.cells.get('q'), { type: 'X_SFF', port: new Map([['CE', 877]]), iopath: [{ from: 'CLK', to: 'O', edge: 'posedge', ps: 591 }], setup: [{ pin: 'I', clock: 'CLK', edge: 'posedge', setup: 133, hold: 0 }] });
});

// a netlist of two SIMPRIM primitives as postParModels writes it: a buffer (a gate of 2 ns after a wire of 0.5 ns)
// and a flip-flop (clock to out 1 ns, setup 0.5 ns), in both languages
const NET_VHDL = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library SIMPRIM;
use SIMPRIM.VCOMPONENTS.ALL;
use SIMPRIM.VPACKAGE.ALL;

entity dut is
  port (
    a : in STD_LOGIC;
    clk : in STD_LOGIC;
    y : out STD_LOGIC;
    q : out STD_LOGIC
  );
end dut;

architecture STRUCTURE of dut is
  signal n1 : STD_LOGIC;
begin
  b : X_BUF
    port map (
      I => a,
      O => n1
    );
  y_OBUF : X_OBUF
    port map (
      I => n1,
      O => y
    );
  f : X_FF
    generic map (
      INIT => '0'
    )
    port map (
      I => a,
      CE => '1',
      CLK => clk,
      SET => '0',
      RST => '0',
      O => q
    );
end STRUCTURE;
`;
const NET_VLOG = `module dut (a, clk, y, q);
  input a;
  input clk;
  output y;
  output q;
  wire n1;
  X_BUF b (
    .I(a),
    .O(n1)
  );
  X_OBUF y_OBUF (
    .I(n1),
    .O(y)
  );
  X_FF #(
    .INIT(1'b0)
  ) f (
    .I(a),
    .CE(1'b1),
    .CLK(clk),
    .SET(1'b0),
    .RST(1'b0),
    .O(q)
  );
endmodule
`;
const SDF = `(DELAYFILE (SDFVERSION "3.0") (DESIGN "dut") (TIMESCALE 1 ps)
(CELL (CELLTYPE "X_BUF") (INSTANCE b) (DELAY (ABSOLUTE (PORT I ( 500 )) (IOPATH I O ( 2000 )))))
(CELL (CELLTYPE "X_FF") (INSTANCE f) (DELAY (ABSOLUTE (IOPATH (posedge CLK) O ( 1000 )))) (TIMINGCHECK (SETUPHOLD I (posedge CLK) (500) (0))))
(CELL (CELLTYPE "X_LUT4") (INSTANCE gone) (DELAY (ABSOLUTE (IOPATH ADR0 O ( 1 )))))
)`;

test('annotateSdf: the delays and the setup checks built into the netlist, VHDL and Verilog', () => {
  const v = annotateSdf(NET_VHDL, 'vhdl', parseSdf(SDF));
  assert.deepEqual([v.annotated, v.missing], [2, ['gone']]);
  assert.match(v.text, /^ {2}signal b_I_DLY : STD_LOGIC;\n {2}signal f_O_Q : STD_LOGIC;\nbegin$/m);
  assert.match(v.text, /^ {2}b : X_BUF\n {4}port map \(\n {6}I => b_I_DLY,\n {6}O => n1\n {4}\);$/m);
  assert.match(v.text, /^ {6}O => f_O_Q\n {4}\);$/m);
  // the delays: Silinx's X_SDFDLY (a connection's transport delay, then the gate's inertial one), natively evaluated
  assert.match(v.text, /^ {2}b_I_DLY_SDF : X_SDFDLY\n {4}generic map \(\n {6}WIRE_PS => 500,\n {6}GATE_PS => 2000\n {4}\)\n {4}port map \(\n {6}I => a,\n {6}O => b_I_DLY\n {4}\);\n {2}q_SDF : X_SDFDLY\n {4}generic map \(\n {6}WIRE_PS => 0,\n {6}GATE_PS => 1000\n {4}\)\n {4}port map \(\n {6}I => f_O_Q,\n {6}O => q\n {4}\);\n {2}f_I_SETUP : X_SDFCHECK\n {4}generic map \(\n {6}SETUP_PS => 500,\n {6}FROM_PS => 100000,\n {6}NEGEDGE => FALSE,\n {6}NAME => "f\.I"\n {4}\)\n {4}port map \(\n {6}D => a,\n {6}CLK => clk\n {4}\);$/m);
  const g = annotateSdf(NET_VLOG, 'verilog', parseSdf(SDF));
  assert.equal(g.annotated, 2);
  assert.match(g.text, /^`timescale 1 ps \/ 1 ps\n/);
  assert.match(g.text, /^ {2}X_SDFDLY #\(\n {4}\.WIRE_PS\(500\),\n {4}\.GATE_PS\(2000\)\n {2}\) b_I_DLY_SDF \(\n {4}\.I\(a\),\n {4}\.O\(b_I_DLY\)\n {2}\);$/m);
  assert.match(g.text, /^ {2}X_SDFCHECK #\(\n {4}\.SETUP_PS\(500\),\n {4}\.FROM_PS\(100000\),\n {4}\.NEGEDGE\("FALSE"\),\n {4}\.NAME\("f\.I"\)\n {2}\) f_I_SETUP \(\n {4}\.D\(a\),\n {4}\.CLK\(clk\)\n {2}\);$/m);
});

// a test bench of the two primitives: a pulse of 3 ns passes (2.5 ns later), one of 1 ns is a glitch the gate
// filters; an input changing 200 ps before the clock's edge: a setup violation (after the start-up's 100 ns)
const TB = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity tb is end;
architecture t of tb is
  signal a, clk, y, q : std_logic := '0';
begin
  u : entity work.dut port map (a => a, clk => clk, y => y, q => q);
  process begin
    wait for 120 ns; a <= '1'; wait for 3 ns; a <= '0';                 -- 120 .. 123 ns
    wait for 7 ns; a <= '1'; wait for 1 ns; a <= '0';                   -- 130 .. 131 ns: a glitch
    wait for 18.8 ns; a <= '1'; wait for 0.2 ns; clk <= '1';            -- a at 149.8 ns, the edge at 150 ns
    wait for 10 ns; clk <= '0'; wait for 30 ns; report "done"; wait;
  end process;
  process (y) begin report "y = " & std_logic'image(y) & " at " & time'image(now); end process;
  process (q) begin report "q = " & std_logic'image(q) & " at " & time'image(now); end process;
end;`;
for (const lang of ['vhdl', 'verilog']) {
  test(`the annotated netlist simulated (${lang}): wire and gate delays, a glitch filtered, a setup violation, clock to out`, () => {
    const a = annotateSdf(lang === 'vhdl' ? NET_VHDL : NET_VLOG, lang, parseSdf(SDF));
    const s = simulate([{ path: 'tb.vhd', lang: 'vhdl', text: TB }], `dut.${lang === 'vhdl' ? 'vhd' : 'v'}`, a.text, 'tb', 3e5, /^done$/);
    assert.deepEqual(s.diags, []);
    // (after the start-up: the values of time 0 settle through the delays)
    assert.deepEqual(s.events.filter(e => e.time >= 100000 && /^[yq] = |Timing/.test(e.text)).map(e => `${e.time} ${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text.replace(/ at .*$/, '')}`), [
      "122500 y = '1'", "125500 y = '0'",
      "150000 WARNING: Timing violation (setup 500 ps) on f.I: changed 200 ps before the clock's edge",
      "151000 q = '1'", "152300 y = '1'",
    ]);
  });
}

// ------------------------------------------------------------------ a placed and routed design against its timing
// an accumulator: its carry chain (the critical path) switches on most clock cycles
const CNT = `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity cnt is port ( clk : in std_logic; en : in std_logic; q : out std_logic_vector(15 downto 0) ); end;
architecture a of cnt is signal v : unsigned(15 downto 0) := (others => '0');
begin process (clk) begin if rising_edge(clk) then if en = '1' then v <= v + 23131; end if; end if; end process;
q <= std_logic_vector(v); end;`;
// the test bench: 500 cycles of a clock of period P (ps), then the sum (500 x 23131 mod 2^16 = 31164; the inputs
// do not change: only the paths from flip-flop to flip-flop, the static timing's)
const cntTb = P => `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity tb is end; architecture t of tb is signal clk : std_logic := '0'; signal en : std_logic := '1'; signal q : std_logic_vector(15 downto 0);
begin u : entity work.cnt port map (clk => clk, en => en, q => q);
process begin wait for 100 ns; for i in 1 to 500 loop clk <= '1'; wait for ${Math.floor(P / 2)} ps; clk <= '0'; wait for ${P - Math.floor(P / 2)} ps; end loop;
  wait for 50 ns; report "count " & integer'image(to_integer(unsigned(q))); wait; end process; end;`;

test('the flow\'s postpar step: the routed design\'s model, its SDF with every connection\'s delay of the static timing; simulated slower than its minimum period it works, faster it reports setup violations', { timeout: 900000 }, async () => {
  const src = [{ path: 'cnt.vhd', lang: 'vhdl', text: CNT }];
  const r = await flow({ top: 'cnt', steps: orderOpenSteps(['postpar']) }, src, []);
  assert.equal(r.ok, true, r.lines.join('\n'));
  assert.deepEqual(Object.keys(r.store).filter(f => /^netgen/.test(f)).sort(), ['netgen/par/cnt_timesim.sdf', 'netgen/par/cnt_timesim.v', 'netgen/par/cnt_timesim.vhd']);
  assert.deepEqual(r.report.simModels, { postpar: { path: 'build/netgen/par/cnt_timesim.vhd', verilog: 'build/netgen/par/cnt_timesim.v', sdf: 'build/netgen/par/cnt_timesim.sdf' } });
  const sta = analyzeTiming(parseXdl(r.store['open/routed.xdl']), device());
  assert.deepEqual(r.lines.filter(l => /^(WARNING|INFO|ERROR|Post-)/.test(l)), [
    `Post-Place & Route Simulation Model: build/netgen/par/cnt_timesim.vhd (VHDL, SIMPRIM primitives), build/netgen/par/cnt_timesim.v (Verilog) and build/netgen/par/cnt_timesim.sdf (SDF, the static timing's delays), ${/(\d+) primitives/.exec(r.lines.join('\n'))[1]} primitives, minimum period ${sta.period.toFixed(3)} ns`,
  ]);
  // (the model of this run's routed design: no test bench's generics)
  const vhd = r.store['netgen/par/cnt_timesim.vhd'];
  assert.match(vhd, /^-- Post-Place & Route Simulation Model of 'cnt' \(xc3s250ecp132-4\): the placed and routed design \(Silinx toolchain\),\n-- the SIMPRIM primitives it is made of \(its timing: cnt_timesim\.sdf\); written by Silinx\./);
  assert.match(vhd, / : X_S?FF\n {4}generic map \(\n {6}LOC => "SLICE_X\d+Y\d+",\n {6}INIT => '0'\n/);
  // every routed connection's delay is a PORT delay of the SDF (on the elements that read that site pin)
  const sdf = parseSdf(r.store['netgen/par/cnt_timesim.sdf']);
  const ports = new Map();
  for (const c of sdf.cells.values()) for (const d of c.port.values()) ports.set(d, (ports.get(d) || 0) + 1);
  const conns = sta.conns.filter(c => c.delay > 0);
  assert.ok(conns.length > 20, conns.length);
  assert.deepEqual(conns.filter(c => !ports.has(Math.round(c.delay * 1000))).map(c => `${c.to} ${c.delay}`), []);
  // the logic's delays: a slice's clock to out, a LUT's, the carry chain's, as the timing's model
  const types = new Set([...sdf.cells.values()].map(c => c.type));
  for (const t of ['X_LUT4', 'X_FF', 'X_MUX2', 'X_XOR2', 'X_BUF', 'X_OBUF']) assert.ok(types.has(t), [...types].join(' '));
  // the minimum period by the SDF on the model's elements: the static timing's (within the SDF's rounding to ps)
  const P = Math.round(sta.period * 1000);
  assert.ok(Math.abs(sdfPeriod(vhd, sdf) - P) <= 10, `${sdfPeriod(vhd, sdf)} ps by the SDF, ${P} ps by the static timing`);
  // simulated with its timing: a clock 15 % slower than the minimum period adds right with no violation; a clock
  // of 3/4 of it, the setup checks report violations (the sum wrong); (from 0.9 of it, right: the timing's worst
  // path seldom switches; at 0.6, the clock's pulses are shorter than the input pad's delay, which filters them)
  for (const lang of ['vhdl', 'verilog']) {
    const a = annotateSdf(r.store[`netgen/par/cnt_timesim.${lang === 'vhdl' ? 'vhd' : 'v'}`], lang, sdf);
    assert.deepEqual(a.missing, []);
    const slow = simulate([{ path: 'tb.vhd', lang: 'vhdl', text: cntTb(Math.round(P * 1.15)) }], `m.${lang === 'vhdl' ? 'vhd' : 'v'}`, a.text, 'tb', 2e5 + 600 * P * 1.2, /^count/);
    assert.deepEqual(slow.diags, []);
    assert.deepEqual(slow.log.filter(l => /^count|WARNING|ERROR/.test(l)), ['count 31164'], lang);
    const fast = simulate([{ path: 'tb.vhd', lang: 'vhdl', text: cntTb(Math.round(P * 0.75)) }], `m.${lang === 'vhdl' ? 'vhd' : 'v'}`, a.text, 'tb', 2e5 + 600 * P, /^count/);
    assert.notDeepEqual(fast.log.filter(l => /^count/.test(l)), ['count 31164'], lang);
    assert.ok(fast.log.some(l => /^WARNING: Timing violation \(setup \d+ ps\) on \w+\.\w+: changed \d+ ps before the clock's edge$/.test(l)), `${lang}: ${fast.log.slice(0, 6).join(' | ')}`);
    assert.ok(fast.events.filter(e => /Timing violation/.test(e.text)).every(e => e.time >= CHECKS_FROM));
  }
});

// every example's test bench, on the post-place & route model of the example (its generics the test bench's: the
// the longest, in test/sim-model-par-vga.test.js and test/sim-model-par-vga-verilog.test.js: run beside these)
// the longest, in test/sim-model-par-vga.test.js: run beside these)
for (const name of EXAMPLES.filter(n => n !== 'vga')) {
  test(`example ${name}: its test bench passes on the post-place & route model with its timing (SDF), VHDL and Verilog (#122)`, { timeout: 1800000 }, () => exampleTimesim(name));
}
