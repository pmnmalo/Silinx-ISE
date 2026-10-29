In detail:

- **Spartan-6: a shift register's clock bits (#727):** a SLICEM as a shift register or RAM on a clock sets four bits of its
  column's clock row word, measured with ISE (research/s6/residual6.mjs predicts them); with them the residual of the
  examples ISE implemented on both boards keeps no clock bit. The DCM's and PLL's PIPs by PIP drop
  (research/s6/db/s6-pips-other.json). Tests: test/s6-clock.test.js.
