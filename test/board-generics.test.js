// An example's top made for another board (#3710, core/board-generics.js): the board's clock (CLK_HZ) and its buttons'
// and switches' levels (BTN_LOW, SW_LOW) from its pin table; the defaults of a top's generics rewritten in VHDL and in
// Verilog, a default already of that value, a default that is an expression and a missing generic left as written, the
// comments kept in their column; every clocked example's top for the Mimas V2 (100 MHz, active-low inputs) and the
// Nexys3 elaborated with them, its counters sized for them, with no error or warning; the clock example made for the
// Mimas V2 simulated: a second is CLK_HZ cycles, its reset and 24-hour switches OFF read 1, a pressed button is a 0.
// The display's digit enables' level (AN_LOW, #3884): every example with a display made for a board whose enables are
// active high (the EDGE Spartan 6's pin table), elaborated, and its display simulated at both levels (from a Verilog test
// bench, and the stopwatch's from a VHDL one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardGenericValues, setGenericDefaults, topFileOf, topForBoard, topForBoardText } from '../core/board-generics.js';
import { resolveBoard } from '../server/devices.js';
import { BOARDS } from '../server/boards.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { EXAMPLES, example } from './examples-lib.mjs';

test('#3710 the board\'s values: its clock in Hz (whole kHz), its buttons\' and switches\' levels', () => {
  const v = id => boardGenericValues(resolveBoard(id));
  assert.deepEqual(v('basys2'), { CLK_HZ: 50_000_000, BTN_LOW: false, SW_LOW: false, AN_LOW: true });
  assert.deepEqual(v('nexys3'), { CLK_HZ: 100_000_000, BTN_LOW: false, SW_LOW: false, AN_LOW: true });
  assert.deepEqual(v('mimas-v2'), { CLK_HZ: 100_000_000, BTN_LOW: true, SW_LOW: true, AN_LOW: true });
  // (its DIP switches are "dip": the board's Switches, as boardAutoAssign finds them)
  assert.deepEqual(v('elbert-v2'), { CLK_HZ: 12_000_000, BTN_LOW: true, SW_LOW: true, AN_LOW: true });
  assert.deepEqual(v('icebreaker'), { CLK_HZ: 12_000_000, BTN_LOW: false, SW_LOW: false, AN_LOW: true });
  // (no switches: no SW_LOW; no display: no AN_LOW)
  assert.deepEqual(v('cmod-s6'), { CLK_HZ: 8_000_000, BTN_LOW: false });
  assert.deepEqual(boardGenericValues(null), {});
  for (const b of BOARDS) assert.ok(Number.isInteger(v(b.id).CLK_HZ) && v(b.id).CLK_HZ > 0, b.id);
});

test('#3710 the defaults rewritten: VHDL and Verilog literals, the comments in their column; the others left as written', () => {
  const vhd = [
    '    Generic ( CLK_HZ  : integer := 50_000_000;     -- the clock',
    '              TICK    : integer := CLK_HZ;         -- an expression',
    '              BTN_LOW : boolean := false;          -- the buttons',
    '              SW_LOW  : boolean := false );        -- the switches'].join('\n');
  const r = setGenericDefaults(vhd, 'vhdl', { CLK_HZ: 100_000_000, BTN_LOW: true, SW_LOW: false, TICK: 5, NONE: 1 });
  assert.deepEqual(r.changed, ['CLK_HZ', 'BTN_LOW']);
  assert.equal(r.text, [
    '    Generic ( CLK_HZ  : integer := 100_000_000;    -- the clock',
    '              TICK    : integer := CLK_HZ;         -- an expression',
    '              BTN_LOW : boolean := true;           -- the buttons',
    '              SW_LOW  : boolean := false );        -- the switches'].join('\n'));
  assert.deepEqual(setGenericDefaults(r.text, 'vhdl', { SW_LOW: true }).text.split('\n')[3], '              SW_LOW  : boolean := true );         -- the switches');
  const v = [
    '    parameter CLK_HZ  = 50000000,             // the clock',
    '    parameter TICK    = CLK_HZ / 8,           // an expression',
    '    parameter SW_LOW  = 0                     // the switches'].join('\n');
  const w = setGenericDefaults(v, 'verilog', { CLK_HZ: 12_000_000, TICK: 3, SW_LOW: true });
  assert.deepEqual(w.changed, ['CLK_HZ', 'SW_LOW']);
  assert.equal(w.text, [
    '    parameter CLK_HZ  = 12000000,             // the clock',
    '    parameter TICK    = CLK_HZ / 8,           // an expression',
    '    parameter SW_LOW  = 1                     // the switches'].join('\n'));
  // (a default already of that value: kept as written, nothing changed)
  assert.deepEqual(setGenericDefaults(vhd, 'vhdl', { CLK_HZ: 50_000_000, BTN_LOW: false }), { text: vhd, changed: [] });
  assert.deepEqual(setGenericDefaults(v, 'verilog', { SW_LOW: false }), { text: v, changed: [] });
});

