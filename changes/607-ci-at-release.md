In detail:

- **CI at a release only (#607):** `.github/workflows/ci.yml` runs when a version tag `v*` is pushed and by
  hand, no longer on pull requests nor on pushes to main; everything runs (the change detection,
  `scripts/ci-changes.mjs`, and the pull requests' dependency review are gone). The Release workflow checks
  that the tagged commit is on main and waits for that CI run (`scripts/wait-for-ci.mjs`: a run of the tag,
  or one of main started by hand). The development build (`dev-release.yml`) and the site's `dev/`
  (`pages.yml`) are published after every push to main; CodeQL analyses every push to main (no pull
  requests, no weekly run). The ruleset of main no longer requires `ci-ok`; a change is merged when its
  related tests pass locally (CLAUDE.md, ONBOARDING.md, CONTRIBUTING.md, README.md, SECURITY.md). Tests:
  `test/ci-workflow.test.js`, `test/wait-for-ci.test.js`.
