In detail:

- **`sliceEstimate` exact on the examples (#3389):** a carry stage that takes a copy of its select's LUT (or a LUT
  passing it through) no longer reads the select, so a later stage on it takes the LUT itself, as nextpnr's `stage_lut`
  (a LUT on two chains' selects was a LUT more); a flip-flop's control set has the slice's CLKINV, CEINV and SRINV
  (an inverter on the pin, `IS_<pin>_INVERTED`, a `_1` cell), as `same_mode`. On the ten examples the estimate is
  nextpnr 1.5.2's count (pong, stopwatch, clock and vga one slice fewer than before).
