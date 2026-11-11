In detail:

- **Statements nested more than 256 levels deep (#3490):** the parsers refuse a statement nested more than
  `MAX_NESTING` (256, src/util.js) levels deep (Verilog: a statement in another, a generate construct in another; VHDL: a
  concurrent statement in another, a sequential one in a process, a subprogram or another statement) with one error,
  "statement nested more than 256 levels deep (blocks, if, case, loops, generates)", at its first token, once for the
  outermost statement; the statement is skipped (src/verilog/parser-nesting.js, src/vhdl/parse-nesting.js) and the
  rest of the file is read. Every pass after the parsers recurses once per level; such a statement overflowed the
  stack.
