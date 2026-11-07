In short:

- **Silinx HLS, floating-point operations shared:** `#pragma HLS ALLOCATION operation instances=fmul limit=1` (and
  `fadd`, `fsub`, `fdiv`, `fsqrt`, and the double's `dadd`, `dsub`, `dmul`, `ddiv`, `dsqrt`) makes the operations of
  that kind one shared unit, as Vitis HLS's: three float multiplications 9204 → 3696 LUTs and 12 → 4 multiplier blocks,
  49 → 61 cycles. Without the pragma nothing changes.
- **Silinx HLS, a sub-module given a float or a double:** its arguments were converted to integers, giving wrong
  results; they are now passed as they are.

In detail:

- **The soft-float's operations as units (#2273):** each operation of the kind ALLOCATION names, in the pragma's scope
  (its function, or the loop's body it is in), is a call of one function of that operation (core/c-float-units.js),
  appended to the source, a sub-module (#1960's: one instance, its calls sharing it), its path scheduled over the clock
  as a top's is. `x *= y` is `x = unit(x, y)`; an operation in a loop's header, after `&&` / `||`, in a branch of `?:`
  or of constants only stays inlined; a loop that calls a unit is not pipelined. `limit=2` and more: one unit, said; an
  operation of no such kind there, said and ignored. The report lists the unit, its calls and its latency, and the MCP
  server's `c_synthesis_report` too. No design of the examples or of the HLS corpus has the pragma: none changes.
- **A sub-module's float and double arguments (#2273):** they were converted to the port's integer
  (core/c-submodule.js); now each passes its bits.
