In short:

- Schematic: a gate, INV, BUF, BUFE / BUFT or multiplexer with a pin per bit shows its type inside each of its shapes
  (AND2 in each of the three AND shapes), as the one-bit symbol does, instead of once under the stack.

In detail:

- **Schematic: pins per bit, the type inside each row (#2122):** wherever the one-bit symbol has its type inside its
  shape (#2041), the pins-per-bit one has it inside each row's shape: the gates (inverted inputs too) in every
  orientation; INV, BUF, BUFE and BUFT near each triangle's base (BUFE5: BUFE in each), upright or turned 180°; M2_1… in
  each trapezoid, upright. Where the one-bit symbol has it outside (a triangle turned 90° / 270°, a turned multiplexer,
  DEMUX), it stays once outside the stack. Tests: test/web-sch-svg.test.js, test/ui/sch-type-rows.test.js.
