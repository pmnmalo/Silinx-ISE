In detail:

- **nextpnr as a Place & Route engine, behind a flag (#2136):** `spec.engine: 'nextpnr'` (the command line's `--engine
  nextpnr`, the local server's flow.json `engine`) gives the open flow's Map and Place & Route to nextpnr-himbaechel with
  the Spartan-3E. The WebAssembly package comes from the fork pmnmalo/nextpnr-spartan, release v0.1.0
  (`@silinx/nextpnr-himbaechel-spartan3e`), and its result is converted to XDL. The timing, the pins and the bitstream
  read that XDL as they read Silinx's own.
  - **Map** (packages/silinx-fpga/src/open-flow-nextpnr.js) puts each port's pad (its LOC) on its I/O buffer. It fails,
    naming them, on the cells the micro-architecture does not have yet (#2135: carry chains, wide multiplexers, RAMs…)
    and on ports without a LOC.
  - **The converter** moved from research/nextpnr-s3e into src/fpga/nextpnr-xdl.js. An IOB is now named after its bit
    of a bus (led<3>).
  - **The notices:** THIRD-PARTY-NOTICES and NOTICE name nextpnr, Boost and Eigen, which the package contains.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js builds the gates example with the engine: no
    warnings, its pads, a complete bitstream.
