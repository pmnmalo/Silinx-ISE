In short:

- **Silinx HLS, ap_fifo and ap_hs pointers:** a read of a FIFO or a handshake now takes one cycle with what is
  computed from its value, as in Vitis HLS (the Vitis HLS examples' stream_good: 13 cycles → 6, as Vitis HLS's).

In detail:

- **A stream's read in the state of what computes with its value (#2967):** a read of an `hls::stream`, or of a
  pointer with `INTERFACE ap_fifo` or `ap_hs`, is made in the state of the statements before it that only compute
  and of those after it, its value chained into them; the state is held while the FIFO is empty (nothing written).
  Split by the clock, the chain waits in its first state and takes the value in its last. A state with nothing in it
  before `ap_done` is skipped. The HLS corpus's modeling-pointers-stream-good 13 → 6 cycles (Vitis HLS 6),
  stream-better 13-14 → 6-9 (Vitis HLS 5: its write in a read's cycle; the co-simulation's `_ap_ack` not always
  there); the designs with streams faster too, none below Vitis HLS: the task-level-parallelism ones (simple-data-driven
  60 → 45, using-stream-of-blocks 602-603 → 430-431, …), axi-stream-to-master 24619 → 18648, the side-channel ones
  6-7 → 6.
