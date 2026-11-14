In short:

- **GitHub Classroom: each verdict an annotation:** the assignment's workflow says each visible test's verdict as an
  annotation of the push's check, shown on GitHub beside the run and read back by Silinx.

In detail:

- **A submission's verdicts as GitHub's annotations (part of #3194):** `silinx grade --annotations <file>` writes GitHub's
  workflow commands (`core/grade-annotations.js`): the total first, then each test, an error when it is not Accepted and
  a notice when it is, within GitHub's ten of each per step (the failed first; what is left said in the total). The
  student's text is escaped as the workflow commands ask (`%`, CR, LF; `,` and `:` in a property), so a design's names
  cannot write a command of their own. The Classroom template's workflow (`silinx classroom template`) prints them in
  its job's log. `core/github-checks.js` reads a commit's check runs and their annotations through GitHub's REST API
  (`commitChecks`), and says them as the console's lines (`checksLines`), for Git ▸ Checks. The stand-in for GitHub
  (`test/fake-github.mjs`) has a commit's check runs. Tests: grade-annotations (on the shipped exercise's template too),
  github-checks, classroom.
