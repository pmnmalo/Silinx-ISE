In short:

- Silinx HLS makes a C function whose logic is too slow for the clock a sequential module (with ap_clk and ap_rst), as
  Vitis HLS does; the clock is the board's (20 ns on the Basys2 and the Nexys2), and View C Synthesis Report says it.

In detail:

- **Silinx HLS: the target clock (#1924):** core/c-timing.js estimates the delay of a combinational function's longest
  path (its additions, comparisons, multiplications, multiplexers and shifts) and checks it against the clock less
  Vitis HLS's 27 % uncertainty; core/c-hdl.js makes a top that does not fit a sequential module (core/c-fsmd.js), with
  ap_clk and ap_rst. The clock is cToHdl's `clock` (ns): syn.clock of hls_config.cfg, else Vitis HLS's 10 ns; in the
  IDE the board's oscillator (web/js/c-source.js hlsClock), which the report's "Target clock" line names. The corpus's
  five designs Vitis HLS schedules over cycles now have its ports; dividing the operations among the cycles by the
  clock is #2080. Tests: test/c-timing.test.js, test/c-ports.test.js, test/ui/c-sim.test.js; the tests of combinational
  modules give a slow clock (test/c-helpers.js COMB).
