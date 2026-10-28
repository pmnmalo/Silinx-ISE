In detail:

- **The C and C++ tests on Windows, the rest of the line ends (#1875):** after #1860 four tests still failed on Windows
  in the release's CI: the C simulation's output against the program's when the program exits with an error code, the
  file the test bench writes (`result.dat`), and the C++ tests of std::vector and hls::stream, which read the program's
  output on their own; all read through `lf()` now, and a test in test/c-interp.test.js fails on any test file that
  reads a compiled program's output without it. The printf test's `%ld` takes a value of 32 bits: `long` is 32 bits on
  Windows, 64 on Linux and macOS.
