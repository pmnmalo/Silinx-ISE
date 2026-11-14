In short:

- **Numato Elbert V2: the examples' digits in the right order.** The clock and the stopwatch showed their digits in
  reverse order on the Elbert V2: the ones on the leftmost digit.

In detail:

- **The Elbert V2's digit enables right to left (#3847).** Numato's diagram wires `Enable[0]` (P120) to the leftmost
  digit and `Enable[2]` (P124) to the rightmost. The table had `an` in Numato's order, so an example's `an<0>` (the
  ones) lit the leftmost digit. `an` is now P124, P121, P120, its `an<0>` the rightmost digit as on the other boards.
  Tests: the examples' digit pins and ISE's build warnings on the Elbert V2, and ISE's build of the clock for it.
