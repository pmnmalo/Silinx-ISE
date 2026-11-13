// An example's top made for another board (#3710, core/board-generics.js): the board's clock (CLK_HZ) and its buttons'
// and switches' levels (BTN_LOW, SW_LOW) from its pin table; the defaults of a top's generics rewritten in VHDL and in
// Verilog, a default already of that value, a default that is an expression and a missing generic left as written, the
// comments kept in their column; every clocked example's top for the Mimas V2 (100 MHz, active-low inputs) and the
// Nexys3 elaborated with them, its counters sized for them, with no error or warning; the clock example made for the
// Mimas V2 simulated: a second is CLK_HZ cycles, its reset and 24-hour switches OFF read 1, a pressed button is a 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardGenericValues, setGenericDefaults, topFileOf, topForBoard } from '../core/board-generics.js';
import { resolveBoard } from '../server/devices.js';
import { BOARDS } from '../server/boards.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { EXAMPLES, example } from './examples-lib.mjs';

test('#3710 the board\'s values: its clock in Hz (whole kHz), its buttons\' and switches\' levels', () => {
  const v = id => boardGenericValues(resolveBoard(id));
  assert.deepEqual(v('basys2'), { CLK_HZ: 50_000_000, BTN_LOW: false, SW_LOW: false });
  assert.deepEqual(v('nexys3'), { CLK_HZ: 100_000_000, BTN_LOW: false, SW_LOW: false });
  assert.deepEqual(v('mimas-v2'), { CLK_HZ: 100_000_000, BTN_LOW: true, SW_LOW: true });
  // (its DIP switches are "dip": the board's Switches, as boardAutoAssign finds them)
  assert.deepEqual(v('elbert-v2'), { CLK_HZ: 12_000_000, BTN_LOW: true, SW_LOW: true });
  assert.deepEqual(v('icebreaker'), { CLK_HZ: 12_000_000, BTN_LOW: false, SW_LOW: false });
  // (no switches: no SW_LOW)
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
