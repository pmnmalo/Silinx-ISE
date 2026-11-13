// The logic analyzer's capture inserted in a design (#3176, core/ila-insert.js): a project's capture settings resolved
// on the elaborated design (the probes' signals and widths: a vector, an integer's range, a state, a port; the
// trigger's values: a state's name, a negative integer) and their errors; the block RAMs against the device's; the
// wrapper around a VHDL and a Verilog design, with the core in VHDL and in Verilog, simulated with a test bench that
// plays the PC's part (the wrapper's JTAG side as ports): the readout is the design's internal counter, read through
// a hierarchical name, from the trigger's window; the wrapper with its BSCAN free of Check Syntax's design checks and
// synthesized by the open flow (Spartan-3E: BSCAN_SPARTAN3; Spartan-6: BSCAN_SPARTAN6) with one block RAM and no
// warnings; the open flow's front end with the capture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { planInsertion, captureSources, captureCost, captureFrontEnd, boardClockOf, boardClockUcf, captureClockText, CAPTURE_TOP } from '../core/ila-insert.js';
import { CAPTURE_CMD, readCapture, readoutCommands } from '../core/ila-capture.js';
import { flowFrontEnd, synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { designChecks } from '../core/lint.js';

// the design: top (clk, en, led) and its counter u (c: 8 bits, counting while en; s: a state, run once c > 2; n: an
// integer of -4 to 3), in VHDL and in Verilog
const VHDL = [{ path: 'src/counter.vhd', lang: 'vhdl', text: `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity counter is port (clk, en : in std_logic; q : out std_logic_vector(7 downto 0)); end counter;
architecture rtl of counter is
  type state_t is (idle, run, stop);
  signal c : unsigned(7 downto 0) := (others => '0');
  signal s : state_t := idle;
  signal n : integer range -4 to 3 := -4;
begin
  process (clk) begin
    if rising_edge(clk) then
      if en = '1' then c <= c + 1; end if;
      if c > 2 then s <= run; end if;
      if n = 3 then n <= -4; else n <= n + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
end rtl;` }, { path: 'src/top.vhd', lang: 'vhdl', text: `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity top is port (clk, en : in std_logic; led : out std_logic_vector(7 downto 0)); end top;
architecture rtl of top is
begin
  u : entity work.counter port map (clk => clk, en => en, q => led);
end rtl;` }];
const VERILOG = [{ path: 'src/counter.v', lang: 'verilog', text: `module counter (input clk, input en, output [7:0] q);
  reg [7:0] c = 0;
  reg [1:0] s = 0;
  always @(posedge clk) begin
    if (en) c <= c + 1;
    if (c > 2) s <= 1;
  end
  assign q = c;
endmodule` }, { path: 'src/top.v', lang: 'verilog', text: `module top (input clk, input en, output [7:0] led);
  counter u (.clk(clk), .en(en), .q(led));
endmodule` }];
const designOf = srcs => elaborate(compile([...primitiveSources(srcs), ...srcs]), 'top');
const settings = (o = {}) => ({ clock: 'clk', depth: 16, pre: 4, probes: ['u.c', 'en'], trigger: { combine: 'and', conditions: [{ probe: 'u.c', op: '=', value: 20 }] }, ...o });

test('a capture\'s settings on the design: each probe\'s signal and width (a vector, a state, an integer\'s range, a port), the trigger\'s values', () => {
  const d = designOf(VHDL);
  const r = planInsertion(d, settings({ probes: ['u.c', 'top.u.s', 'u.n', 'en'], trigger: { combine: 'or', conditions: [{ probe: 'u.s', op: '=', value: 'RUN' }, { probe: 'u.n', op: '=', value: -1 }, { probe: 'en', op: 'rise' }] } }));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.probes.map(p => [p.path, p.name, p.width, p.kind]), [['u.c', 'u_c', 8, 'a vector'], ['u.s', 'u_s', 2, 'a state'], ['u.n', 'u_n', 3, 'an integer'], ['en', 'en', 1, 'a vector']]);
  assert.equal(r.clock, 'clk');
  assert.deepEqual(r.spec.trigger.conditions, [{ probe: 'u_s', op: '=', value: 1 }, { probe: 'u_n', op: '=', value: 7 }, { probe: 'en', op: 'rise' }]);
  assert.deepEqual([r.plan.width, r.plan.slices], [14, { u_c: [0, 7], u_s: [8, 9], u_n: [10, 12], en: [13, 13] }]);
  const v = planInsertion(designOf(VERILOG), settings({ probes: ['u.c', 'u.s'] }));
  assert.deepEqual([v.errors, v.probes.map(p => p.width)], [[], [8, 2]]);
});

