In detail:

- **The UI tests with out-of-date npm dependencies (#2649):** the harness's check of node_modules also lists a
  dependency installed at another version than package-lock.json's, and fails at once with "run npm ci". A
  worktree's node_modules left from an older main (nextpnr 0.13.0 where the lockfile has 0.15.0, the browser
  edition's default engine) made the browser edition's Back-annotate Pin Locations test time out after 120 s.
