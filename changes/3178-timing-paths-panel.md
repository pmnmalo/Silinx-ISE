In short:

- **The critical path shown:** the Static Timing Report of the Silinx toolchain has a Paths panel: the 20 slowest paths,
  each one's stages (clock-to-out, nets, logic, setup) as a bar against the clock's PERIOD with its slack, and Show Path,
  which marks the HDL lines the path's logic comes from and lights its sites and nets in the FPGA view.

In detail:

- **The slowest paths, stage by stage, back to the source (#3178):** the timing analysis keeps every pass's trace back
  (`fpga/timing.js` `analyze().paths(n)`: the worst path into each flip-flop, slowest first); `fpga/timing-paths.js` gives
  each stage its site, net and source lines (a cell's Yosys `src` in the synthesis Verilog, whose blocks name the source
  process; abc's LUTs and the block RAMs by the named signals on their outputs or the logic they feed) and writes them
  with the timing report (`build/open/paths.json`); the report's Paths panel (`web/js/timing-paths.js`, foldable, over
  the report behind ☰ Paths on a narrow screen), Show Path (the editor's line marks, the FPGA view's `showPath`) and the
  MCP server's `timing_paths` (the list, a path's stages and what Show Path highlights). On blinky, stopwatch, clock, uart
  and micro80 every logic stage of the 20 paths reaches a source line, on pong 260 of 280. ISE's and Vivado's paths
  and the drawings come in later steps.
