In detail:

- **Auto-merge on every pull request (#2212):** a maintainer's session arms `gh pr merge <N> --rebase --auto` when it
  opens its pull request, and GitHub merges on a green `related-tests`; never during a release.
