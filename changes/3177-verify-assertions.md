In short:

- **Verify Assertions:** a module's right-click Verify Assertions… (and, in the ISE style interface, the Simulation
  view's Processes) proves that the module's own assertions hold for every input sequence: VHDL's `assert`, Verilog's
  `assert (…)` and SystemVerilog's `assert property (@(posedge clk) req |=> ack)`. One that fails gives the first clock
  cycle where it does: that counterexample becomes a test bench, simulated at once, the assertion's own message in the
  console. In the browser too, VHDL and Verilog alike.
- **SystemVerilog's concurrent assertions are simulated:** `assert property` and `assume property` of one clock edge,
  with `|->`, `|=>` and `disable iff`, are checked at each edge (they were ignored); the forms not checked (sequences,
  `$past`, `cover`, no clock) are named in a warning.

In detail:

- **Formal verification, its second part: a module's assertions proved (#3177):** `core/verify-assert.js` writes the
  module as the open synthesis's flat SystemVerilog with its assertions (`toVerilog`'s new `formal` option: VHDL's
  `assert` of severity warning, error or failure, a note being a message; Verilog's `assert` and `assume`), reads it in
  Yosys with `-formal` and proves it with `sat -tempinduct -prove-asserts -set-assumes` (`chformal -lower`: a clocked
  assertion sampled at its edge), up to a depth: proved by induction, bounded (a warning), or failed. The counterexample
  is replayed by the simulator at once (`core/verify-bench.js`: the module alone, its inputs cycle by cycle), and the
  first assertion it reports, its file, line and message, is the one the console names, at its clock cycle. The
  Verilog parser writes a concurrent assertion of one clock as a process on that edge with an immediate assertion
  (`core/verilog/parser-assert.js`: `a |-> b`, `a |=> b` through a register of the antecedent, `disable iff`, the
  pass and else actions), so the simulation and the proof check the same thing; an immediate assertion with an else
  action is checked by the proof too. The interface's Verify Assertions… (`web/js/verify.js`, the depth asked) and the
  MCP server's `verify` with no reference give the same messages. Tests: verify-assert (failures in VHDL and Verilog
  replayed in both languages at the same cycle, proofs, bounded, assumptions, a combinational module, the refusals,
  the flat module's assertions; SymbiYosys's verdicts with `SILINX_SBY`), lang-verilog-sv (the concurrent assertions
  simulated, the warnings), mcp-verify; UI verify in both interfaces and Portuguese, hierarchy and truthtable menus.
