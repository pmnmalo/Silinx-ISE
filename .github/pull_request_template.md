Fixes #

<!-- What the change does and why, in a few lines. The maintainer reviews and merges (CONTRIBUTING.md). -->

- [ ] An issue for the change, named above (`Fixes #N`)
- [ ] Its tests: unit tests, a UI test in both interfaces (and Portuguese for new labels), a regression test for a bug fix
- [ ] A change to the interface keeps its rules, `docs/UI-GUIDELINES.md` (toolbars, read-only views, side panels)
- [ ] The expected warnings asserted, or an explicit "no warnings"
- [ ] A changelog fragment, `changes/<issue>-<slug>.md` (not an edit of CHANGELOG.md)
- [ ] The related tests run locally: `node scripts/related-tests.mjs origin/main HEAD`
- [ ] Not tested (ISE, a real board, a browser): 
