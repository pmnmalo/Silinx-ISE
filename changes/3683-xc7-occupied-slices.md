In short:

- **The 7-series' occupied slices counted right:** Place & Route's "Number of occupied Slices" on the Basys 3 and the Nexys
  A7 no longer counts the empty half of each logic tile nextpnr used: 10-20 % fewer (micro80 on the Basys 3 110 -> 91).

In detail:

- **The 7-series' occupied slices: a slice counted only when it holds something (#3683).** The count read nextpnr's FASM,
  where an empty half of a used CLB tile still has its clock-inversion default bit. The details and measures are in the
  toolchain's changelog.
