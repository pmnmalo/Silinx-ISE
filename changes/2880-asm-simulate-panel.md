In short:

- **Simulate an ASM chart:** the ASM chart editor has a *Simulate* panel, as the state diagram's: set the inputs and
  the reset, apply clock edges (one, *Run* at a chosen rate, *Back*), and see the state, the path taken through the
  decisions, the conditional outputs reached and the next state on the chart, the Moore and Mealy outputs, the
  registers and the last cycles.

In detail:

- **The ASM chart's Simulate panel (#2880):** `core/asm-sim.js` simulates a chart cycle by cycle with its generated
  HDL's semantics (Verilog's widths, the every-cycle blocks before the state's assignments, the synchronised inputs,
  the synchronous or asynchronous reset), checked against the VHDL and the Verilog simulated, on the examples' charts
  and on edge cases (`test/asm-sim.test.js`); `web/js/asm-sim.js` is its panel (foldable, over the canvas on a narrow
  screen), sharing its inputs' controls and its trace with the state diagram's (`web/js/sim-panel.js`); a chart with
  errors is not simulated, its errors in the console; the editor's `showPanel('sim')` and `panel` open it and say
  whether it is open (a design link's `view=try`, #2881). The MCP server's `simulate_drawing` steps an ASM chart or a state diagram as their
  panels do. In both interfaces and in Portuguese (`test/ui/asm-sim.test.js`).
