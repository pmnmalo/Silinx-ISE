In detail:

- **A pull request's tests in as many parts as they need (#1982):** the PR tests (`pr-tests.yml`) first plan
  their parts (`node scripts/related-tests.mjs <base> <head> --plan`: the related tests' time measured in CI,
  `test/timings.json`, an unmeasured file weighing the median, in parts of about 20 minutes, from one for a small
  change to 16, none when no test is related), then run one job per part (a limit of 60 minutes); the required check
  `related-tests` passes when the plan and every part passed, or when there was no part. A change of most of the
  repository no longer outgrows its parts' time limit.
