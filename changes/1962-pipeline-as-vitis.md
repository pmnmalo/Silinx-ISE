In short:

- **Silinx HLS, `#pragma HLS PIPELINE`:** a loop that accesses a memory, holds a loop or a `continue`, and the top
  function, are pipelined as Vitis HLS pipelines them, a new iteration or call every II cycles; a warning only when the
  II asked cannot be met, saying why.

In detail:

- **PIPELINE of a function, and of a loop with a memory or a loop in it, as Vitis HLS (#1962):** core/c-pipe-sched.js
  schedules a body modulo its II: a memory's port an access a cycle, the operations chained within the clock, pipeline
  registers and valid bits, a dependence (a variable, a memory, the exit) raising the II and said; an exit known late
  squashes what started after it; an element read twice is one read; an array's element written and read back at the
  same index is that value (no mux); an II the ports and the dependences allow, kept when the clock's stages would
  need more (the path then reported as too long for the clock, as any pipelined loop's); a pointer output's `_ap_vld`
  with its value; the ASM chart made from the C (core/c-asm.js) shows a pipelined loop as one state, its statements in it. A loop's cycles are (N - 1) x II + its stages (the report's `depth`). The top
  function's pragma: one pipeline, `ap_ready` ahead of `ap_done`, the report's `pipeline`. A loop with a stream, a
  partitioned array (#1920) or a memory of structs keeps its states as before; a pipelined function's `ap_start` is
  the protocol's, not renamed `ap_start_r` (#1926). A function of ap_ctrl_chain (#1965) keeps its calls one
  after the other, said. Tests: test/c-pipe-sched.test.js (co-simulated in VHDL and Verilog, the warnings asserted,
  overlapping calls in a bench of their own), test/c-pipeline.test.js, test/c-pragma.test.js.
