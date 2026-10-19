In detail:

- **CI: the unit tests in three parts of about the same time (#573):**
  `node --test --test-shard` split the files by their order, so one part took twice the others (24 min on
  Linux against 12 and 10). `scripts/test-shard.mjs` balances the files by their time measured in CI
  (`test/timings.json`; a file not measured weighs the median), the heaviest first into the lightest part,
  three parts on Linux, macOS and Windows (four were no faster); each Linux part uploads its files' times
  (`scripts/test-times-reporter.mjs`), which `scripts/update-test-timings.mjs <run id>` merges into the
  timings. A CI run's unit tests take about 17 minutes instead of 24. A part takes at least as long as its longest file (sim-model.test.js, about 16 minutes: the vga
  example's post-synthesis simulation alone takes 11). Tests: `test/test-shard.test.js`, `test/ci-workflow.test.js`.
