In short:

- **The nextpnr engine takes DCMs:** `--engine nextpnr` now places and routes a DCM_SP or DCM.

In detail:

- **The nextpnr engine: the DCM (#2194):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` has this since nextpnr-spartan
  v0.9.0 (on main through v0.9.1). **src/fpga/nextpnr-dcm.js** (new) writes the settings as Silinx's packer does; **src/open-flow-nextpnr.js** (Map)
  accepts the cells, passes `INST LOC` and gives each DCM clock its derived period; the global buffers of a tile share
  one VCC net; **research/nextpnr-s3e/lib.mjs**'s simCheck takes the DCM's non-clock outputs as inputs.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
