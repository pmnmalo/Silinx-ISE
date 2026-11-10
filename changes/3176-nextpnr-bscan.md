In detail:

- **The logic analyzer's link in the Silinx toolchain (#3176):** the Spartan-3E's nextpnr engine at 1.5.0 (nextpnr-spartan
  PR 32), which places the JTAG's user access primitive BSCAN_SPARTAN3 in the top-right corner tile and routes its pins
  through the switches #3254 measured. The open flow passes a BSCAN_SPARTAN3 to nextpnr (`NEXTPNR_CELL`), and the
  converter writes it to XDL as ISE does (`BSCAN_BLACKBOX`). A design with the capture core on USER1
  (`test/fixtures/open-flow/feat_bscan`) is built to a complete bitstream with no warning. The other designs are placed
  as before: the fork's test netlists' frequencies are unchanged.
