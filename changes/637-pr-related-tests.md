In detail:

- **Pull requests run the test files of the modules they change (#637):** CI runs at a release only (#607), and
  a change merged after one test of its module, run by name, broke the module's other tests (#635). Each pull
  request now runs, on GitHub (`.github/workflows/pr-tests.yml`, three parts of about the same time), the whole
  test file of every module it changes: `scripts/related-tests.mjs` finds the unit test files that import a
  changed file, directly or through a test helper, a changed test file, and the UI test of a changed page
  script, and a test that names a changed file it reads. main requires its check, `related-tests`. Test:
  `test/related-tests.test.js`.
