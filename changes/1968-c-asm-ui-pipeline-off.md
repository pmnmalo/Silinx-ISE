In detail:

- **The ASM chart's UI test since #1919 (#1968):** its two designs' loops say `#pragma HLS PIPELINE off`, the state machine of a
  state a step the test shows; since #1919 a loop is pipelined unless it says so.
