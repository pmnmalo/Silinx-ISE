In short:

- **iCE40, ECP5 and Gowin: the timing in the reports.** Implement now shows nextpnr's timing in the Design Summary (each
  clock's frequency, its constraint met or not), and the new Generate Post-Place & Route Static Timing process writes the
  Static Timing Report: nextpnr's critical path of each clock, stage by stage, back to the source lines, in its Paths panel
  (Show Path marks the lines and the drawings' elements) and through the MCP's `get_report` and `timing_paths`.

In detail:

- **nextpnr's reports for the iCE40, the ECP5 and the Gowin (#2300).** Place & Route keeps nextpnr's report
  (build/open/nextpnr-report.json) and writes the timing from it: the Design Summary's (a clock its constraints ask for
  with its constraint; nextpnr's default 12 MHz, or a Gowin clock no constraint names, with none), the Static Timing
  Report (build/open/timing.txt: the clocks, the critical path of each clock, from the inputs to a clock, from a clock to
  the outputs and from the inputs to the outputs) and the paths of the Paths panel and of `timing_paths`
  (build/open/paths.json), each stage's cell the synthesized netlist's (the cell that drives the net after it, the
  flip-flop a setup is at) and so its source lines and its signals, as the Spartan flows'. The timing process writes them
  again from an earlier run. nextpnr keeps one critical path per clock: the panel lists that one. A clock slower than its
  constraint no longer fails Place & Route: nextpnr's warning, then the timing process's (`WARNING:Timing - the clock clk
  reaches 79.74 MHz, not the 500 MHz of its constraint.`). The Gowin's utilization leaves out nextpnr's constants, the global
  set / reset and its placeholders (GND, VCC, GSR, DUMMY_CELL), none of the device's resources. The iCE40's clock is named by
  its port (clk, not clk$SB_IO_IN_$glb_clk). The FPGA view of these families is not there yet: nextpnr's outputs give the
  placement of the cells, not the chip's layout.
