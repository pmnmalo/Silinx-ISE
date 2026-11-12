In short:

- **Gowin designs simulate.** A design for the Tang Nano 9K that instantiates Gowin's primitives (rPLL, OSC, DFFE, LUT4,
  ALU, the block RAMs…) now elaborates, simulates and synthesizes, from Verilog or from VHDL (`library gw1n;`), and the
  Gowin synthesis's netlist simulates in place of the design.

In detail:

- **Simulation models of the Gowin primitives (#2299, Part of #2303):** Silinx's own functional models, from Yosys's
  techlibs/gowin/cells_sim.v and Gowin's guides (packages/silinx-hdl/src/gowin-prims.js, gowin-bsram.js, gowin-dsp.js): LUT1-4,
  MUX2 and MUX2_LUT5-8, the 20 flip-flops (DFF, DFFE, DFFS/R/P/C with their enables, the DFFN… twins), the 12 latches, ALU
  (its 10 modes), RAM16S1/2/4 and RAM16SDP1/2/4, IBUF, OBUF, TBUF, IOBUF, ELVDS_OBUF / TLVDS_OBUF, BUFG, INV, VCC, GND, GSR;
  rPLL and PLLVR (CLKOUT, CLKOUTP's phase and duty cycle, CLKOUTD, CLKOUTD3, the bypasses, LOCK; the frequencies those of
  gowin-clocks.js pllFrequencies), OSC, OSCZ and OSCH; the block RAMs SP, SDPB, DPB, pROM and their X9 twins (widths, byte
  enables, write modes, output register, resets, BLKSEL); MULT9X9, MULT18X18, MULT36X36. primitiveSources gives a design the
  Gowin library in place of UNISIM's when it instantiates a Gowin primitive (one of Gowin's names, or a name of both with
  Gowin's pins: a LUT's F, MULT18X18's DOUT…) or uses `library gw1n`; the netlist cells run natively (native-gowin.js), as
  UNISIM's do. Tests: gowin-prims, gowin-bsram, gowin-sim-clocks (each primitive against values computed in the test, in
  Verilog and VHDL), gowin-netlist (every example's Gowin post-synthesis netlist passes its test bench as its RTL does, no
  warning), hdl-boundary.
- **A project instantiating an rPLL or an OSC elaborates (#3498):** set_top, Check Syntax and the simulation found no
  module 'rPLL'; the Gowin primitives are now known to the front end, and the open synthesis keeps them as Gowin's cells
  (rPLL, pROM: their names as Gowin writes them). Test: mcp-gowin (set_top, check_syntax, simulate and run_process on a
  design with an rPLL and an OSC).
