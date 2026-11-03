In short:

- **Silinx HLS:** the C simulation takes a `switch`'s `case` of a named constant (`const int N = 5; case N:`, an enum
  constant), as the synthesis does; it took only literals and macros before.

In detail:

- **The C simulation's switch: a case of a named constant (#2749):** `switchStmt` in core/c-interp.js folded each
  case's value with no constants in scope, so a case of a global or local `const`, a `static const`, a `constexpr`, an
  enum constant or a `sizeof` one (#2654) never matched and the `default` was taken. Each case's value is now
  evaluated by the interpreter, as any expression. test/c-switch-const.test.js compares the C simulation with cc's (enum constants: GCC takes
  no `const int` as a case label in C) and the named constants' cases with the values written out.
