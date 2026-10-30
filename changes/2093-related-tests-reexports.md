In detail:

- **A pull request's tests: through re-exports and a page script's imports (#2093):** scripts/related-tests.mjs counts as
  changed a module that re-exports names of a changed one (a split module's old one: core/schdoc.js of
  core/schdoc-symbols.js), selects a UI test that imports a changed module, follows a page script's absolute imports
  (/core/…, /js/…) and selects the UI test of a page script that imports a changed module. A change of the symbols'
  definitions now runs the tests that list their parameters (test/schmulti.test.js, test/symdocs.test.js,
  test/ui/sch-props.test.js…), which three pull requests broke on main without running them (#2086, #2091, #2096).
  Tests: test/related-tests.test.js.