test('a capture\'s errors: a signal not in the design, an array, the clock, the trigger\'s signal and value, the depth, the family', () => {
  const d = designOf(VHDL);
  const errs = o => planInsertion(d, settings(o)).errors;
  assert.deepEqual(errs({ probes: ['u.nope', 'u.c'] }), ["The probe 'u.nope' is not a signal of the design (a signal's path below the top: count, u_ctl.state)."]);
  const mem = designOf([{ path: 'src/top.vhd', lang: 'vhdl', text: `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity top is port (clk : in std_logic); end top;
architecture rtl of top is type mem_t is array (0 to 3) of std_logic_vector(7 downto 0); signal m : mem_t; begin end rtl;` }]);
  assert.deepEqual(planInsertion(mem, settings({ probes: ['m'], trigger: {} })).errors, ["The probe 'm' is an array (a memory): a probe is a vector, an integer, a state or a bit."]);
  assert.deepEqual(errs({ probes: ['u.c', 'top.u.c'] }), ["The probe 'top.u.c' is given twice."]);
  assert.deepEqual(errs({ probes: [] }), ['A capture watches one signal or more (probes).']);
  assert.deepEqual(errs({ clock: undefined }), ['A capture needs the clock it samples on (clock), or the board\'s clock.']);
  assert.deepEqual(errs({ clock: 'clock' }), ["The clock 'clock' is not a signal of the design."]);
  assert.deepEqual(errs({ clock: 'u.c' }), ["The clock 'u.c' is not a signal of one bit."]);
  assert.deepEqual(errs({ trigger: { conditions: [{ probe: 'u.s', op: '=', value: 1 }] } }), ["The trigger's signal 'u.s' is not one of the capture's probes."]);
  assert.deepEqual(errs({ trigger: { conditions: [{ probe: 'u.c', op: '=', value: 256 }] } }), ["The trigger's value of 'u.c' is a whole number from 0 to 255."]);
  assert.deepEqual(errs({ trigger: { conditions: [{ probe: 'u.c', op: 'rise' }] } }), ["The trigger's rising edge is of a probe of one bit ('u.c' has 8)."]);
  assert.deepEqual(errs({ depth: 100 }), ['The depth is a power of 2 from 16 to 16384 samples.']);
  assert.deepEqual(errs({ pre: 16 }), ['The samples before the trigger are a whole number from 0 to 15.']);
  assert.deepEqual(planInsertion(d, settings(), { family: 'ice40' }).errors, ['The logic analyzer has no JTAG link on the ice40 yet.']);
  assert.deepEqual(captureSources(d, settings({ probes: ['x'] })).sources, []);
});

test('a capture\'s block RAMs against the device\'s: one kept for the design (XC3S100E: 4 RAMB16; XC6SLX16: 64 halves)', () => {
  const d = designOf(VHDL);
  const cost = (o, family, total) => captureCost(planInsertion(d, settings(o), { family }).plan, total);
  assert.deepEqual(cost({ depth: 1024 }, 'spartan3e', 4), { blocks: 1, halves: 1, total: 4, errors: [] });
  assert.deepEqual(cost({ depth: 4096 }, 'spartan3e', 4), { blocks: 2, halves: 2, total: 4, errors: [] });
  assert.deepEqual(cost({ depth: 4096, probes: ['u.c', 'u.s', 'en'] }, 'spartan3e', 4), { blocks: 3, halves: 3, total: 4, errors: [] });
  assert.deepEqual(cost({ depth: 8192 }, 'spartan3e', 4).errors, ["The capture takes 4 block RAM(s) of the device's 4: at most 3, one block kept for the design (fewer samples or fewer probes)."]);
  assert.deepEqual(cost({ depth: 16384 }, 'spartan6', 64).errors, []);
  assert.deepEqual(cost({ depth: 1024 }, 'spartan3e', null), { blocks: 1, halves: 1, total: null, errors: [] });
});

