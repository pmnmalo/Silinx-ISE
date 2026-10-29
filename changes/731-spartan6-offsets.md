In detail:

- **Spartan-6: the OFFSET IN and OUT in the static timing (#731):** research/s6/sta6.mjs computes trce's OFFSET IN
  BEFORE and OUT AFTER on a routed design. It reads the input pads' Tiopi and the output pads' Tioop, and the clock's
  earliest and latest arrival from its pad through its BUFG, fitted on trce's paths (twr6.mjs's parseOffsets). A shift
  register's arcs are among the slice's. On night 1's 24 designs both OFFSETs are within 5% or 0.1 ns of trce's
  allowable offset. Tests: test/s6-sta.test.js.
