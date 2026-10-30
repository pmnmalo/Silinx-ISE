In short:

- **The nextpnr engine takes wide multiplexers:** `--engine nextpnr` now places and routes MUXF5 and MUXF6.

In detail:

- **The nextpnr engine: MUXF5 and MUXF6 (#2135):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now
  nextpnr-spartan v0.3.0, whose micro-architecture places an MUXF5 with its slice's two LUTs and an MUXF6 with the
  two F5s it reads (MUXF7 and MUXF8 as LUTs for now).
  - **src/fpga/nextpnr-xdl.js** writes F5MUX, F6MUX, F5USED / FXUSED, FXMUX = F5 and GYMUX = FX; **src/open-flow-nextpnr.js**
    (Map) accepts MUXF5 to MUXF8; **research/nextpnr-s3e/lib.mjs**'s simCheck simulates them.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js (the traffic example built with the engine).
