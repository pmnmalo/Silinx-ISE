In detail:

- **A pull request's tests get 90 minutes a part (#1982):** a change of the open toolchain runs "the examples on
  every board", 41 minutes alone on GitHub's runner, and its part passed the 45 minutes with its UI tests, so
  `related-tests` reported a cancellation instead of a result. `.github/workflows/pr-tests.yml`'s parts now have 90
  minutes. Test: test/related-tests.test.js.
