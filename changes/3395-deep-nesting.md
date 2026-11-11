In short:

- **Deeply nested expressions:** an expression nested more than 256 levels deep (parentheses, calls, concatenations,
  unary operators, a `?:` in a then branch) is an error of its file, at the level past the limit: "expression nested
  more than 256 levels deep". It overflowed the stack (from 500 parentheses in Verilog, a few hundred unary operators
  in the synthesis input) with "Maximum call stack size exceeded"; 256 levels check, simulate, translate and make
  their synthesis input.
- **Translation to VHDL:** a `~~a` (a not of a not) is written `not (not a)`; it was `not not a`, which VHDL refuses.

In detail:

- **Expressions nested more than 256 levels deep (#3395):** the parsers count an expression's levels (Verilog: an
  expression in another, in parentheses, a call, an index, a concatenation or a then branch, each unary operator and
  each `**` to the right; VHDL: each primary in another) and refuse one past `MAX_NESTING` (256, the bracket depth of C
  compilers; packages/silinx-hdl/src/util.js) with one error at the token that starts the level past it, however
  deep, the rest of the file read. Every pass after the parsers recurses once per level (the binder, the simulator,
  the design checks, the synthesis input, the translations): 256 levels leave them a margin of 2 to 4. Verilog's unary
  operators are read in a loop. The repository's 256 HDL files have none past the limit. Tests: test/deep-nesting.test.js
  (VHDL and Verilog: 256 levels of each kind checked with no warnings, simulated against values computed in the test,
  synthesis input with no warnings, translated both ways and simulated again; one level more and 20 000 levels, the
  error and its place; simulate's error); the #2577 test of an elaboration that throws uses a constant of 20 000
  functions, each calling the next (statements nested thousands deep: #3490).
- **Translation to VHDL of a not of a not (#3489):** the operand of `not` is in parentheses unless it is a primary.