test('#3710 the top\'s file, by its entity or module; none for a name no file declares', () => {
  const sources = [{ path: 'a.vhd', lang: 'vhdl', text: 'entity sub is end;\nentity Top is\nend;' }, { path: 'b.v', lang: 'verilog', text: 'module top2 (input a);\nendmodule' }];
  assert.equal(topFileOf(sources, 'top').path, 'a.vhd');
  assert.equal(topFileOf(sources, 'top2').path, 'b.v');
  assert.equal(topFileOf(sources, 'top3'), null);
  assert.equal(topFileOf(sources, ''), null);
  assert.equal(topForBoard(sources, 'top3', resolveBoard('mimas-v2')), null);
});

// the counters' widths of a design: { signal name: bits } for the names asked
const widths = (des, names) => Object.fromEntries(names.map(n => [n, des.signals.find(s => s.path === `${des.top.name}.${n}`)?.t?.w]));

test('#3710 every clocked example\'s top for the Mimas V2 and the Nexys3: the board\'s values, elaborated with no error or warning', () => {
  // (isqrt and micro80 have switches only, uart a button only; gates, a combinational schematic, none of them)
  const ALL = ['CLK_HZ', 'BTN_LOW', 'SW_LOW'];
  const MIMAS = { traffic: ALL, blinky: ALL, pong: ALL, stopwatch: ALL, clock: ALL, vga: ALL, isqrt: ['CLK_HZ', 'SW_LOW'], uart: ['CLK_HZ', 'BTN_LOW'], micro80: ['CLK_HZ', 'SW_LOW'] };
  for (const name of EXAMPLES) {
    const ex = example(name);
    for (const board of ['mimas-v2', 'nexys3']) {
      const top = topForBoard(ex.design, ex.project.top, resolveBoard(board));
      if (name === 'gates') { assert.equal(top, null, `${name} on ${board}`); continue; }
      assert.deepEqual(top.changed, board === 'nexys3' ? ['CLK_HZ'] : MIMAS[name], `${name} on ${board}`);
      const sources = ex.design.map(s => (s.path === top.path ? { ...s, text: top.text } : s));
      const lib = compile(sources);
      const des = elaborate(lib, ex.project.top);
      assert.deepEqual([...lib.errors, ...des.diags].map(d => `${d.severity}: ${d.message}`), [], `${name} on ${board}`);
    }
  }
});

test('#3710 the Verilog counters sized by the clock: the Basys2\'s widths at 50 MHz, wider at 100 MHz', () => {
  const ex = example('clock');
  const lib = compile(ex.design);
  // (digital_clock's tick, the debouncers' count, the display's count)
  const at = g => widths(elaborate(lib, 'digital_clock', { generics: g }), ['tick', 'db0.count', 'display.count']);
  assert.deepEqual(at({}), { tick: 26, 'db0.count': 20, 'display.count': 16 });
  assert.deepEqual(at({ CLK_HZ: 100_000_000 }), { tick: 27, 'db0.count': 21, 'display.count': 17 });
  assert.deepEqual(at({ CLK_HZ: 12_000_000 }), { tick: 24, 'db0.count': 18, 'display.count': 14 });
  const pong = example('pong');
  const p = g => widths(elaborate(compile(pong.design), 'pong', { generics: g }), ['period', 'timer', 'beatCount']);
  assert.deepEqual(p({}), { period: 23, timer: 23, beatCount: 23 });
  assert.deepEqual(p({ CLK_HZ: 100_000_000 }), { period: 24, timer: 24, beatCount: 24 });
});

