In detail:

- **CodeQL's alerts as issues (#2021):** after each analysis, a job of `codeql.yml` (scripts/codeql-issues.mjs) opens
  one issue per open alert of the default branch, never twice for one alert, and closes the issue of an alert fixed
  or dismissed with a comment saying which. Issues are public and a vulnerability is reported privately
  (SECURITY.md): an issue holds only the alert's number and its link, which the maintainers alone can open (no rule,
  file, line or message), labels bug and security. Tests: test/codeql-issues.test.js, test/ci-workflow.test.js.
