In detail:

- **Expressions nested more than 256 levels deep (#3395):** the parsers refuse an expression nested more than
  `MAX_NESTING` (256, src/util.js) levels deep (parentheses, calls, indexes, concatenations, unary operators, a `?:` in
  a then branch) with one error, "expression nested more than 256 levels deep (parentheses, calls, unary operators)",
  at the token that starts the level past it; the rest of the file is read. Every pass after the parsers recurses once
  per level; such an expression overflowed the stack. Verilog's unary operators are read in a loop.
