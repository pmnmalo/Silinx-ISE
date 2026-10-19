In detail:

- **CodeQL nightly on main and at a release (#607):** `codeql.yml` runs every night on main when its
  JavaScript changed since the last successful run (`scheduled-changes.yml`; Security ▸ Code scanning tracks the
  default branch's alerts), when a version tag `v*` is pushed and on demand, which always run; not on pull
  requests. Test: `test/ci-workflow.test.js`.
