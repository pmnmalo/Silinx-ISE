In short:

- **Vivado's critical paths:** AMD Vivado's Timing Summary Report has the Paths panel too: its setup paths, each stage
  back to the HDL lines and the drawings it comes from, by Vivado's netlist names.

In detail:

- **Vivado's report_timing_summary as a source of the paths (#3178):** `core/vivado-paths.js` reads its setup paths
  ("Max Delay Paths") stage by stage and finds each stage's source lines through Vivado's names (`step_reg_reg` →
  `step_reg`, `tens[3]_i_2` → `tens`, `FSM_sequential_state_reg` → `state_reg`, a carry's, a distributed RAM's);
  `core/hdl-drivers.js` looks a name up in the modules above an instance too (a cell named after the net it drives
  outside it) and gives a function's callers. The Paths panel opens beside `build/<top>_timing.rpt` (no FPGA view: a
  7-series device), and the MCP server's `timing_paths` reads the newest analysis of the three toolchains. On Vivado
  2025.2's reports of blinky, traffic, pong and stopwatch every logic stage reaches a source line.
