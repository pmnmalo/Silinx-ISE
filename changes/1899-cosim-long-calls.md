In short:
- **Silinx HLS, C/RTL Co-simulation:** a design that takes many cycles in a call (a matrix product made 16 times) is no
  longer stopped at 100000 cycles: it runs to its end, as in Vitis HLS.

In detail:
- **Silinx HLS: a co-simulated call's limit of cycles is its C simulation's steps (#1899):** a call stops at 100000
  cycles, or at as many cycles as the steps its C simulation took when it took more (each call of the top records its
  steps, `calls[k].steps`). The corpus's partitioned matrix products (`ARRAY_PARTITION` block, cyclic, complete) did
  not hang: they end after 221257 and 282441 cycles (Vitis HLS: about 9000, its loops pipelined) and their results are
  the C's; the HLS corpus's table says so.
