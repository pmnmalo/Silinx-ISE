In short:

- **Silinx HLS: `/` and `%` by any value** in synthesis: by a constant that is not a power of 2 and by a variable.

In detail:

- **Division and remainder in synthesis (#1656):** core/c-dataflow-div.js: by a constant not a power of 2, a
  multiplication by its rounded-up reciprocal and a shift (exact for every value of the dividend's width); by a
  variable, a restoring divider; signed operands through their magnitudes, truncated toward zero as C; written with
  + - * and comparisons only, as XST takes them. Checked against BigInt's division for every pair of 4- to 7-bit
  operands and random 32- and 64-bit ones, and the generated VHDL and Verilog against the compiled C. Four more of
  AMD's examples through co-simulation (23 of 73). The tests' HDL simulation helpers shared (test/c-helpers.js).
