In short:

- **Silinx HLS:** a constant initialized by `sizeof`, as `const int N = sizeof T / sizeof T[0];` at file scope or an
  enum constant `enum { N = sizeof T / sizeof *T }`, is a constant in synthesis as a literal is: a loop's bound, an
  array's size, a `case`'s value.

In detail:

- **Silinx HLS: the constants of sizeof (#2654):** a global constant's initializer has its `sizeof` of an array, a
  row or a pointer made `sizeof` of its type (core/c-flatten.js), as the functions' bodies had (#2641); synthesis's
  constants for a `case` fold `sizeof`; an enum constant of `sizeof` becomes a constant declaration
  (core/c-struct.js) instead of the error "its value must be a constant". `static const`, `const unsigned`, C++
  `constexpr`, a constant of another, a struct's and a row's `sizeof`: no message, a literal's trip counts and
  latency, co-simulated against cc.
