In short:

- Silinx HLS: a loop bounded by `sizeof`, as `for (i = 0; i < sizeof a / sizeof a[0]; i++)`, has its number of iterations and its latency in the synthesis report, as with a number for a bound, and no longer an "unknown trip count" warning.

In detail:

- Silinx HLS: `sizeof` a constant in the checker's constant expressions (`core/c-sizeof.js`, `constValue` in `core/c-check.js`): of a type, a variable, an array, a row of it, an array its initializer sizes, in a loop's bound, start or step and in a `const int` variable, with `<`, `<=`, `!=` and counting down, unrolled and pipelined; the loop's trip count, cycles and latency a literal bound's. An array parameter's or a pointer's `sizeof` (8 bytes, seldom the length meant) is still not a constant there: its loop's count is still said unknown (#2643).
