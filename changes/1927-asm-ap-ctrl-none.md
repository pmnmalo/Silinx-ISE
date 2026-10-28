In short:

- **Silinx HLS:** the ASM chart of a free-running C module (`#pragma HLS INTERFACE ap_ctrl_none port=return`) no
  longer draws the block protocol: its IDLE goes on to the first state at once, and its inputs and outputs are the
  module's ports, with no `ap_start`, `ap_done`, `ap_idle` or `ap_ready`.

In detail:

- **Silinx HLS: the ASM chart of an ap_ctrl_none function (#1927):** View State Machine (ASM) takes the chart's
  inputs and outputs from the ports the HDL is generated with (`core/c-hdl.js`), so the two cannot drift apart (an
  argument Vitis HLS renames, `in` -> `in_r`, has its module's name in the chart too); with `ap_ctrl_none` and a
  stream argument IDLE goes on to the first state with no `ap_start` decision, and neither IDLE nor DONE sets
  `ap_idle`, `ap_done` or `ap_ready`. A function with the block protocol (`ap_ctrl_hs`, the default, or `ap_ctrl_none`
  without a stream, made `ap_ctrl_hs`) keeps its chart.
