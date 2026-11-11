In short:

- **Long expressions:** an expression of thousands of terms (`a + a + …`, an `or` / `|` of terms, a chain of `?:` or of
  `when … else`) checks, simulates, translates and makes its synthesis input; it no longer stopped Check Syntax or the
  simulation with "Maximum call stack size exceeded" (from a few thousand terms).
- **VHDL `and` / `or` of conditions:** a chain of them is evaluated once per operand in the simulation; each left
  operand was evaluated twice, so a chain of a few dozen conditions took seconds (or never ended), and an impure
  function in it was called that many times.

In detail:

- **Chains of operators of thousands of terms (#3375):** a chain of a left-associative binary operator nests in its
  left operands, a chain of conditional operators (Verilog's `?:`, VHDL's `when … else`) in its elses, and every pass
  that followed one call per operator follows it in a loop: the Verilog parser's `?:`, the binder (each operator's
  expectation and location as before), the constant check of folding (a stack of its own, each node's answer kept:
  linear, not quadratic), Verilog's context sizing (a stack of tasks, in the same order), the simulator's evaluator,
  the design checks' walks (core/bound-walk.js's walk), the synthesis input (its writer; the expressions that can be
  tables, each node's inputs and cost kept, linear; a literal's test only on a text that can be one) and both
  translations (and translate-util's `intOf`). Expressions of 20 000 terms check with no warnings, simulate as their
  short equivalents and translate both ways, in VHDL and Verilog; on the repository's 256 HDL files the parses,
  translations, diagnostics, design checks, simulations and synthesis inputs are the same as before. Yosys itself may
  still fail on such an expression (#3374). Nested parentheses and unary operators still nest the parsers and the
  binder one call per level (4000 `~` overflow the binder: a design error of `simulate`; #3395).
- **A VHDL boolean `and` / `or` / `nand` / `nor` evaluates its left operand once (#3394):** the simulator evaluated it
  again when it did not skip the right one, so a chain of n operators made 2^n evaluations.
