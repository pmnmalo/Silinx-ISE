In short:

- **The nextpnr engine takes the IOB registers:** `--engine nextpnr` now packs flip-flops into their pads' IOBs (the UCF's
  `IOB = TRUE`), the IDDR2 / ODDR2 DDR registers and tristate outputs, and routes a clock pad to its global buffer on
  the dedicated path, as Silinx's own toolchain and ISE's map do.

In detail:

- **The nextpnr engine: the IOB's registers and DDR, the clock pads (#2192):** the dependency
  `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan v0.4.0. Its chip database has the IOB site's
  flip-flops (IFF1 / IFF2, OFF1 / OFF2, TFF1) and the multiplexers between them and the pad; its packer puts a flip-flop
  into its pad's IOB when asked (its clock on a global buffer), and an IDDR2 / ODDR2 as two flip-flops (the second on
  the inverse of the first's clock); a global buffer driven by a pad goes where the pad's dedicated path reaches it.
  - **src/fpga/nextpnr-iob.js** (new) writes each IOB's settings as Silinx's packer does; **src/open-flow-nextpnr.js**
    (Map) accepts IBUFG, OBUFT, IOBUF, IDDR2 and ODDR2 and gives the micro-architecture the UCF's `IOB = TRUE / FALSE`
    (NET on the pad's buffer, INST on the cell); **research/nextpnr-s3e/lib.mjs**'s simCheck simulates the IOB's
    registers on both clock edges, with asynchronous set / reset, and with random inputs (`xdl-sim-check.mjs
    --random-inputs`).
  - **research/nextpnr-s3e/iob_regs.v through nextpnr:** every IOB's settings equal to Silinx's packer's, the clock
    pad on the path Silinx takes; ISE's DRC with no errors or warnings, the .bit byte-identical to ISE's bitgen; its
    flip-flops simulate equal to the netlist.
  - **The examples through nextpnr, on the new chip database (Basys2-250):** gates, traffic (71 slices, was 70), blinky,
    pong, clock and vga build with no warnings, ISE's DRC with no errors or warnings, their .bit byte-identical to
    ISE's bitgen. stopwatch still needs the block RAM and the multipliers.
  - **Tests:** test/nextpnr-s3e.test.js (the settings against Silinx's packer, the clock pad's path, a complete
    bitstream, the simulation catching a wrong clock edge, initial value, set / reset or enable) and
    test/nextpnr-engine.test.js (the UCF's IOB constraints on the netlist; the design built with the engine).