// ------------------------------------------------------------------ simulation
const SCANS = spec => [CAPTURE_CMD.arm, CAPTURE_CMD.status, CAPTURE_CMD.status, ...readoutCommands(spec)];
// the test bench (Verilog): clk 10 ns, tck 40 ns; the scans [arm, status], en (the counter counts), a status (the
// poll), the readout; each scan's word "S <bits>", the top bit first
function bench(R, cmds) {
  return `\`timescale 1ns / 1ps
module tb;
  reg clk = 0, en = 0, tck = 0, sel = 0, capture = 0, shift = 0, tdi = 0;
  wire tdo;
  wire [7:0] led;
  reg [1:0] cmds [0:${cmds.length - 1}];
  reg [${R - 1}:0] got;
  integer k, i;
  always #5 clk = ~clk;
  ${CAPTURE_TOP} uut (.clk(clk), .en(en), .led(led), .tck(tck), .sel(sel), .capture(capture), .shift(shift), .tdi(tdi), .tdo(tdo));
  initial begin
${cmds.map((c, k) => `    cmds[${k}] = 2'd${c};`).join('\n')}
    #100;
    for (k = 0; k < ${cmds.length}; k = k + 1) begin
      if (k == 2) begin #400 en = 1; #1000; end
      sel = 1; capture = 1; #20 tck = 1; #20 tck = 0; capture = 0; shift = 1;
      for (i = 0; i < ${R}; i = i + 1) begin
        tdi = i < 2 ? cmds[k][i] : 1'b0;
        #20 got[i] = tdo;
        tck = 1; #20 tck = 0;
      end
      shift = 0; sel = 0;
      #20 tck = 1; #20 tck = 0; #20 tck = 1; #20 tck = 0;
      $display("S %b", got);
    end
    $finish;
  end
endmodule`;
}

for (const [dlang, design] of [['VHDL', VHDL], ['Verilog', VERILOG]]) {
  for (const lang of ['vhdl', 'verilog']) {
    test(`a ${dlang} design's capture, its core in ${lang}, simulated: the internal counter read through a hierarchical name, the trigger's window`, () => {
      const c = captureSources(designOf(design), settings(), { lang, link: 'ports' });
      assert.deepEqual(c.errors, []);
      assert.deepEqual(c.sources.map(s => s.path), [`capture/silinx_capture.${lang === 'verilog' ? 'v' : 'vhd'}`, 'capture/silinx_capture_top.v']);
      const cmds = SCANS(c.spec), R = c.plan.regBits;
      const srcs = [...design, ...c.sources, { path: 'sim/tb.v', lang: 'verilog', text: bench(R, cmds) }];
      const r = simulate(srcs, 'tb', { until: (100 + cmds.length * (R + 3) * 40 + 1400 + 1000) * 1000 });
      assert.deepEqual(r.errors.map(e => `${e.file}:${e.line}: ${e.message}`), []);
      assert.deepEqual([...(r.lib?.errors || []), ...(r.design?.diags || [])].map(d => `${d.file}:${d.line}: ${d.message}`), [], 'no warnings');
      const words = r.sim.log.filter(l => /^S [01]+$/.test(l.text)).map(l => BigInt(`0b${l.text.slice(2)}`));
      assert.equal(words.length, cmds.length);
      const cap = readCapture(c.spec, words.slice(3));
      assert.deepEqual(cap.errors, []);
      // the trigger u.c = 20, 4 samples before it: the counts 16 .. 31, en high throughout
      assert.deepEqual(cap.probes.u_c, Array.from({ length: 16 }, (_, k) => BigInt(16 + k)));
      assert.deepEqual(cap.probes.en, Array(16).fill(1n));
      assert.equal(cap.trigger, 4);
    });
  }
}

// ------------------------------------------------------------------ the wrapper with its BSCAN
test('the capture with its BSCAN checked (Check Syntax\'s design checks) and synthesized by the open flow (Spartan-3E, Spartan-6, 7-series: #3767): the BSCAN, one block RAM, no warnings', async () => {
  for (const [family, bscan, ram] of [['spartan3e', 'BSCAN_SPARTAN3', /^RAMB16_S9_S9$/], ['spartan6', 'BSCAN_SPARTAN6', /^RAMB(8|16)BWER$/], ['artix7', 'BSCANE2', /^RAMB18E1$/]]) {
    for (const [dlang, design] of [['VHDL', VHDL], ['Verilog', VERILOG]]) {
      const c = captureSources(designOf(design), settings({ depth: 1024, pre: 100 }), { family });
      assert.match(c.sources[1].text, new RegExp(`${bscan}${family === 'spartan3e' ? '' : ' #\\(\\.JTAG_CHAIN\\(1\\)\\)'} silinx_bscan \\(`));
      const srcs = [...design, ...c.sources];
      const lib = compile([...primitiveSources(srcs), ...srcs]);
      const d = elaborate(lib, CAPTURE_TOP);
      assert.deepEqual([...lib.errors, ...d.diags].map(e => e.message), [], `${family} ${dlang}: elaboration`);
      assert.deepEqual(designChecks(lib, d).filter(x => /^capture\//.test(x.file || '')).map(x => `${x.check}@${x.line}: ${x.message}`), [], `${family} ${dlang}: Check Syntax's design checks`);
      const r = await synthesizeOpen(d, { family, run: yosysNode });
      assert.equal(r.cells[bscan], 1, `${family} ${dlang}: ${JSON.stringify(r.cells)}`);
      const rams = Object.entries(r.cells).filter(([k]) => /^RAMB/.test(k));
      assert.equal(rams.length, 1, `${family} ${dlang}: ${JSON.stringify(rams)}`);
      assert.match(rams[0][0], ram);
      assert.equal(rams[0][1], 1, `${family} ${dlang}: one block`);
      assert.deepEqual(r.warnings, [], `${family} ${dlang}: warnings`);
    }
  }
});

