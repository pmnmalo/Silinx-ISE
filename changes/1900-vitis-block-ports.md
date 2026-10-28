In short:

- **Silinx HLS:** the block-level ports are Vitis HLS's: `#pragma HLS INTERFACE ap_ctrl_none port=return` on a
  sequential or DATAFLOW top, and a top of `hls::task`s, have no `ap_start` / `ap_done` / `ap_idle` / `ap_ready`
  (the module runs by itself); a combinational module has `ap_rst` (not read) and no `ap_clk`.

In detail:

- **Silinx HLS: the block-level ports as Vitis HLS 2025.2's (#1900):** a DATAFLOW top with `ap_ctrl_none` and a
  stream argument, a data-driven top (every process an `hls::task`) and a sequential top with `ap_ctrl_none` and a
  stream argument have only `ap_clk` and `ap_rst` (`ap_start` 1 inside: a call after the other); without a stream
  argument `ap_ctrl_hs` is kept, with the warning a sequential function already had. A combinational `ap_ctrl_hs`
  module has `ap_rst` after `ap_ready` and no `ap_clk`, as Vitis HLS's latency-0 modules. The co-simulation feeds a
  free-running module's streams and waits for each call's values; View C Synthesis Report says
  `ap_ctrl_none (ap_clk, ap_rst: running by itself)`. The HLS corpus: 16 designs with Silinx's ports the same as
  Vitis's (12 before): modeling-free-running-kernel-remerge-ii4to1,
  task-level-parallelism-data-driven-simple-data-driven and pipelining-functions-function-instantiate now are.
