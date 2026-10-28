In detail:

- **Spartan-6: the clock path, the DCM and the PLL (#727):** designs ISE implements (research/s6/gen-clock6.mjs: a clock
  on every BUFGMUX; gen-dcm6.mjs: a DCM_SP and a PLL_BASE, one setting per design): every global clock's spine and
  row PIPs by PIP drop (research/s6/db/s6-pips-other.json), the DCM's and PLL's settings' bits
  (research/s6/db/xc6slx16-cmt.json, ana-dcm6.mjs). Tests: test/s6-clock.test.js.
