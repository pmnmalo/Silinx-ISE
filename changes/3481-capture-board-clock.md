In short:

- **The logic analyzer on a design with no clock:** a combinational design can be captured too. Logic Analyzer
  Settings' Clock list has the board's own oscillator (the Basys2's MCLK, 50 MHz), the default when the design has no
  clock; it used to propose a switch as the clock, and the capture then never armed ("is its clock running?").

In detail:

- **The capture on the board's clock (#3481):** `core/ila-insert.js` takes a capture's `boardClock` (the board's
  oscillator, `boardClockOf`: its first clock resource with a period) in place of a signal of the design: the wrapper has
  a port of its own for it, `silinx_board_clk`, and Implement (`core/flow-ide.js` `captureUcf`) adds its pin, its
  period and, when the design's constraints give I/O standards, its own to the design's constraints; a design that has
  a port on that pin already is refused, that port being the clock to choose. The dialog (`web/js/capture-ui.js`)
  proposes a design's clocks (the signals its processes are clocked on) before its other signals, and the board's
  clock when it has none; the MCP server's `capture_settings` takes `clock: "board"`; the messages, the Design Summary
  and `build/capture.json` name it ("the board's clock mclk (B8, 20 ns)"). Tests: ila-insert (the oscillator of a
  board, the constraints, a combinational design's capture simulated on it), mcp-capture (gates implemented with its
  capture on MCLK, its port on B8, no warning; blinky's clk on B8 refused; no board), UI capture in both interfaces and
  Portuguese.
