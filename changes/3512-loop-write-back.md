In short:

- **A write-back in a loop synthesizes right:** in a loop, `x <= c ? v : x` (VHDL's `when … else x`, or an `if` whose
  other branch writes `x <= x`) after an earlier turn's write to `x` kept that earlier turn's value in the open
  synthesis's netlist when `c` was false; it now holds the value the design gives.

In detail:

- **A write-back after an earlier turn of a loop (#3512):** the synthesis input writes `x <= c ? v : x` as
  `if (c) x <= v` (#523) only where no earlier write of the process run can have written x's bits; a loop was checked
  on its first turn's writes alone, so a second turn's `x <= c ? 2 : x` after the first turn's `x <= 1` became
  `if (c) x <= 2`, and with c false the netlist kept the 1 where the design holds x's old value. A loop's body is now checked after all its turns' writes, part by part
  (packages/silinx-hdl/src/synth-verilog.js `firstWritesOf`): the whole signal, constant bits and slices, and the
  element at the loop's own variable (VHDL's loop; a Verilog `for` stepped by a constant, tested on its variable
  alone, its body not writing it), which each turn writes once (#523's `x[i] <= c ? v : x[i]` over i keeps its
  conditional write); any other variable index counts as the whole signal. The repository's synthesis inputs (203
  modules) are the same. Tests: test/loop-write-back-synth.test.js (the issue's case and its variants in VHDL and
  Verilog: a whole signal, a constant index, the loop's variable, another variable and an inner loop's turns, two
  signals; each synthesized with no warnings, its netlist simulated against the design).
