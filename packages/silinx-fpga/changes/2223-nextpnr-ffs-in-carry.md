In short:

- **`--engine nextpnr` takes fewer slices:** flip-flops alone share the carry chains' slices, and a chain's carry in at 1 costs no LUT.

In detail:

- **The nextpnr engine's packing, flip-flops in carry slices (#2223):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now
  nextpnr-spartan v0.10.0. A flip-flop alone takes a free place of a chain's slices when BX / BY is free or carries the same net and the
  control set suits (fpga/pack-luts.js's way); a chain's carry in at 1 comes from the CLB's VCC site (XDL's `vcc` net to BX); a stage's
  constant select reads a LUT giving it. src/fpga/nextpnr-xdl.js needs no change: its settings for those slices are checked.
  - **Research:** research/nextpnr-s3e/ffcarry.v.
  - **Tests:** test/nextpnr-engine.test.js (test/fixtures/nextpnr-engine/ffcarry.*: the mixed slices' settings, the `vcc` net; the VGA example's size).