// the clock example made for the Mimas V2, run with a 1 kHz "board clock" (a second = 1000 cycles): SW0 ON (a 0) resets
// it, OFF (a 1) lets it run, its seconds count on LD5..LD0; a press (a 0) of BTN2 adds a minute
test('#3710 the clock made for the Mimas V2: a second is CLK_HZ cycles, its active-low switches and buttons', () => {
  const ex = example('clock');
  const top = topForBoard(ex.design, 'digital_clock', resolveBoard('mimas-v2'));
  const fast = top.text.replace('parameter CLK_HZ  = 100000000,', 'parameter CLK_HZ  = 1000,     ');
  const tb = `\`timescale 1ns / 1ps
module tb;
    reg clk = 1'b0;
    reg [1:0] sw = 2'b10;                     // SW0 ON (a 0): in reset
    reg [3:0] btn = 4'b1111;
    wire [7:0] led; wire [6:0] seg; wire [3:0] an; wire dp;
    digital_clock uut (.clk(clk), .sw(sw), .btn(btn), .led(led), .seg(seg), .an(an), .dp(dp));
    always #10 clk = ~clk;
    initial begin
        repeat (5) @(posedge clk);
        sw[0] = 1'b1;                         // SW0 OFF: the clock runs
        repeat (3500) @(posedge clk);
        if (led[5:0] !== 6'd3) $display("ERROR: seconds %0d, expected 3", led[5:0]);
        if (uut.min !== 6'd0) $display("ERROR: minutes %0d, expected 0", uut.min);
        btn[2] = 1'b0;
        repeat (100) @(posedge clk);
        btn[2] = 1'b1;
        repeat (100) @(posedge clk);
        if (uut.min !== 6'd1) $display("ERROR: minutes %0d after BTN2, expected 1", uut.min);
        sw[0] = 1'b0;
        repeat (10) @(posedge clk);
        if (led[5:0] !== 6'd0 || uut.min !== 6'd0) $display("ERROR: SW0 ON: not in reset");
        $display("Simulation finished OK");
        $finish;
    end
endmodule
`;
  const all = [...ex.design.map(s => (s.path === top.path ? { ...s, text: fast } : s)), { path: 'tb.v', lang: 'verilog', role: 'sim', text: tb }];
  const lib = compile(all);
  const des = elaborate(lib, 'tb');
  assert.deepEqual([...lib.errors, ...des.diags].map(d => d.message), []);
  const sim = new Simulator(des, { files: new Map(all.map(s => [s.path, s.text])) });
  for (const s of des.signals) s.wave = null;
  sim.run(1e9);
  const log = sim.log.map(e => e.text);
  assert.deepEqual(log.filter(l => /ERROR/.test(l)), []);
  assert.ok(log.includes('Simulation finished OK'), log.slice(-3).join('\n'));
});

// a board whose digit enables are active high (#3884): the EDGE Spartan 6's pin table (PR 3874) as the test's own, its
// segments and decimal point active low as every board's
const EDGE = { resources: [
  { name: 'clk', pins: ['P84'], dir: 'in', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'sw', pins: ['P22', 'P21'], dir: 'in', group: 'Switches' },
  { name: 'btn', pins: ['P40', 'P41'], dir: 'in', group: 'Buttons', extra: { activeHigh: true } },
  { name: 'seg', pins: ['P143', 'P142', 'P141', 'P140', 'P139', 'P138', 'P137'], dir: 'out', group: '7-segment', extra: { activeLow: true } },
  { name: 'dp', pins: ['P134'], dir: 'out', group: '7-segment', extra: { activeLow: true } },
  { name: 'an', pins: ['P127', 'P131', 'P132', 'P133'], dir: 'out', group: '7-segment', extra: { activeHigh: true } }] };

