In short:

- **More designs through nextpnr:** a block RAM with 36-bit ports beside the multipliers, two shift registers with no
  enable in one slice, a carry chain that reads its own select, and two DCMs on opposite edges now build with the
  nextpnr engine, with no warning.

In detail:

- **nextpnr-spartan v0.17.0 (#2626, #2628, #2656):** nextpnr's router no longer loops on a carry multiplexer whose DI
  is its own select or on a 36-bit block RAM beside its tile's multiplier, a slice's two memories share one enable
  constant, and a DCM's clock input from the other edge is routed with no warning.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js.
