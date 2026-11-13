In detail:

- **BSCAN_SPARTAN6 in the Spartan-6's open flow (#3766):** the Map packs it onto a site of its own (fpga/s6/pack.js,
  phys.js: kind bscan, its pins the primitive's, its chain), the placer puts it on its JTAG chain's site,
  BSCAN_X0Y<chain - 1> (fpga/s6/sites.js `bscans`, place.js), nextpnr gets it fixed there in both Maps (its BEL; packInput's
  for nextpnr's packer), the XDL writes it as ISE does (fpga/s6/xdl.js: BSCAN, JTAG_CHAIN, JTAG_TEST), bitgen writes the bit
  of the site that holds it (fpga/s6/bitgen.js: the site decides the chain; db/s6-bscan.json's keys the sites, measured with
  each chain on its own site, #3176; ISE's bitgen sets the site's bit, chain 1 on BSCAN_X0Y3 the bit of chain 4's site); the
  synthesis gives its DRCK no BUFG (synth-brams-s6.js S6_CLOCK_DRIVERS: no fabric -> BUFGMUX switch is known);
  nextpnr-spartan6 0.5.1 (its BSCAN BELs and packer, the BSCAN's BEL kept, pmnmalo/nextpnr-spartan#43, #45) places and
  routes it.
