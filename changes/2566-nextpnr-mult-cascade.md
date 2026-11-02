In short:

- **Cascaded multipliers through nextpnr:** a design whose multipliers pass B up a chain (`MULT18X18SIO` with
  `B_INPUT = CASCADE`) now builds with the nextpnr engine.

In detail:

- **nextpnr-spartan v0.14.0 (#2566):** the multiplier cascade (`BCOUT -> BCIN`) in nextpnr's Spartan-3E
  micro-architecture, a chain on consecutive sites of a block RAM column; Silinx's XDL writes the `B_INPUT` nextpnr sets.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js, packages/silinx-fpga/test/nextpnr-hard.test.js.
