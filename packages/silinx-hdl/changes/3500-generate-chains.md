In detail:

- **Generate chains of thousands of branches (#3500):** Verilog's if … else if generate and VHDL's if … elsif generate
  are read in a loop, a chain's branch taken in a loop by the elaboration, and a VHDL elsif or case alternative marked
  `elseChain` (the same construct, the generate's scope: `g.s`, no longer `g.g.g.s`); `genChain` and `walkItems`
  (src/util.js) list a chain's branches and walk a module's items without recursing. A chain of thousands of branches
  overflowed the stack.
