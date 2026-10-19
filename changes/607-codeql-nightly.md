In detail:

- **CodeQL nightly on main and at a release (#607):** `codeql.yml` runs every night on main (Security ▸ Code
  scanning tracks the default branch's alerts; new query sets find old code), when a version tag `v*` is pushed
  and on demand; not on pull requests. Test: `test/ci-workflow.test.js`.
