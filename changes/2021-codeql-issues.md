In detail:

- **CodeQL's alerts as issues (#2021):** after each analysis, a job of `codeql.yml` (scripts/codeql-issues.mjs) opens
  one issue per open alert of the default branch (its rule, file and line, CodeQL's message, the alert's link; labels
  bug and security, and tests & CI for one in test/), never twice for one alert, and closes the issue of an alert
  fixed or dismissed with a comment saying which. Tests: test/codeql-issues.test.js, test/ci-workflow.test.js.
