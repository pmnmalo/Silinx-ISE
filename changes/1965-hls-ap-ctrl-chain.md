In short:

- **Silinx HLS:** the block protocol `ap_ctrl_chain` (`#pragma HLS INTERFACE ap_ctrl_chain port=return`), as Vitis HLS
  makes it: `ap_continue`, the module holding `ap_done` and `ap_return` until the next stage takes them.

In detail:

- **Silinx HLS: `ap_ctrl_chain` (#1965):** `ap_ctrl_hs`'s ports and `ap_continue`, in sequential, combinational (with a
  clock, latency 0) and DATAFLOW tops, as Vitis HLS 2025.2's RTL: `ap_done` held until `ap_continue` is 1, no new call
  meanwhile, `ap_ready` one cycle a call, `ap_idle` 0 while `ap_start` is 1. It was accepted and made as `ap_ctrl_hs`.
  The C/RTL co-simulation holds `ap_continue` at 0 after each call and checks all this; the ASM chart and the C
  Synthesis Report show it.
