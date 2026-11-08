# Contributing to Silinx

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

## Contributing from outside

- **Fork the repository** and open a pull request from a branch of your fork, rebased on `main`. Contributors
  do not get write access to the repository.
- **The maintainer reviews, merges and releases** (#1872). GitHub asks the maintainer to approve the test
  runs of each of your pull requests; `related-tests` must then be green. The maintainer merges it
  (rebased, no merge commit) and makes the releases.
- **Issues and labels:** open an issue first and say in it what you plan to do. The maintainer adds the labels.
- **A pull request that changes `.github/`** (the workflows, the actions) is reviewed before any of its runs
  is approved. Keep such a change in a pull request of its own, with its reason in the issue.
- **Xilinx ISE is not needed.** The ISE checks (byte-identical bitstreams, ISE's warnings) run on the
  project's runner after the merge, and a break becomes an issue. Say in the pull request what you could
  not test (ISE, a real board).
- **With Claude Code or another agent:** it reads [CLAUDE.md](CLAUDE.md); the parts of
  [ONBOARDING.md](ONBOARDING.md) about the maintainer's own sessions, the ISE machine and talking with the maintainer do
  not apply to you.

[README.md](README.md#for-developers) explains how to install and run Silinx from source. By
contributing you agree that your contribution is licensed under the project's licence (AGPL-3.0-only,
see [LICENSE](LICENSE) and [NOTICE](NOTICE)).
