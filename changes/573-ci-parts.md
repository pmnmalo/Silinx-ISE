In detail:

- **CI: the unit tests in three parts of about the same time; fewer UI tests on a pull request (#573):**
  `node --test --test-shard` split the files by their order, so one part took twice the others (24 min on
  Linux against 12 and 10). `scripts/test-shard.mjs` balances the files by their time measured in CI
  (`test/timings.json`; a file not measured weighs the median), the heaviest first into the lightest part,
  three parts on Linux, macOS and Windows (four were no faster); each Linux part uploads its files' times
  (`scripts/test-times-reporter.mjs`), which `scripts/update-test-timings.mjs <run id>` merges into the
  timings. A pull request's CI goes from about 25 minutes to about 17. A part takes at least as long as its longest file (sim-model.test.js, about 16 minutes: the vga
  example's post-synthesis simulation alone takes 11). A pull request runs the classic interface's UI tests
  and Firefox / WebKit only when it changes the interface (`web/`, the UI tests, the browsers' and the
  standalone's scripts, the dependencies, the workflows; `scripts/ci-changes.mjs`); a push to main runs them
  all. Tests: `test/test-shard.test.js`, `test/ci-changes.test.js`.
