In short:

- Silinx HLS's fmod and fmodf are exact for every quotient, in the C simulation and in hardware, where one beyond 2^64
  gave NaN. In hardware fmod now takes a clock cycle per bit of the exponents' difference (up to 276 in float, 2097 in
  double), in a circuit of one step; a function that calls it of values that are not constants is sequential.

In detail:

- **Silinx HLS: fmod and fmodf exact for every quotient (#2144):** core/c-mathlib.js's reduction is a loop of the state
  machine, one step a cycle (a pipelined loop, its bound in the report), rather than 64 steps unrolled; a subnormal x
  and y are each normalized alone, so that a large x no longer overflows with a subnormal y. The call is inlined into
  the top as a function with a loop is (core/c-inline.js, core/c-dataflow-float.js's withSeqMath); of constants it is
  still folded, and a function of the program named so stays its own. A step's path is 14.9 ns in the Spartan-3E's
  delays: at a faster clock the report says so, as of any pipelined loop too slow (#2080). A loop pipelined around
  the call is no longer pipelined (said, its count not a constant), and a call in a loop's condition or after && / || /
  ?: is an error that says to make it a statement of its own. Tests: test/c-mathlib2.test.js, co-simulated in VHDL and
  Verilog on quotients just below and above 2^64, the largest and smallest exponents and subnormals.
