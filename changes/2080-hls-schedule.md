In short:

- **Silinx HLS, the clock:** a function too slow for the clock is split over cycles, its latency following the clock as
  Vitis HLS's, its paths shorter; the ASM chart shows the same states.

In detail:

- **Silinx HLS, states split by the clock (#2080):** `core/c-schedule.js` chains a state's operations while they fit the
  period less its uncertainty; a state that does not fit becomes a chain of states, the values crossing them in registers
  of their own and the C's registers written in its last state, so the results are the same. A state that accesses a memory
  or a stream, and a pipelined loop's, are not split yet. A multiplication by a power of 2 counts as wiring.
