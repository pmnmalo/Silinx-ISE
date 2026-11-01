In detail:

- **The weekly comparison with ISE gets 20 hours (#2498):** the comparison took 14h13m on 2026-10-25 and was cancelled
  at its 15 hours on 2026-10-31, with no results that week. `.github/workflows/quality.yml`'s `compare` job now has
  1200 minutes; the runner's window does not close while a job runs. Test: test/workflows.test.js.
