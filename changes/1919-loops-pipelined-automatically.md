In short:

- **Silinx HLS:** loops are pipelined automatically, as Vitis HLS's default does (`#pragma HLS PIPELINE off` turns it
  off for a loop); a pipelined loop that reads or writes a memory or a stream takes a cycle per access, not the
  states of its head and step too. The co-simulations of 32 of the HLS corpus's designs take fewer cycles.

In detail:

- **Silinx HLS: loops pipelined automatically (#1919):** a loop with no `PIPELINE` pragma is pipelined by Vitis HLS's
  rule (UG1399, `syn.compile.pipeline_loops` 64): an innermost loop of more iterations than the threshold, or the
  parent of one of the threshold or fewer, the inner loop then unrolled in it; an innermost loop with no parent
  whatever its count (`core/c-pipeline.js`). The threshold is `cToHdl`'s and `cosimulate`'s option `pipelineLoops`
  (0: none); `#pragma HLS PIPELINE off` leaves a loop as it is. A pipelined loop's inner loops of constant count are
  unrolled (a `PIPELINE` pragma's too, where it was not pipelined). A pipelined loop that accesses a memory or a
  stream keeps a state per access, its condition and step in its last state, its states merged when they use no port
  of the same memory or stream, its first state's work in its last for the next iteration when they share no port
  (`s += a[i]`: II=1), an if in it in one state (its memories read before it, its writes and its streams' accesses
  made only on its branch); a state that waits for a stream makes no access and writes nothing while it waits.
  Where II=1 is not met, a warning says the II made and why, as for the pragma; the report says a loop "pipelined
  automatically". The HLS corpus's expectations updated: no design passes fewer stages, the latencies of 32 designs
  lower (the partitioned matrix products 221257 and 282441 cycles to 5705 and 83784; Vitis HLS's 9029 and 9028: the
  partitions `block` and `cyclic` not made yet, #1920). The test design sort's swap loop says `PIPELINE off`.
