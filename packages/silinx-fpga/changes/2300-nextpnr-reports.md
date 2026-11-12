In detail:

- **nextpnr's timing for the iCE40, the ECP5 and the Gowin (#2300):** the back ends have a timing step (`trce`, Generate
  Post-Place & Route Static Timing) and their Place & Route writes nextpnr's report (open/nextpnr-report.json, its clocks
  added), the timing (report.timing: `engine: 'nextpnr'`, the clocks, the constraints asked), open/timing.txt and
  open/paths.json in timing-paths.js's shape (nextpnr-timing.js: nextpnrTiming, nextpnrPaths, nextpnrTimingText,
  mountNextpnrTiming): a stage's cell is the synthesized netlist's that drives the net after it (or the flip-flop of a setup),
  through nextpnr's names of the nets (name[i], the I/O buffers' $SB_IO_IN… suffixes) and of its packed cells (_LC, _DFFLC,
  $CARRY), and so cellSources' lines and signals. nextpnr-ice40 and nextpnr-ecp5 run with `--timing-allow-fail`; the Gowin's,
  whose routed designs carry the setting (the examples' references), runs again with it only when a clock fails its
  constraint. The Gowin's utilization leaves out GND, VCC, GSR and DUMMY_CELL (gowinPlaced); the iCE40's clocks are named by
  their ports.
