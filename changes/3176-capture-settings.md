In detail:

- **The logic analyzer's capture settings and its insertion in the design (#3176, the second part):** a project's
  capture (silinx.json `capture`: the signals to watch by their path below the top, `u_ctl.state`, the clock, the depth,
  the samples before the trigger, the trigger) is checked on the elaborated design by `core/ila-insert.js`. It finds
  each probe's signal and width (a vector, an integer by its range, a state by its encoding, a port), reads a
  trigger's value as a state's name or a negative integer, and counts the block RAMs the core takes against the
  device's (one kept for the design). It writes the sources Implement will add: the capture core and a Verilog
  wrapper around the top. The wrapper has the top's ports, reads the probes through hierarchical names (the design's
  sources unchanged, VHDL or Verilog), and connects the core to the family's BSCAN (BSCAN_SPARTAN3, BSCAN_SPARTAN6,
  BSCANE2: `core/unisim-jtag.js`, their models at rest in a simulation). The open synthesis keeps the BSCAN as a cell.
  The MCP tool `capture_settings` shows, sets, changes and clears the capture. Check Syntax no longer takes a
  primitive's output used as a clock (a BSCAN's DRCK) for logic. Not yet in Implement: the Silinx toolchain's place
  and route and bitstream have no BSCAN yet (its routing bits come next).
