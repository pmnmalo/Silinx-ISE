In short:

- **Long if … elsif chains:** a process with an `if … elsif` (VHDL) or `if … else if` (Verilog) chain of thousands of
  branches checks, simulates and translates; it no longer stopped Check Syntax or the simulation with "Maximum call
  stack size exceeded" (from about 5000 branches in VHDL, 2000 in Verilog).

In detail:

- **An elsif / else if chain of thousands of branches (#2577):** the chain still nests in `else`, but every pass that
  followed it one call per branch follows it in a loop: the VHDL and Verilog parsers (a Verilog error in an else if's
  condition still makes that else if a null statement), the binder (each branch at its own location, an error making
  it a null statement), the simulator's executor, the design checks (latches, sensitivity lists, the clocks of a
  process, the combinational loops: the enclosing conditions' reads kept as the chain grows, and their edges added
  without a search, linear rather than quadratic), the synthesis input (an `end else if (…) begin` chain, as one, in
  place of nested `else begin if … end`; the same Yosys netlist on the examples) and the walks of the bound and parsed
  trees (core/bound-walk.js, translate-util's walk, the synthesis' and the carry chains' walks: a stack of their own).
  A chain of 20 000 branches checks with no warnings and simulates as its short equivalent, in both languages, and
  translates into the other language. An elaboration that throws (an expression of 20 000 terms) is a design error of
  `simulate`, no longer thrown out of it.
