In detail:

- **A pull request runs three more of the repository's checks (#3761).** `test/unused-exports.test.js`,
  `test/url-pathname.test.js` and `test/web-markup-interpolations.test.js` scan the whole repository, as the others of
  `REPO_WIDE` do: a change that broke them passed its `related-tests` and failed only in the nightly and the full CI
  (#3728, #3732, #3734). They run for every change now (about 1 s together).
