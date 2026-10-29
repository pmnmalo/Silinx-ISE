In detail:

- **Spartan-6: the clock pads, the BUFGs and the CMT sites (#727):** a clock pad's bits (the BUFGMUX's input selection in
  the REGC frame, its clock input in the I/O words: research/s6/db/s6-clocks.json, ana-clock6.mjs), the global clocks'
  spine PIPs (s6-pips-other.json, s6-pips-clock.json), measured with ISE on a BUFG at each BUFGMUX from each clock pad
  (gen-clock6.mjs --bufg); a DCM's and a PLL's bits at minor 30 of the CMT column in their row on both parts. The
  examples' and the clock designs' residual keeps no clock bit but the clock example's clock-row bits. Tests:
  test/s6-clock.test.js.
