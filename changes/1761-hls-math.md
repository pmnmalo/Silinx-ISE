In short:

- Silinx HLS makes exp, log, sin, cos and pow (and expf, logf, sinf, cosf, powf) in hardware, with a library of its own
  that the C simulation runs too, so the co-simulation compares equal bits. pow of an integer power is exact
  (pow(2, 3) is 8). Their last digit may differ from before in the C simulation.

In detail:

- **Silinx HLS: math.h's exp, log, sin, cos and pow in hardware (#1761):** core/c-mathlib.js writes each algorithm once,
  against an interface of operations: its C on the soft-float library's operations (MATHLIB, added to
  core/c-softfloat.js's in core/c-dataflow-float.js) for the hardware, its JavaScript (each operation IEEE-rounded)
  for the C simulation and the constants folded at synthesis (core/c-float.js's MATH). Only + - * /, the comparisons,
  the conversions and powers of two are used, so both give the same bits. exp: Cody-Waite reduction and a Taylor
  polynomial; log: 2 atanh((m - 1) / (m + 1)); sin, cos: a three-part reduction by pi/2 (accurate for |x| up to 32768
  in float, 2^20 in double); pow: C99's special cases, an integer power under 2048 by squaring, else exp(y log |x|) in
  double. Within 2 ulps of JavaScript's Math (pow: up to about a hundred ulps for a non-integer power in double). The
  co-simulation allows a million delta cycles (core/compile.js simulate's maxDeltas): pow's soft-float path is deep.
  The hint for math.h's other functions lists the new ones. Tests: test/c-mathlib.test.js (accuracy, special cases,
  the library's C run by the C interpreter against the simulation's bits, expf and logf co-simulated in VHDL and
  Verilog); the HLS corpus's float-and-double example (pow(2.0, n)) passes.
