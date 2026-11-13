In short:

- **Numato Mimas V2 and Elbert V2: a programming file for their flash.** Generate Programming File (with ISE) now writes
  `build/<top>_prom.bin` for these boards, the file Numato's tool writes to the board's flash over its USB. The log and
  the Configure Target Device panel say how to program it (MimasV2Config's command on the Mimas V2).

In detail:

- **The PROM bitstream as a .bin on a board programmed by its maker's flash tool (#3711).** These boards' USB reaches
  only their SPI flash, through Numato's tool. The FPGA then boots from the flash, which needs StartUpClk Cclk:
  the project's JtagClk bitstream never ends its start-up there. On such a board (`programmer.vendorTool` on its USB, an
  SPI flash: core/vendor-flash.js), the option file of the PROM bitstream asks bitgen for a binary
  (`-g Binary:yes`), and the build log ends with `Programming file: …`: the tool, the .bin and its command. The
  Configure Target Device panel's note starts with the same line, and the MCP server's `run_process bitstream`
  returns it in its log.