test('the open flow\'s front end with the capture: the wrapper as the synthesis\'s top, the capture\'s errors as the front end\'s', () => {
  const fe = captureFrontEnd(flowFrontEnd, settings(), { family: 'spartan3e' })(VHDL, 'top');
  assert.deepEqual(fe.errors, []);
  assert.equal(fe.input().top, CAPTURE_TOP);
  assert.deepEqual(fe.capture.probes.map(p => p.path), ['u.c', 'en']);
  const bad = captureFrontEnd(flowFrontEnd, settings({ probes: ['u.x'] }))(VHDL, 'top');
  assert.deepEqual(bad.errors, ["capture: The probe 'u.x' is not a signal of the design (a signal's path below the top: count, u_ctl.state)."]);
  // (a design with errors: the front end's own errors, no capture)
  const broken = captureFrontEnd(flowFrontEnd, settings())([{ ...VHDL[0], text: VHDL[0].text.replace('c <= c + 1;', 'c <= c + ;') }, VHDL[1]], 'top');
  assert.ok(broken.errors.length && !broken.capture);
});

// ------------------------------------------------------------------ the board's clock (#3481)
// a design with no clock (combinational): the capture on the board's oscillator, a port of the wrapper's own
const COMB = [{ path: 'src/top.v', lang: 'verilog', text: `module top (input [1:0] sw, output y);
  assign y = sw[0] & sw[1];
endmodule
` }];
const MCLK = { name: 'mclk', label: 'MCLK', pin: 'B8', period: 20, iostandard: 'LVCMOS33', dedicated: false };

test('#3481 the board\'s clock: the oscillator found on a board, its constraints added to the design\'s, a pin taken refused', async () => {
  const { BOARDS } = await import('../server/boards.js');
  const { captureUcf } = await import('../core/flow-ide.js');
  const basys2 = BOARDS.find(b => b.id === 'basys2');
  assert.deepEqual(boardClockOf(basys2), { name: 'mclk', label: 'MCLK oscillator (25/50/100 MHz via JP4, default 50 MHz)', pin: 'B8', period: 20, iostandard: 'LVCMOS33', dedicated: false });
  assert.deepEqual(boardClockOf(BOARDS.find(b => b.id === 'nexys3')), { name: 'clk', label: '100 MHz oscillator (GCLK)', pin: 'V10', period: 10, iostandard: 'LVCMOS33', dedicated: true });
  assert.equal(boardClockOf({ resources: [{ name: 'led', group: 'LEDs', pins: ['M5'], dir: 'out' }] }), null);
  assert.equal(boardClockOf(null), null);
  assert.equal(captureClockText({ boardClock: MCLK }), 'the board\'s clock mclk (B8, 20 ns)');
  assert.equal(captureClockText({ clock: 'clk' }), 'clk');
  const lines = ['# the logic analyzer\'s clock: the board\'s clock mclk (B8, 20 ns) (#3481)', 'NET "silinx_board_clk" LOC = "B8" ;', 'NET "silinx_board_clk" CLOCK_DEDICATED_ROUTE = FALSE ;',
    'NET "silinx_board_clk" TNM_NET = "silinx_board_clk" ;', 'TIMESPEC "TS_silinx_board_clk" = PERIOD "silinx_board_clk" 20 ns HIGH 50% ;'];
  assert.equal(boardClockUcf(MCLK), lines.join('\n'));
  // (the design's constraints and the clock's after them; its I/O standard only when the design names theirs)
  const ucf = 'NET "sw<0>" LOC = "P11" ;\n';
  assert.deepEqual(captureUcf({ boardClock: MCLK }, ucf), { ucf: `NET "sw<0>" LOC = "P11" ;\n\n${lines.join('\n')}\n`, error: null });
  assert.match(captureUcf({ boardClock: MCLK }, 'NET "sw<0>" LOC = "P11" | IOSTANDARD = LVCMOS33 ;').ucf, /NET "silinx_board_clk" LOC = "B8" \| IOSTANDARD = LVCMOS33 ;/);
  assert.deepEqual(captureUcf({ boardClock: MCLK }, null), { ucf: `${lines.join('\n')}\n`, error: null });
  assert.deepEqual(captureUcf({ boardClock: MCLK }, 'NET "clk" LOC = "B8" ;\n'), { ucf: 'NET "clk" LOC = "B8" ;\n',
    error: 'capture: the board\'s clock mclk (B8, 20 ns) is the design\'s port clk already: choose clk as the capture\'s clock (Logic Analyzer Settings, capture_settings)' });
  assert.deepEqual(captureUcf({ clock: 'clk' }, ucf), { ucf, error: null });
});

