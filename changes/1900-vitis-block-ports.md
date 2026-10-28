In short:

- **Silinx HLS:** the block-level ports are Vitis HLS's: `#pragma HLS INTERFACE ap_ctrl_none port=return` on a
  sequential or DATAFLOW top, and a top of `hls::task`s, have no `ap_start` / `ap_done` / `ap_idle` / `ap_ready`
  (the module runs by itself, with only `ap_clk` and `ap_rst`); a combinational top has no clock nor reset.

In detail:

- **Silinx HLS: the block-level ports as Vitis HLS's (#1900):** a DATAFLOW top with `ap_ctrl_none` and a stream
  argument, a data-driven top (every process an `hls::task`) and a sequential top with `ap_ctrl_none` and a stream
  argument have only `ap_clk` and `ap_rst` (`ap_start` 1 inside: a call after the other); without a stream argument
  `ap_ctrl_hs` is kept, with the warning a sequential function already had. A combinational top has no `ap_clk` nor
  `ap_rst`, nor its co-simulation's test bench. The co-simulation feeds a free-running module's streams and waits for
  each call's values; View C Synthesis Report says `ap_ctrl_none (ap_clk, ap_rst: running by itself)`. The HLS
  corpus: modeling-free-running-kernel-remerge-ii4to1 and task-level-parallelism-data-driven-simple-data-driven now
  have Vitis HLS's ports (15 designs with the same ports with #1902's, 12 before).
