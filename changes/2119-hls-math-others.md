In short:

- Silinx HLS makes math.h's other functions in hardware too, float and double: tan, log2, log10, exp2, hypot, fmod, atan,
  asin, acos, atan2, sinh, cosh, tanh and cbrt, with the library the C simulation runs, so the co-simulation compares
  equal bits. fmod is exact for a quotient up to 2^64, and gives NaN beyond it. Their last digit may differ from before
  in the C simulation, and so may sin's and cos's in double near a zero, now more accurate.

In detail:

- **Silinx HLS: math.h's other functions in hardware (#2119):** core/c-mathlib.js has tan (on sin and cos's reduction),
  log2 and log10 (log's m and e, the constants in two parts), exp2, hypot (scaled against overflow, in two steps), fmod
  (long division of the significands, 64 steps, NaN for a larger quotient, so that its circuit stays one a board can
  hold), atan (fdlibm's reduction and polynomial), atan2, asin and acos from atan, sinh, cosh and tanh from exp (a Taylor
  polynomial under 1), and cbrt (Halley's steps and a last Newton's). The C simulation and the constants folded at
  synthesis run them (core/c-float.js's MATH, which gains the float names); within 3 ulps of JavaScript's Math. The hint
  and the refusal list them, lround being the one still of constants only. Tests: test/c-mathlib2.test.js.
- **sin and cos in double near a zero (#2119):** the reduction's second part was fdlibm's pio2_1t, which already holds the
  third part, so n times 2e-21 was counted twice; it is now pio2_2 (tan was 84 ulps off near a pole, now 3).
