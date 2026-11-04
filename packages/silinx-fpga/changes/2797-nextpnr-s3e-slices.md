In detail:

- **nextpnr-spartan v0.18.0 (#2797): no more slices than Silinx's engine.** The spartan3e micro-architecture made a LUT
  for each constant input; it now routes those that need no LUT as `tieConstants` does (a chain's carry in at 0, a pad's
  output, a flip-flop's D through BX / BY: the Y of the nearest slice that holds nothing, or the VCC site that reaches
  the pin), and reads `IS_CE_INVERTED` / `IS_R_INVERTED`… as the slice's CEINV / SRINV (its two flip-flops of one
  polarity). `nextpnrNetlist` turns an inverter on a flip-flop's, latch's or DDR register's control pin into that pin's
  inversion (`lowerControlInverters`, as `pack-prep.js`), the converter writes `CE_B` / `SR_B` (slices and IOBs), and
  `xdlSize` no longer counts a constant 0's source slice (`_NO_USER_LOGIC`) as occupied. `research/nextpnr-s3e/lib.mjs`'s
  simulator takes the inversions too. Test designs: `research/nextpnr-s3e/consts.v`. Tests: test/nextpnr-engine.test.js,
  test/nextpnr-s3e.test.js, test/nextpnr-hard.test.js.
