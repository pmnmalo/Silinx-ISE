In detail:

- **A release's notes stay under GitHub's limit (#2685):** v15.21.0's notes were about 162,000 characters and GitHub
  refused to create the release (a release holds at most 125,000). `releaseNotes` (core/changelog.js) now keeps the
  introduction, "In short" and as many "In detail" entries as fit, with a line saying how many were left out and
  that the full list is in CHANGELOG.md at the tag, as the development build's notes do (#2411). Test:
  test/changelog.test.js.
