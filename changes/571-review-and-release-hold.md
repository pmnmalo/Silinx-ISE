In detail:

- **Contributing rules (#571):** CLAUDE.md and ONBOARDING.md say how a pull request of another session is
  reviewed (its intent and evidence; line by line only where the risk is), that nothing merges during a release
  until the tag is pushed, and that a scheduled session watches main's CI (a flaky job rerun once, an issue,
  the core session told of real breaks). Sparse checkouts in CI were measured and not taken up: a checkout takes
  about 2 s against 10 to 25 minutes of tests.
