In short:

- **`--engine nextpnr` packs as tightly as Silinx's own engine:** smaller and faster results, clocks on the global lines.

In detail:

- **The nextpnr engine's packing (#2196):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.7.1, whose micro-architecture fills a slice's free places with unrelated LUTs and flip-flops, the critical connections
  first (fpga/pack-luts.js's way), reads a shared LUT by a copy in carry stages and F5s (pack-slices.js `lutFor`), leaves out
  a carry stage whose select is the constant 1, takes a carry out read by logic out by XB / YB, and routes a global buffer's
  clock pins on its global lines before everything else.
  - **src/fpga/nextpnr-xdl.js** writes XBUSED / YBUSED, and COUTUSED only when the chain goes on; **research/nextpnr-s3e/lib.mjs**'s
    simCheck simulates XB and YB.
  - **Tests:** test/nextpnr-s3e.test.js (the VGA example's routed design) and test/nextpnr-engine.test.js (built with the engine).
