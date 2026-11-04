In short:

- **Silinx HLS:** a synthesized function's pointers into arrays can be subtracted (`p - a`) and compared (`p < a + 4`,
  `p == e`), passed to functions after they move or as `a + k` (`g(a + 1)`), and point into a row (`m[1] + 2`).

In detail:

- **Pointers into arrays in synthesis (#2751):** a pointer variable with one target in a difference or a comparison
  with another place in that array (`a`, `a + i`, `&a[i]`, `m[r] + j`, a pointer into it) is a difference or a comparison
  of their offsets; `g(a + k)` is `g(&a[k])`, and a moved pointer passed on `&a[p_off]` (core/c-pointer.js). The callee
  is inlined with its indexes from k (core/c-inline.js); in a combinational module its array is the caller's elements
  from k, a multiplexer of them by k when k is not a constant, written back after the call (core/c-dataflow-expr.js).
  A pointer into a row of an array of arrays has a flat offset, its elements `m[k / C][k % C]`. A pointer with several
  targets in a difference or a comparison, or a place in an array given to a sub-module, is said; a pointer's own error
  no longer comes with "pointer arithmetic is not possible" too (core/c-check.js). The hint of the pointer errors says so,
  in English and Portuguese.
