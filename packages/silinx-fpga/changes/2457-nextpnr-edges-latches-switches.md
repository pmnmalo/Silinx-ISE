In short:

- **The nextpnr engine takes every cell Silinx's own engine takes:** flip-flops on the falling edge (`FD*_1`), latches
  (`LD`, `LDE`, `LDCE`, `LDPE` and their `_1`), clock switches (`BUFGMUX`, `BUFGMUX_1`) and `BUF`; a design with them
  no longer falls back to Silinx's engine under `--engine auto`.

In detail:

- **The nextpnr engine: falling-edge flip-flops, latches, clock switches (#2457):** the dependency
  `@silinx/nextpnr-himbaechel-spartan3e` has them since nextpnr-spartan v0.13.0: a flip-flop or latch takes the slice's
  CLKINV as Silinx's packer writes it (a latch with an active-high gate: CLK_B), a slice's two share it and the latch
  mode, a latch stays out of the IOBs; a clock switch keeps its I1 and S, and the two buffers of a pair go together only
  when their shared input lines carry one clock (#846).
  - **src/open-flow-nextpnr.js** (Map): NEXTPNR_CELL takes them; `lowerClockSwitches` leaves the switches as Silinx's
    packer does (an input from a BUFG that BUFG's input, a constant select a BUFG); a BUF is a LUT1; a clock's PERIOD
    reaches a switch's output. **src/fpga/nextpnr-xdl.js** writes `#LATCH`, `CLKINV::CLK_B`, a latch's `ASYNC`, and a
    switch's `I1_USED`, `SINV::S` and `DISABLE_ATTR` (its select not tied to VCC).
  - **research/nextpnr-s3e/edges.v through nextpnr (Basys2-250):** ISE's xdl2ncd with no warnings, its DRC with no
    errors or warnings, the .bit byte-identical to ISE's bitgen, CRC on and off; the XDL simulates equal to the netlist.
  - **Tests:** test/nextpnr-engine.test.js (every cell of Silinx's packer taken; the switches' lowering; the design
    built: no warnings, each setting, the simulation catching a wrong latch, clock edge or select);
    test/fpga-sim.js simulates a BUFGMUX's select.
