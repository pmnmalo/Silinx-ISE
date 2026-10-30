In short:

- **The nextpnr engine takes distributed RAMs and shift registers:** RAM16X1S, RAM16X1D, RAM32X1S and the SRL16 family.

In detail:

- **The nextpnr engine: the SLICEM's memories (#2191):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.9.1. **src/fpga/nextpnr-mem.js** (new) writes the memories' settings as Silinx's packer does; **src/open-flow-nextpnr.js** (Map)
  accepts the cells; **research/nextpnr-s3e/lib.mjs**'s simCheck simulates their contents. RAM64X1S is still refused at Map.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
