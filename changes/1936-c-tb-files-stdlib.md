In detail:

- **Tests: the C reference programs as clang compiles them (#1936):** the test bench of `test/c-tb-files.test.js`
  calls `system()` with `<stdlib.h>` included, which Apple's clang requires (it refused the implicit declaration on
  macOS). The tests' `cc` calls (`c-helpers.js`'s `runC` and `compiledRun`, `c-tb-files`, `c-interp`) make a
  function called without its header an error (`-Werror=implicit-function-declaration`, without `-w`, which made
  GCC drop it), so Linux refuses what clang refuses; the compiler's other warnings stay unprinted.
