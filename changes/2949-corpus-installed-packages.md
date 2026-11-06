In detail:

- **The design corpus checks the packages it runs on (#2949):** `test/designs-corpus/run.mjs` compares the installed
  packages with package-lock.json (`scripts/installed-packages.mjs`) and says, before and after its results, those
  of another version and those Node finds in a `node_modules` above the checkout (a worktree with none of its own runs
  on the main checkout's); `--update` refuses then. verilog-axis-fifo's +50 % slices and uart-for-fpga's +7 % were
  nextpnr 0.15.0's place and route measured against 1.1.0's expectations: on package-lock.json's packages main gives
  the recorded results (20 / 33 / 5.406 ns and 41 / 78 / 4.472 ns); ONBOARDING.md's lessons say to run `npm ci` in a
  worktree.
