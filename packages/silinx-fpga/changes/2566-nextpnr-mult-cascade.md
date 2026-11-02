In detail:

- **nextpnr-spartan v0.14.0 (#2566): the multiplier cascade.** nextpnr now takes a `MULT18X18SIO` whose B comes from the
  multiplier below (`B_INPUT = CASCADE`, `BCOUT -> BCIN`), where it refused it. A chain's multipliers sit on consecutive
  sites of a block RAM column, from its lowest one up, and a LOC on a member is refused, as Silinx's packer does. On
  `feat_mult_chain` (three multipliers in a chain): ISE's DRC clean and Silinx's `.bit` byte-identical to ISE's (CRC on
  and off).
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (the design built through nextpnr, its new fixture
    `mult_chain`), test/silinx-fpga-package.test.js, test/toolchain-boundary.test.js and the third-party notices' check.
