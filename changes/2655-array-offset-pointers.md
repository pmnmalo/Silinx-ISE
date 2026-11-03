In short:

- **Silinx HLS's C simulation:** a test bench's pointers into arrays work as in C: `int *p = a + 1`, `strlen(b + 1)`,
  `p++`, `p - a`, `p < a + 4`, passed to functions; a pointer moved or read outside its array stops the run there.

In detail:

- **Pointer arithmetic in the C simulation (#2655):** an array, a pointer into one or a string literal plus or minus an
  integer (`a + k`, `k + a`, `p - k`, `&a[k]`, one past the end too) is a pointer to that element; `p++`, `p += n`,
  the difference of two pointers into one array (a ptrdiff_t), their comparisons, `==` / `!=` of any two and of a
  pointer and NULL; such pointers given to functions, to strlen, strcat, memcpy and printf's `%s`; into a row of an
  array of arrays (`m[1] + 2`) and into an array of strings (`const char **n = names + 1`). A pointer moved outside its
  array, read or written one past its end, or pointers into different arrays subtracted or compared, stop the run
  with their place (core/c-interp-expr.js). In synthesis `int *p = k + a` is taken as `a + k` (core/c-pointer.js);
  `p - a`, `p < q`, `g(a + 1)` and `m[1] + 2` are still refused there, said (#2751).
