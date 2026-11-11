In short:

- **Deeply nested statements:** a statement nested more than 256 levels deep (begin … end blocks, ifs, cases, loops,
  generates) is an error of its file, at the statement past the limit: "statement nested more than 256 levels deep".
  It overflowed the stack (from about 600 nested ifs in a VHDL process, 1200 begin … end blocks in Verilog) with
  "Maximum call stack size exceeded"; 256 levels check, simulate and make their synthesis input.

In detail:

- **Statements nested more than 256 levels deep (#3490):** the parsers count how deep a statement nests (Verilog: a
  statement in another, a generate construct in another; VHDL: a concurrent statement in another, a sequential one in a
  process, a subprogram or another statement), one count from the module's or architecture's outermost construct to
  its innermost statement, and refuse one past `MAX_NESTING` (256, as expressions, #3395) with one error at its first
  token, once for the outermost statement however deep it nests. The statement is skipped whole in a loop (to its `;`
  or the end that closes it, an else of its ifs included) and the rest of the file is read. Every pass after the
  parsers recurses once per level (the elaboration, the simulator, the design checks, the synthesis input, the
  translations): 256 levels leave them a margin of 2 or more, with an expression 256 levels deep in the innermost
  statement too. A translation nests more (a branch of an if in a begin … end): designs half as deep translate. The
  repository's 256 HDL files parse as before. else if / elsif chains are read in a loop as before (#2577) and do not
  count. Tests: test/deep-statements.test.js (VHDL: if … else, loops, cases, generates, blocks; Verilog: begin … end,
  if, if … else, cases, generates; 256 levels checked with no warnings, simulated against values computed in the test,
  synthesis input with no warnings; 128 levels translated both ways and simulated; one level more and 20 000 levels,
  the error and its place, the design elaborated without the statement, simulate's error; two statements too deep;
  what the skipped statement holds).
