In short:

- **The nextpnr engine takes wide multiplexers:** `--engine nextpnr` now places and routes MUXF5 and MUXF6 (case
  statements, multiplexers of 4 or 8 inputs), so the traffic example builds with it too: six of the seven examples.

In detail:

- **The nextpnr engine: MUXF5 and MUXF6 (#2135):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now
  nextpnr-spartan v0.3.0. Its micro-architecture places an MUXF5 with its slice's two LUTs, and an MUXF6 on a CLB's
  lower slice with the F5s of that slice and the one above (the dedicated F5 -> FXINA / FXINB wires); MUXF7 and
  MUXF8 become LUTs for now. A slice of a carry chain or a wide multiplexer takes no other cluster's cells.
  - **src/fpga/nextpnr-xdl.js** writes F5MUX, F6MUX, F5USED / FXUSED, FXMUX = F5, GYMUX = FX and the selects' BXINV /
    BYINV. **src/open-flow-nextpnr.js** (Map) accepts MUXF5 to MUXF8. **research/nextpnr-s3e/lib.mjs**'s simCheck
    simulates them.
  - **traffic through nextpnr:** 70 slices against Silinx's 66; ISE's DRC with no errors or warnings, trce 8.286 ns;
    the .bit byte-identical to ISE's bitgen; its flip-flops simulate equal to the netlist. gates, blinky, pong, clock
    and vga still pass (blinky 130 slices, was 132).
  - **Tests:** test/nextpnr-s3e.test.js (traffic's F5 / F6 settings and wiring, a complete bitstream, the simulation
    catching an output taken from the LUT instead) and test/nextpnr-engine.test.js (traffic built with the engine).
