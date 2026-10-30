In short:

- **The nextpnr engine takes carry chains and constants:** `--engine nextpnr` now places and routes counters, adders
  and comparators (MUXCY / XORCY chains) and designs with constants. The gates, blinky, pong, clock and vga examples
  build with it.

In detail:

- **The nextpnr engine: carry chains and constants (#2135):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is
  now nextpnr-spartan v0.2.1. Its micro-architecture places and routes MUXCY / XORCY chains up a column of slices,
  takes the constants, and adds a carry-in stage when a chain's first DI needs BX.
  - **src/fpga/nextpnr-xdl.js** writes the carry settings (CYINIT, CY0F / CY0G with GNDF / C1VDD, CYMUXF, XORF,
    FXOR / GXOR, COUTUSED). It trims nextpnr's string parameters' trailing space, which had reached the XDL
    (`CY0F::1\ `) and misread the flip-flops' set / reset modes.
  - **src/open-flow-nextpnr.js** (Map) accepts MUXCY, XORCY, GND and VCC.
  - **research/nextpnr-s3e/lib.mjs**'s simCheck simulates the carry.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js (the counter built with the engine).
