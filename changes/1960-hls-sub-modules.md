In short:

- **Silinx HLS:** a function with `#pragma HLS INLINE off` is a module of its own, shared by its calls, as in Vitis HLS,
  and the C Synthesis Report lists each function's calls, latency and resources. `INLINE recursive` is made too.

In detail:

- **A called function not inlined, a sub-module (#1960):** core/c-submodule.js. `INLINE off` makes the function a module
  with its block protocol, one instance per caller and size of its arrays; a call is a state of the caller's machine
  holding `ap_start` and the arguments until `ap_done`; `ap_return` and pointers' values (at their `_ap_vld`) taken as they
  come; an array or a stream argument's port the callee's during the call. `INLINE recursive` dissolves the functions it
  calls but those with `off`. The report has `latency` and `functions` (calls, latency, states, register bits, memories), a
  loop's cycles with its calls in them; the ASM chart shows the call's wait. DATAFLOW's processes and sub-modules are made
  by the same registry of modules (`moduleRegistry`). A function of latency 0 under a top of latency 0, sharing a global
  with its caller, with a struct argument, with ap_ctrl_chain, or under an AXI master, stays inlined (said). Test: test/c-submodule.test.js.
