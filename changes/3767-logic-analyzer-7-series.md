In short:

- **The logic analyzer on the 7-series:** the Silinx toolchain inserts the capture core on the Basys 3 and the Nexys A7,
  with a BSCANE2; Logic Analyzer Settings is in their processes, its block RAMs counted as synthesis infers them, the
  board's oscillator as the clock written into the XDC. Reading the capture on those boards comes with #3773.

In detail:

- **The logic analyzer on the 7-series (#3767, part of #3483):** Implement inserts the capture core with a BSCANE2 on USER1
  (core/flow-ide.js: the 7-series among the families whose open flow places the BSCAN; the report's link named by the
  family's BSCAN). The board's clock (#3481) as XDC: its PACKAGE_PIN, IOSTANDARD and create_clock (core/ila-insert.js
  boardClockXdc), a port of the design on its pin refused. The core's samples written on the clock's falling edge on the
  7-series (core/ila.js: the same words; the block RAM's write port timed on that edge by nextpnr, no hold violation), its
  memory planned as synth_xilinx infers it (RAMB18E1s, a RAMB36E1 two, distributed RAM where Yosys's costs choose it: the
  same counts on 18 shapes); capture_settings's block RAMs by the family's profile (none counted against the device on the
  7-series). The 7-series' tree has the logic analyzer (web/js/tool-descriptors.js); reading a capture on a board says it is
  the Spartan-3E's boards only yet (core/ila-link.js captureLinkError, #3773), in the server and the browser. Tests:
  ila (the core simulated on the 7-series in VHDL and Verilog, its memory planned and synthesized), ila-insert (the wrapper
  with its BSCANE2 synthesized, no warning), ila-link, tool-descriptors, mcp-capture-xc7 (blinky's capture to a bitstream on
  the Basys 3, no warning; gates on the board's clock; the capture read on the board refused), UI capture (the dialog on the
  Basys 3, both interfaces, Portuguese).
