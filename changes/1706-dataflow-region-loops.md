In short:

- **Silinx HLS:** a loop among a DATAFLOW region's calls is a process of its own, and a process can give a value back
  through an output of the top, as in Vitis HLS.

In detail:

- **DATAFLOW: loops and outputs (#1706):** in a region of streams, a loop among the calls becomes a process
  `Loop_<k>_proc` (core/c-dataflow-loops.js); these regions were refused. A process's pointer output, given an output
  of the top, is that top's port and its `ap_vld`. `#pragma HLS INLINE off` on a function whose array argument has no
  size (`A[]`) inlines it, with a warning, instead of an error. A process's PIPELINE no longer gets the false warning
  that it is inlined in the top. The corpus's `using_free_running_pipeline` now passes with Vitis HLS's ports.
  Test: test/c-dataflow-loops.test.js.
