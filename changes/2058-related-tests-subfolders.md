In detail:

- **A pull request's tests: the helpers in the tests' subfolders followed (#2058):** scripts/related-tests.mjs counts as
  a test helper a .js / .mjs at any depth of test/ and packages/silinx-fpga/test/ (not test/ui/), so a change of
  core/schdoc.js runs test/schematic-corpus.test.js, through test/schematic-corpus/lib.mjs; #1988's did not, and main
  broke (#2055). Tests: test/related-tests.test.js.
