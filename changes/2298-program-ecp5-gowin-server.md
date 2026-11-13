In short:

- **The ULX3S and the Tang Nano 9K programmed from Silinx:** Configure Target Device of an ECP5 or a Gowin project loads
  its bitstream into the FPGA (Program FPGA) through the local server's openFPGALoader; the browser edition comes next.
- **program_board, the MCP server's Program FPGA:** an assistant programs the project's board, every family, the client
  asking first.

In detail:

- **The ECP5's and the Gowin's boards programmed by the local server (#2298):** Configure Target Device of an ECP5 or a
  Gowin project opens the open families' page (web/js/program-open.js, the iCE40's made general: its title, its file and
  its target from the flow's descriptor, Program FPGA for the SRAM, Program Flash for the iCE40's flash); its file loaded
  into the FPGA's SRAM by `openFPGALoader -b ulx3s -m <top>.bit` (the ULX3S's FT231X) or `-b tangnano9k -m <top>.fs` (the
  Tang Nano 9K's BL702): `-m`, never their flash. The file read first (core/open-bitstream.js): an ECP5 .bit's part and
  IDCODE, a Gowin .fs's IDCODE, checked against the project's device as a Xilinx header is (another device's refused
  unless forced, then warned); not one of them, an error. The browser edition says that it does not program them yet.
  Tests: test/open-bitstream.test.js, programmer (the command lines, the log, the refusals, the warnings), ecp5 and gowin
  (the flows' real files read), tool-descriptors, family-profile, UI program-open (both boards, both interfaces,
  Portuguese, a fake openFPGALoader). Proven with stand-ins only: not yet on a real ULX3S or Tang Nano 9K.
- **program_board (#2674, #2298):** the MCP server's Program FPGA / Program Flash (server/mcp-board.js), through the
  interface's own function (impl-routes.js startProgramming, the /program route's body moved there): a trusted project
  only, its file, its board's programmer or the one asked, force for another device's bitstream; destructive. Tests:
  test/mcp-board.test.js (each family's board, a Spartan-3E's, the refusals, a programmer failing), mcp-modules, mcp.
