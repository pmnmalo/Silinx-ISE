In detail:

- **The whole CI every night on main, when main changed (#3423):** `.github/workflows/ci.yml` runs on a schedule
  too (23:17 UTC, two hours after the Nightly), its jobs skipped when main has not changed since its last successful
  run on main (`scheduled-changes.yml`, as the Nightly, ISE and Quality); in a concurrency group of its own, so that it
  neither waits for a tag's run (`ci-tags`, #3124) nor makes one wait; a failed job is an issue, as the Nightly's
  (`failure-report.yml`). It publishes nothing, and the Release does not take it for a tag's run (`wait-for-ci.mjs`).
  A tag's run and one by hand skip nothing: ci-ok fails on a skipped job. CLAUDE.md, ONBOARDING.md and the README
  say so.
