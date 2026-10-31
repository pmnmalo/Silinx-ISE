In short:

- Silinx HLS makes `INTERFACE ap_fifo` and `ap_hs` on pointer arguments, and two-port memories (`BIND_STORAGE`,
  `storage_type=`, `ram_2p`, `ram_t2p`), with Vitis HLS's port names.

In detail:

- **Silinx HLS: ap_fifo and ap_hs on pointers, two-port memories (#1901):** a pointer or array argument with `ap_fifo`
  has `_din`, `_full_n`, `_write` / `_dout`, `_empty_n`, `_read`, one with `ap_hs` `_ap_vld` and `_ap_ack`, each access a
  state that waits (core/c-fifo.js). `BIND_STORAGE` and `storage_type=` make `ram_2p` and `ram_t2p` memories, inside the
  module too; a memory argument of a loop with `UNROLL` and a `DATAFLOW` top's have both ports, as Vitis HLS's; a
  statement's two reads share a state, unrolled copies not yet. A pipeline's schedule (core/c-pipe-sched.js) has a
  memory's two ports each an access a cycle, in the C's order across them: a pipelined loop's or function's II 1 with
  them (Interface/Memory/ram_uram's). The HLS corpus runs
  with its configs' `syn.directive.interface` lines (`directives` of `cToHdl`, `simulateC`, `cosimulate`).
  Test: test/c-ptr-fifo.test.js.
