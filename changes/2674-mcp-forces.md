In short:

- An AI assistant (MCP) forces signals in a simulation, a value or a clock, as SSim's Force Constant and Force Clock do.

In detail:

- **MCP: forces (#2674):** `simulate` takes `forces`: a value, or a clock (its leading and trailing values, period,
  duty cycle), from a start until a cancel, over what drives the signal, as SSim's Force Constant / Force Clock
  (`ssim force add`) through core/ssim-forces.js; a later force of a signal cuts its earlier one, a released signal
  takes what the design gives it again. Test: test/mcp-forces.test.js (VHDL and Verilog).
