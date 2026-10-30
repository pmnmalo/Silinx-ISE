In short:

- **The nextpnr engine uses MUXF7 and MUXF8:** on the CLB's dedicated wires, no longer as LUTs.

In detail:

- **The nextpnr engine: MUXF7 and MUXF8 (#2190):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.6.0, whose packer takes a whole tree of MUXF5 to MUXF8 as one cluster; **research/nextpnr-s3e/lib.mjs**'s simCheck simulates
  them.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
