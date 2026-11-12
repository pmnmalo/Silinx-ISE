In short:

- The open synthesis's count of a design's slices is the count nextpnr packs on every example: pong, stopwatch, clock and vga were one slice over.

In detail:

- **The slice estimate exact on the examples (#3389):** `sliceEstimate` (`packages/silinx-fpga/src/slice-estimate.js`)
  follows two more of nextpnr spartan3e 1.5.x's rules. A carry stage whose select's LUT it cannot take (the LUT feeds
  other loads and the stage's sum is used) gets a copy of that LUT and no longer reads it, so a later stage on the same
  select takes the LUT itself (`stage_lut`): a LUT on two chains' selects was counted as a LUT more. And a flip-flop's
  control set has the slice's CLKINV, CEINV and SRINV: a flip-flop on a net and one on its inverse (by an inverter, its
  `IS_<pin>_INVERTED` or a `_1` cell) do not share a slice (`same_mode`). The ten examples, synthesized for the
  Spartan-3E and packed by nextpnr 1.5.2: the estimate is nextpnr's count on each (pong 224, stopwatch 192, clock 195,
  vga 121 slices: one slice fewer than before, the others unchanged); `test/slice-estimate.test.js` checks it.
