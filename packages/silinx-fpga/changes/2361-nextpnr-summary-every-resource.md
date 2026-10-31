In detail:

- **The nextpnr engine's Design Summary: every resource (#2361):** its map report lists the RAMB16s, the MULT18X18SIOs and
  the DCMs too, used or not, in the MAP report's order, as the Silinx engine's (#795); it had the flip-flops, LUTs,
  slices, IOBs and BUFGMUXs only.
  - **Tests:** test/open-toolchain.test.js (blinky's report through the default engine, every resource).
