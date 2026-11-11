In detail:

- **PR tests: the repository-wide tests on every pull request (#3461):** `scripts/related-tests.mjs` adds a fixed list
  (`REPO_WIDE`) to the tests of a change: the eleven unit test files that scan the whole repository rather than one
  module (old name, changelog and its fragments, private data, safe output, family conditions, code size, layering,
  the toolchain's boundary, documentation, translations), each a few seconds, so that a pull request adding a file
  that breaks one fails its own check, not the next one's. A test checks that each listed file is there and reads the
  repository.
