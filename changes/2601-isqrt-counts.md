In detail:

- **Tests: isqrt's netlist counts after #2272 (#2601):** the Silinx HLS's state machine as a `case` makes isqrt's
  machine a little smaller (277 cells instead of 279, 74 LUTs on the Spartan-6 instead of 77, the same slices);
  `compiled-words.test.js` and `s6-pack.test.js` record the new counts.
