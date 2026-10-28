In detail:

- **The C tests on Windows: the compiled program's output with LF line ends (#1860):** about 25 tests that compare
  the C simulation with the program cc builds failed on Windows only, in the release's CI: the C runtime writes CRLF in
  text mode, the simulator LF. The test helpers (test/c-helpers.js `lf`, used by hdl-c-helpers, ap-int-ref,
  c-interp, cpp and c-stream-array) make the reference's line ends LF, its other characters kept; a test of it in
  test/c-interp.test.js.
