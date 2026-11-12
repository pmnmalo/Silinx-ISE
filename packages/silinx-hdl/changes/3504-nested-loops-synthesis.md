In detail:

- **Nested loops in the synthesis input (#3504):** `markFirstWrites` (src/synth-verilog.js) walks a loop's body once.
  It walked it twice, each nested loop twice per walk of the enclosing one: time exponential in the depth of nested
  loops. The second walk marked no assignment the first had not; the synthesis inputs are the same.
