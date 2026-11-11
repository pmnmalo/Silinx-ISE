In short:

- **The 7-series in the Silinx toolchain (experimental):** a Basys 3 project builds without Vivado, from HDL to its
  `.bit`, with Yosys, nextpnr and Silinx's own bitstream writer (Project X-Ray's database); asked for by the MCP
  server's `run_process` with `toolchain: "silinx"`. Its timing is nextpnr's estimate, optimistic against Vivado.

In detail:

- **The Artix-7 through the Silinx toolchain (#3146):** the local server runs the toolchain's 7-series back end
  (silinx-fpga's `open-flow-xc7.js`) for an Artix-7 project when the run asks for the Silinx toolchain (`toolchain:
  'silinx'`, the MCP server's `run_process` too); AMD Vivado stays the Artix-7's flow otherwise. `openStatus` says the
  xc7a35t (Basys 3) is available, the xc7a100t (Nexys A7) not yet (no bit database); its steps are the back end's
  (`openSteps`: synth, translate, par, trce, bitgen). The build folder of an XDC family has its sources and its XDC,
  no ISE script (`generateBuild`). Every example builds on the Basys 3 with no warning, each clock at the board's
  100 MHz by nextpnr's estimate (test/open-flow-xc7-server.test.js); the `.bit` from the reference FASM of the fork's CI
  is byte-identical to Project X-Ray's in its configuration data (packages/silinx-fpga/test/open-flow-xc7.test.js).
  `get_report`'s par report leaves out the nets and PIPs a nextpnr back end does not count, and says the timing's
  model. The release zip leaves out the 7-series' chip databases (downloaded on first use, #2329). Notices:
  `@silinx/nextpnr-himbaechel-xc7` (ISC; its chip databases from Project X-Ray's database, CC0).