test('#3884 the digit enables\' level: AN_LOW false where the board says activeHigh, else true; none with no display', () => {
  assert.deepEqual(boardGenericValues(EDGE), { CLK_HZ: 50_000_000, BTN_LOW: false, SW_LOW: false, AN_LOW: false });
  const an = extra => boardGenericValues({ resources: [{ name: 'an', pins: ['A1'], dir: 'out', group: '7-segment', extra }] });
  assert.deepEqual(an(undefined), { AN_LOW: true });
  assert.deepEqual(an({ activeLow: true }), { AN_LOW: true });
  assert.deepEqual(an({ activeHigh: true }), { AN_LOW: false });
  // (the segments are not the enables: no AN_LOW)
  assert.equal(boardGenericValues({ resources: EDGE.resources.filter(r => r.name !== 'an') }).AN_LOW, undefined);
  for (const b of BOARDS) {
    const r = resolveBoard(b.id);
    assert.equal(boardGenericValues(r).AN_LOW, r.resources.some(x => x.name === 'an') ? true : undefined, b.id);
    // (every board's segments and decimal point are active low: no SEG_LOW needed)
    for (const x of r.resources.filter(x => x.name === 'seg' || x.name === 'dp')) assert.ok(x.extra?.activeLow, `${b.id} ${x.name}`);
  }
});

