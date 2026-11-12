In detail:

- **A drawing's deeply nested expression is the box's error, not a stack overflow (#3559):** an ASM chart's, a state
  diagram's or a Petri net's condition or action (core/asm-expr.js) and a truth table's expression (core/logic.js
  `parseExpr`) nested a thousand levels deep threw `RangeError: Maximum call stack size exceeded` in the parser, the
  checks and the generators. They now nest at most 128 levels (parentheses, unary operators, a chain's operators: half
  the HDL front end's MAX_NESTING, #3395, as the HDL generated from them nests up to twice as deep and still compiles);
  a deeper one is one error at its box or cell, "expression nested more than 128 levels deep (parentheses,
  operators)", whatever its depth. Their tokenizers read the text in linear time (100,000 characters took minutes).
  Convert to Schematic of `assign y = a ^ b ^ …` with 10,000 terms overflowed the stack too: a chain is flattened
  without recursing (core/schdoc-gates.js), and the stubs of a schematic laid out without ELK are checked against the
  wires and pins near them only (core/schdoc-place.js; a chain of 2000 inverters took 19 s, now 0.6 s). The
  expressions of the repository's tests and examples parse the same, and the examples' and test designs' 68
  conversions to a schematic are the same, with and without ELK. Tests: test/drawing-nesting.test.js (the limit's
  charts, state diagrams and truth tables checked, their HDL compiled and simulated as the plain ones in VHDL and in
  Verilog; one level more and 100,000 the exact errors; the MCP server's check_drawing and convert_module).
