In detail:

- **BSCAN_SPARTAN3 in the nextpnr engine (#3176):** `@silinx/nextpnr-himbaechel-spartan3e` 1.5.0 places the JTAG's user
  access primitive and routes its pins. The netlist for nextpnr takes a BSCAN_SPARTAN3 (`NEXTPNR_CELL`), and
  `fpga/nextpnr-xdl.js` writes nextpnr's BSCAN as ISE's XDL does (`BSCAN_BLACKBOX`), with the cell's own ports only as its
  site pins.
