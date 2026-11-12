In short:

- **Calls nested too deep:** a function calling another, that calls another…, more than 32 deep while a design is
  elaborated is an error of the file at the call past the limit: "calls nested more than 32 levels deep". A constant
  computed through thousands of chained functions overflowed the stack ("Maximum call stack size exceeded"), from
  about 230 of them.

In detail:

- **Calls nested more than 32 levels deep (#3508):** each call's subprogram is bound (and a constant one evaluated)
  inside its caller's binding, so a chain of functions, procedures or tasks each calling the next used the stack once
  per level and overflowed it past about 230 functions of one statement, past about 100 whose call sits in an if, a for,
  a case and parentheses (Node's default stack). The elaboration counts the subprograms being bound and refuses a call
  past `MAX_CALL_NESTING` (32: 32 such functions still bind with their outermost call 250 blocks deep and 30
  parentheses around each call) with one error at that call's statement, in its file (a package's), reported by the
  statement or declaration of the design that makes the outermost call, never thrown; a VHDL function bound again per
  constant argument does not bind the chain again. Recursion is not counted (a recursive function is bound once; its
  evaluation has its own limit). The repository's 256 HDL files elaborate as before. Tests: test/deep-calls.test.js
  (VHDL and Verilog: 32 chained functions computing a constant and a simulation's value, checked with no warnings,
  simulated, the synthesis input with no warnings; 33 and 20 000, the error and its place; a package's functions;
  tasks and procedures; constant arguments); test/deep-if-chain.test.js's #2577 case, the new error.
