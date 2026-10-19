# Contributing to Silinx ISE

Contributions are welcome: bug reports, ideas and pull requests.

- **Report a bug or propose a feature** by opening an issue on
  [GitHub](https://github.com/pmnmalo/Silinx-ISE/issues). Say what you did, what you expected and
  what happened (the version, from Help ▸ About, and the console's messages help). Issues are
  public: leave out personal data and code you may not share. A vulnerability is reported privately
  instead, as [SECURITY.md](SECURITY.md) says.
- **Change the code** following the project's development principles, in [CLAUDE.md](CLAUDE.md):
  - how to work: an issue for every change;
  - tests for every change, warnings included;
  - the examples as test designs;
  - ISE as the reference;
  - how to write code: style, Portuguese translations, what must never be committed;
  - how changes are integrated: tests, CI, CHANGELOG, releases.

  The file is named for Claude Code, which reads it at the start of every session, but its rules are
  the same for everyone, people and AI agents alike.
- **Before opening a pull request:**
  - run the test files of the modules your change touches (`node scripts/related-tests.mjs origin/main HEAD`);
    the pull request runs the same on GitHub, and the full suites run at a release;
  - add a changelog fragment, a new file `changes/<issue>-<slug>.md` (not an edit of CHANGELOG.md), as
    [changes/README.md](changes/README.md) says;
  - reference the issue (`Fixes #N`).

  The tests against ISE run on the project's own runner after the merge; a pull request's code never
  runs there.

[README.md](README.md#for-developers) explains how to install and run Silinx from source. By
contributing you agree that your contribution is licensed under the project's licence (AGPL-3.0-only,
see [LICENSE](LICENSE) and [NOTICE](NOTICE)).
