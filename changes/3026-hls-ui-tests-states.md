In detail:

- **Two UI tests of Silinx HLS follow the schedules (#3026):** the ASM chart of a free-running module (c-asm #1927) has
  no S7 since a stream's read is made in the state that computes with its value (#2967): IDLE, S1, DONE, co-simulated.
  The View C Synthesis Report test of the board's clock (c-sim #1924) keeps its four additions in a row with
  `#pragma HLS EXPRESSION_BALANCE off`, so that it tests the clock and the delays, not the balancing (#2613; the
  combinational decision on the balanced sum is #3028).
