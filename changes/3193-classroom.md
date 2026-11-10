In short:

- **GitHub Classroom:** `silinx classroom template` makes an assignment's template repository, whose workflow runs the
  exercise's visible tests on each push. `silinx classroom grade` runs all the tests over the students' repositories at
  the deadline, into a CSV, and optionally an issue in each with that student's report (docs/CLASSROOM.md).

In detail:

- **The GitHub Classroom adapter (Fixes #3193, part of #3191):** server/classroom.js and server/classroom-cli.js.
  - makeTemplate writes the template: the starter project, the exercise's student's copy with the files its visible
    tests read, a README in English and Portuguese, and `.github/workflows/silinx-grade.yml`.
    - The workflow installs a release of Silinx, its zip checked against the release's SHA256SUMS, and runs
      `silinx grade --visible`; the report goes in the job's summary.
    - It has no secret, reads the repository only, and pins its actions by their commits.
  - gradeClassroom is the teacher's run, with the GitHub CLI.
    - It takes the organization's `<assignment>-<student>` repositories and clones each with no hooks and no symbolic
      links: its last commit, or the last one before `--before`.
    - It grades each on the whole exercise into a CSV and the JSON, and with `--issues` opens an issue per student.
    - It never runs a student's workflow and never pushes.
  - server/grade.js gradeAll: `expand`, each path one submission.
