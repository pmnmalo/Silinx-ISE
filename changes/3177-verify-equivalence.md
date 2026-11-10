In short:

- **Verify Equivalence:** a module's right-click Verify Equivalence… (and, in the ISE style interface, the Simulation
  view's Processes) proves that the module gives the outputs of a reference module (a teacher's solution, an earlier
  version) for every input sequence, or finds the first clock cycle where they differ: that counterexample becomes a
  test bench, simulated at once, the waveform viewer showing where the outputs part. In the browser too, VHDL and
  Verilog alike.

In detail:

- **Formal verification, its first part: the equivalence of two modules (#3177):** `core/verify.js` writes the module
  and its reference as the open synthesis's flat SystemVerilog (`core/synth-verilog.js`), joins them in Yosys's miter and
  checks it with Yosys's own SAT solver (`sat -tempinduct`: cycle by cycle from the initial state, the shortest difference
  first, a proof by induction tried at each depth; registers with no initial value start at 0), up to a depth (20 clock
  cycles by default): proved, bounded (no difference within the depth, a warning) or failed, with the counterexample's
  inputs of each cycle and both modules' outputs. `core/verify-bench.js` makes the counterexample a test bench in VHDL or
  Verilog (`sim/verify_<module>`): both modules side by side, the inputs cycle by cycle, the first difference reported,
  then VERIFY FAILED. The interface's Verify Equivalence… (`web/js/verify.js`: the reference asked, one named after the
  module proposed; Yosys in the page's worker, the browser edition's own) and the MCP server's `verify` tool
  (`server/mcp-verify.js`: the test bench written and replayed, its messages returned) give the same messages. Tests: the
  verdicts, the counterexamples and their replays in both languages, mixed languages, asynchronous resets, combinational
  modules, the refusals, eight examples against their own flat Verilog, and, with `SILINX_SBY`, SymbiYosys's own verdicts
  (abc bmc3, abc pdr) on the same miter; the MCP tool; a UI test in both interfaces and in Portuguese.
