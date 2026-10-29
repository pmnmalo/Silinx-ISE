In detail:

- **Spartan-6: the open flow's PIPs measured, every example's bitstream as ISE's (#732):** the PIPs the open flow
  routes on that the databases did not have (a right or left I/O tile's paths, the BIOB_SINGLE pads, the block RAM's
  clock and reset pins on the XC6SLX45 …) were measured one at a time in context on ISE (research/s6/gen-flowdrop6.mjs,
  packages/silinx-fpga/bitdb/s6/s6-pips-flow.json, read by bitdb-node.js). With them all seven examples on the Nexys3
  and the Atlys, routed by the open flow, are byte-identical with ISE's bitgen of the same routing, and ISE's DRC finds
  no error in them. Tests: packages/silinx-fpga/test/s6-bitgen.test.js, test/s6-cmtpaths.test.js.
