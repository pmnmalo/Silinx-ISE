In detail:

- **A code owner's review on `main` (#1888):** `main` requires a pull request approved by a code owner (the
  maintainer), which the admin bypasses; CLAUDE.md and ONBOARDING.md say the maintainer's sessions merge with
  `gh pr merge <N> --rebase --admin` once `gh pr checks <N> --required` is green.