test('#3884 every example with a display made for the EDGE: AN_LOW false, in VHDL and Verilog, elaborated with no error or warning', () => {
  const WITH = ['traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'isqrt', 'uart', 'micro80'];
  for (const name of EXAMPLES) {
    const ex = example(name);
    const top = topForBoard(ex.design, ex.project.top, EDGE);
    if (!WITH.includes(name)) { assert.equal(top, null, name); continue; }
    assert.deepEqual(top.changed, ['AN_LOW'], name);
    assert.match(top.text, top.lang === 'verilog' ? /parameter AN_LOW\s+= 0 / : /AN_LOW\s+: boolean := false \);/, name);
    assert.match(topForBoardText(top, 'EDGE Spartan 6'), /, the EDGE Spartan 6's clock, inputs and display \(the defaults of its generics\)\.$/);
    const sources = ex.design.map(s => (s.path === top.path ? { ...s, text: top.text } : s));
    const lib = compile(sources);
    const des = elaborate(lib, ex.project.top);
    assert.deepEqual([...lib.errors, ...des.diags].map(d => `${d.severity}: ${d.message}`), [], name);
  }
});


// a top (its text) with a test bench run for 8 digits' time: { warnings, log lines }
function displayRun(ex, topPath, topText, tb) {
  const all = [...ex.design.map(s => (s.path === topPath ? { ...s, text: topText } : s)), { path: tb.path, lang: tb.lang, role: 'sim', text: tb.text }];
  const lib = compile(all);
  const des = elaborate(lib, 'tb');
  const diags = [...lib.errors, ...des.diags];
  assert.deepEqual(diags.filter(d => d.severity === 'error').map(d => d.message), []);
  const sim = new Simulator(des, { files: new Map(all.map(s => [s.path, s.text])) });
  for (const s of des.signals) s.wave = null;
  sim.run(5e6);
  return { warnings: diags.filter(d => d.severity === 'warning').map(d => d.message), log: sim.log.map(e => e.text) };
}

// every example's display (REFRESH: 8 cycles) from a Verilog test bench, its digit enables shown once a digit; only the
// clock connected, the inputs left open (the display does not read them)
const enablesTb = top => ({ path: 'tb.v', lang: 'verilog', text: `\`timescale 1ns / 1ps
module tb;
    reg clk = 1'b0;
    wire [3:0] an;
    integer i;
    ${top} #(.REFRESH(8)) uut (.clk(clk), .an(an));
    always #10 clk = ~clk;
    initial begin
        #85;
        for (i = 0; i < 8; i = i + 1) begin
            $display("an=%b", an);
            #160;
        end
        $finish;
    end
endmodule
` });

test('#3884 every example\'s display at both levels: AN_LOW true (the Basys2), a digit on at 0; false (the EDGE), at 1', () => {
  const OPEN = { traffic: ['sw', 'btn'], blinky: ['sw', 'btn'], pong: ['sw', 'btn'], stopwatch: ['sw', 'btn'], clock: ['sw', 'btn'], isqrt: ['sw'], uart: ['rx', 'btn'], micro80: ['sw'] };
  const turns = values => [...values, ...values].map(v => `an=${v}`);
  for (const [name, open] of Object.entries(OPEN)) {
    const ex = example(name);
    const top = topForBoard(ex.design, ex.project.top, EDGE);
    for (const [text, an, board] of [[ex.design.find(s => s.path === top.path).text, ['1110', '1101', '1011', '0111'], 'the Basys2'], [top.text, ['0001', '0010', '0100', '1000'], 'the EDGE']]) {
      const { warnings, log } = displayRun(ex, top.path, text, enablesTb(ex.project.top));
      assert.deepEqual(warnings, open.map(p => `input port '${p}' of 'uut' is not connected`), `${name} on ${board}`);
      assert.deepEqual(log.filter(l => /^an=/.test(l)), turns(an), `${name} on ${board}`);
    }
  }
});

// the stopwatch from a VHDL test bench: its digit enables sampled once a digit, each a single digit on at the level
// (high: '1' lights it), the four in turn
const vhdlTb = high => ({ path: 'tb.vhd', lang: 'vhdl', text: `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
entity tb is
end tb;
architecture sim of tb is
    signal clk : STD_LOGIC := '0';
    signal sw  : STD_LOGIC_VECTOR (0 downto 0) := "0";
    signal btn : STD_LOGIC_VECTOR (3 downto 0) := "0000";
    signal led : STD_LOGIC_VECTOR (7 downto 0);
    signal seg : STD_LOGIC_VECTOR (6 downto 0);
    signal dp  : STD_LOGIC;
    signal an  : STD_LOGIC_VECTOR (3 downto 0);
begin
    uut: entity work.stopwatch generic map ( CS => 1000, STABLE => 2, REFRESH => 8 )
        port map ( clk => clk, sw => sw, btn => btn, led => led, seg => seg, dp => dp, an => an );
    clk <= not clk after 10 ns;
    process
        variable lit, seen : STD_LOGIC_VECTOR (3 downto 0) := "0000";
    begin
        wait for 85 ns;
        for i in 0 to 7 loop
            lit := ${high ? 'an' : 'not an'};
            if lit /= "0001" and lit /= "0010" and lit /= "0100" and lit /= "1000" then
                report "ERROR: not a single digit on" severity error;
            end if;
            seen := seen or lit;
            wait for 160 ns;
        end loop;
        if seen = "1111" then report "Simulation finished OK" severity note;
        else report "ERROR: not every digit on in turn" severity error; end if;
        wait;
    end process;
end sim;
` });

test('#3884 the stopwatch\'s display from a VHDL test bench, on the Basys2 and the EDGE: a single digit on at the board\'s level', () => {
  const ex = example('stopwatch');
  const top = topForBoard(ex.design, 'stopwatch', EDGE);
  for (const [text, high, board] of [[ex.design.find(s => s.path === top.path).text, false, 'the Basys2'], [top.text, true, 'the EDGE']]) {
    const { warnings, log } = displayRun(ex, top.path, text, vhdlTb(high));
    assert.deepEqual(warnings, [], board);
    assert.deepEqual(log.filter(l => /ERROR/.test(l)), [], board);
    assert.ok(log.some(l => /Simulation finished OK/.test(l)), `${board}: ${log.slice(-3).join('\n')}`);
    // (sampled at the other level: never a single digit on)
    assert.ok(displayRun(ex, top.path, text, vhdlTb(!high)).log.some(l => /ERROR: not a single digit on/.test(l)), `${board}, the other level`);
  }
});
