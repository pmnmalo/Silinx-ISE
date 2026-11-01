In short:

- **Faster designs through nextpnr:** the examples placed and routed by nextpnr run about 1.4 % faster on average
  (4.2 % short of the Silinx engine's speed, from 5.8 %), at the same size, and place and route about 30 % sooner.

In detail:

- **nextpnr-spartan v0.12.0 (#2196):** the carry chain's delays in nextpnr's chip database are Silinx's slice arcs after
  #2286 (per side of the slice, the XB output's own); router 1 routes the critical connections first, the short ones
  inside a CLB too, and its estimate of a route left is the least a route takes, so the critical connections get the
  CLB's direct connections to the LUT pins. On the examples (28 builds, 8 placements each, Silinx's analysis): periods
  0.9 % shorter at best and 1.4 % on average, the slices unchanged; ISE's DRC clean and Silinx's `.bit` byte-identical to
  ISE's (CRC on and off) on all 28. The gap left is accepted (#2135): nextpnr stays the only engine.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js, test/silinx-fpga-package.test.js,
    test/toolchain-boundary.test.js and the third-party notices' check; test/silinx-fpga-cli.test.js: the README's
    blinky's best placement recorded anew (seed 1, 5.069 ns, was seed 2, 5.040 ns).
