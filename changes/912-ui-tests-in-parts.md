In detail:

- **CI: the UI tests in three parts per interface (#912):** `scripts/test-shard.mjs --ui` balances the UI test
  files (`test/ui/*.test.js`) by their times in `test/timings.json`, as the unit tests' parts; the `ui` job runs
  each interface in three parts (six jobs of about 10 minutes, the longest file 7), one file at a time. The
  `--test-concurrency=1` that CI gave the UI tests came after their files, where `node --test` takes no option:
  they ran three files at a time. Each part uploads its files' times (`ui-times-<interface>-<part>`), which
  `scripts/update-test-timings.mjs` merges with the unit tests' (a UI file's time the slower interface's); a
  file's time is now its own process's, from the runner's summary of the file (the UI tests' own events name
  their helper, `test/ui/harness.js`). The UI timings start from a CI run of 22 October 2026 (each test's time in
  its output, summed by its file; then three files at a time).
