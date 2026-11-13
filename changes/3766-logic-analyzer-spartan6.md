In short:

- **The logic analyzer on the Spartan-6:** the Silinx toolchain inserts the capture core on the Nexys3, the Atlys and the
  other Spartan-6 boards, with its BSCAN_SPARTAN6, as on the Spartan-3E. Reading the capture on those boards comes with
  #3773.

In detail:

- **The logic analyzer on the Spartan-6 (#3766, part of #3483):** Implement inserts the capture core with a
  BSCAN_SPARTAN6 on USER1 (core/flow-ide.js: the Spartan-6 among the families whose open flow places the BSCAN, the
  report's link named by the family's BSCAN). The toolchain's part: Silinx's Map packs it onto a BSCAN site, on the site
  of its JTAG chain (BSCAN_X0Y<chain - 1>: on the Spartan-6 the site decides the chain, as ISE's bitgen shows), the XDL
  writes its JTAG_CHAIN; nextpnr-spartan6 0.5.1 places and routes it there (its chip database's BSCAN BELs, its packer's
  BSCAN, pmnmalo/nextpnr-spartan#43, #45). DRCK, the JTAG clock, stays on the general routing (no
  BUFG: no switch from the fabric into a BUFGMUX is in the bit database). The dialog's note names the Spartan-6. Tests:
  s6-bscan (synthesis, Map, placement, XDL on both parts), mcp-capture-s6 (blinky's capture to a bitstream on the Nexys3
  and the Atlys, with both Maps, no warning); checked against ISE (DRC, the same design's bitstream byte-identical).
