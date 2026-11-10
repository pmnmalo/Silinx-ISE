In detail:

- **Optimization Speed: four placements for a design of over 500 slices (#3095).** At Speed (the High effort), the nextpnr
  engine made 8 placements of any design over 100 slices. Each was routed, one after the other. A placement of a large
  design takes minutes. Over 500 slices it now makes 4 (`NEXTPNR_TRIES.highLarge`); up to 500 slices it keeps 8, and up to
  100, 32. Measured on the corpus at Speed, each placement logged: on itc99-b20 (1335 slices, about 6 min a placement) and
  secworks-siphash (686, about 2.5 min), the best of 8 was the best of 4 (36.802 and 15.397 ns), and Place & Route takes
  half as long (b20 48 -> 24 min). vtr-diffeq1 (260 slices) keeps 8 (37.224 -> 37.076 ns from the second four).
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js.