test('#3481 a combinational design\'s capture on the board\'s clock: the wrapper\'s own clock port, simulated (sw\'s changes, y\'s rise the trigger)', () => {
  const s = { boardClock: MCLK, depth: 16, pre: 2, probes: ['sw', 'y'], trigger: { combine: 'and', conditions: [{ probe: 'y', op: 'rise' }] } };
  const ins = planInsertion(designOf(COMB), s);
  assert.deepEqual([ins.errors, ins.clock, ins.boardClock], [[], null, MCLK]);
  const c = captureSources(designOf(COMB), s, { lang: 'verilog', link: 'ports' });
  const wrapper = c.sources[1].text;
  assert.match(wrapper, /\n  input wire silinx_board_clk,\n  input wire tck,/);
  assert.match(wrapper, /silinx_capture silinx_ila \(\.clk\(silinx_board_clk\), /);
  // (no clock given, no board's clock: the error says both)
  assert.deepEqual(planInsertion(designOf(COMB), { ...s, boardClock: undefined }).errors, ['A capture needs the clock it samples on (clock), or the board\'s clock.']);
  assert.deepEqual(planInsertion(designOf(COMB), { ...s, boardClock: { name: 'mclk' } }).errors, ['The board\'s clock needs its name, its pin and its period.']);
  // the bench: the oscillator 10 ns; sw counts from the third scan on, y rising when sw is 3
  const cmds = SCANS(c.spec), R = c.plan.regBits;
  const tb = `\`timescale 1ns / 1ps
module tb;
  reg silinx_board_clk = 0, tck = 0, sel = 0, capture = 0, shift = 0, tdi = 0;
  reg [1:0] sw = 0;
  wire tdo, y;
  reg [1:0] cmds [0:${cmds.length - 1}];
  reg [${R - 1}:0] got;
  integer k, i;
  always #5 silinx_board_clk = ~silinx_board_clk;
  ${CAPTURE_TOP} uut (.sw(sw), .y(y), .silinx_board_clk(silinx_board_clk), .tck(tck), .sel(sel), .capture(capture), .shift(shift), .tdi(tdi), .tdo(tdo));
  initial begin
${cmds.map((x, k) => `    cmds[${k}] = 2'd${x};`).join('\n')}
    #100;
    for (k = 0; k < ${cmds.length}; k = k + 1) begin
      if (k == 2) begin #400 repeat (6) #30 sw = sw + 1; #1000; end
      sel = 1; capture = 1; #20 tck = 1; #20 tck = 0; capture = 0; shift = 1;
      for (i = 0; i < ${R}; i = i + 1) begin
        tdi = i < 2 ? cmds[k][i] : 1'b0;
        #20 got[i] = tdo;
        tck = 1; #20 tck = 0;
      end
      shift = 0; sel = 0;
      #20 tck = 1; #20 tck = 0; #20 tck = 1; #20 tck = 0;
      $display("S %b", got);
    end
    $finish;
  end
endmodule`;
  const r = simulate([...COMB, ...c.sources, { path: 'sim/tb.v', lang: 'verilog', text: tb }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line}: ${e.message}`), []);
  assert.deepEqual([...(r.lib?.errors || []), ...(r.design?.diags || [])].map(d => `${d.file}:${d.line}: ${d.message}`), [], 'no warnings');
  const words = r.sim.log.filter(l => /^S [01]+$/.test(l.text)).map(l => BigInt(`0b${l.text.slice(2)}`));
  const cap = readCapture(c.spec, words.slice(3));
  assert.deepEqual(cap.errors, []);
  assert.equal(cap.trigger, 2);
  // (sw 2 before the trigger, 3 at it: y rises; sw's later values as the bench gave them, each held 30 ns = 3 samples)
  assert.deepEqual([cap.probes.sw[1], cap.probes.sw[2], cap.probes.y[1], cap.probes.y[2]], [2n, 3n, 0n, 1n]);
});
