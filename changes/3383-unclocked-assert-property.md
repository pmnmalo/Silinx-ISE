In detail:

- **A concurrent assertion with no clocking event is checked at all times (#3383):** `assert property (e)` and
  `assert property (a |-> b)` with no `@(posedge clk)` are an `always @*` block's assertion (`core/verilog/parser-assert.js`),
  in the simulation and in Verify, as Yosys's `read_verilog -formal` reads them; only `|=>` with no clock is still a
  warning. Yosys's own `tests/various/countbits.sv` gave the Nightly's corpus 40 warnings ("no clocking event") since
  #3177's Verify Assertions; it gives none now. Tests: lang-verilog-sv (a constant at time 0, a signal as it changes,
  `|->`, `|=>`'s warning), verify-assert (proved, failed and replayed).
