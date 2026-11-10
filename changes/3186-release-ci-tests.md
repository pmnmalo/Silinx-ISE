In detail:

- **The tests that failed the tag's CI of 15.24.0 (#3186):** `test/vivado.test.js` takes its folder with `fileURLToPath`
  (a file URL's pathname, `/D:/…` on Windows) and expects "'docker' command not found" on a machine with no docker;
  `scripts/resolved-package.mjs` prints the toolchain's folder as a POSIX path on every system; `test/compiled-tables.test.js`
  expects the comparisons' Post-Synthesis Simulation Model as #3097's comparisons as logic make it (15 cells fewer, 5
  tables); the power estimate on the examples has 10 minutes (CI's Windows runner, slower since #3097).
