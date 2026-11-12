In short:

- **Nested loops synthesize at once:** the open synthesis of loops nested a few tens deep did not finish (twice the time
  per level: 50 ms at 18 levels, minutes at 30); loops nested 256 levels deep (the limit, #3490) make their synthesis
  input in about 50 ms, in VHDL and Verilog.

In detail:

- **Nested loops in the synthesis input (#3504):** the synthesis input marks the assignments that no other write to
  their signal or variable precedes (packages/silinx-hdl/src/synth-verilog.js `markFirstWrites`, #523: an element
  written back with its own value as a conditional write). It walked a loop's body twice (the writes of a turn before
  its next turn), each nested loop twice per walk of the enclosing one: 2^n walks of the innermost statement of n nested
  loops. The second walk marked nothing the first had not (from more writes before them, fewer assignments are first)
  and returned the same writes: the body is walked once. The repository's synthesis inputs (203 modules) are the same.
  Tests: test/deep-loops-synth.test.js (loops of one turn nested 12, 52 and 256 levels deep in VHDL and Verilog, the
  synthesis input in a child process with a time limit and no warnings; 10 nested loops and three loops of two turns
  synthesized with no warnings, their netlists simulated against the designs), test/deep-statements.test.js (VHDL's
  loops 256 levels deep make their synthesis input with no warnings, the step #3490 left out).
