In detail:

- **Spartan-6: an OLOGIC2's output flip-flop (#2025):** `OMUX::OUTFF`, the register ISE packs into a pad, measured at
  every site of the XC6SLX16 and the XC6SLX45 (`research/s6/gen-ologic6.mjs`, `ana-ologic6.mjs`; 10 designs). It sets
  two bits of its IOI tile, by the tile's layout and the site, and one bit of the HCLK tile its clock passes in its
  column and clock region (`bitdb/s6/s6-ologic.json`, `src/fpga/s6/bitgen-ologic.js`). Its clock paths' PIPs in the
  top, left and right IOI tiles, the slave sites and the HCLK tiles were measured first, one at a time (83 PIPs,
  `bitdb/s6/s6-pips-flow.json`). On the XC6SLX16's 203 CMT and example designs the rules predict 196 bit for bit (122
  before), with 21 bits left over (264) and none predicted that ISE does not set; the XC6SLX45's 184 stay exact.
  - **Tests:** test/s6-ologic.test.js.
- **Spartan-6: a top pad's output pin PIP has no bits (#2372):** `TIOB TIOB_O0 -> TIOB_O0_PINW` carried the bits of the
  OLOGIC2's D1 -> OQ route-through, so an output register in a top-outer IOI tile predicted bit 28,49, which ISE does
  not set. The pin PIP now has no bits, like every other pad's; the route-through keeps its own.
  - **Tests:** test/s6-ologic.test.js.
