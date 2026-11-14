# Grading with GitHub Classroom

A Silinx exercise ([GRADING.md](GRADING.md)) can be a GitHub Classroom assignment (#3193).

- **Each student** gets a repository made from the assignment's template. On each push, GitHub runs the exercise's
  visible tests and shows the verdicts in the run's summary.
- **The teacher** runs all the tests, the hidden ones too, over every student's repository at the deadline, from
  their own machine or a private repository of theirs. The result is a CSV, and optionally an issue in each student's
  repository with that student's report.

The hidden tests never go in the students' repositories. Whatever runs there, a student can read or change: the
template has the student's copy of the exercise only, with its visible tests and no reference.

## 1. The template repository

Make the template from the exercise and the project the students start from (`exercises/counter4` is an example):

```bash
silinx classroom template exercises/counter4/counter4.exercise.json exercises/counter4/starter counter4-template
```

Leave out the starter project, and the template's starter is made from the statement: a `silinx.json` of the Basys2 and the
top module with the statement's ports and an empty body, in VHDL (`--language verilog` for Verilog). In Silinx, the
Exercise document's ⋮ menu makes the same template as a zip (**Classroom Template…**, the starter in the language chosen,
on the project's board and device), and **Export Student Copy** saves the student's copy alone. The MCP server's `grade`
tool does both (`template`, `student_copy`).

The folder `counter4-template` then holds:

- the starter project (its `silinx.json` and sources);
- `counter4.exercise.json`, the student's copy of the exercise (`silinx grade --student-copy`);
- the files its visible tests read, such as `tests/count.vec`;
- a `README.md` for the students, in English and Portuguese;
- `.github/workflows/silinx-grade.yml`. On each push, it installs a release of Silinx (the version in
  `SILINX_VERSION`, the zip checked against the release's `SHA256SUMS`), then runs
  `silinx grade counter4.exercise.json . --visible`. The report goes in the job's summary, each verdict is an annotation of the
  commit's check (`--annotations`), and the job fails while a visible test is not Accepted. The workflow uses no secret and reads the repository only.

Push the folder as a repository of the course's organization, and mark it a template (Settings ▸ Template repository).
With the GitHub CLI:

```bash
cd counter4-template && git init -b main && git add -A && git commit -m "counter4" && gh repo create my-course/counter4-template --private --source . --push
gh repo edit my-course/counter4-template --template
```

## 2. The assignment

In GitHub Classroom, create an assignment with the template repository as its starter code. Its repository prefix is
the assignment's name, here `counter4`: the students' repositories are then `counter4-<student>`. Classroom's own
autograding is not needed: Silinx's workflow is the check.

## 3. What the students see

- Each student accepts the assignment, gets a repository, and opens it in Silinx, where **Project ▸ Exercise…** runs the visible
  tests in the page.
- Each push runs the workflow. The Actions tab, or the commit's check, shows the verdict of each visible test, and for a
  Wrong Answer, the cycle, the signal, the expected and obtained values and the cycles around it.
- In Silinx, after a push, **Git ▸ GitHub Checks** says the same verdicts in the console, with the first difference of
  each Wrong Answer (the MCP's `git_checks` too). A private assignment's repository needs the sign-in: Sign in with
  GitHub… with the private repositories in the browser edition, `GH_TOKEN` for a server.
- The hidden tests' verdicts come at the deadline, from the teacher.

## 4. The teacher's run at the deadline

On the teacher's machine, where the GitHub CLI is signed in with access to the organization (`gh auth login`), run the
whole exercise, the teacher's own with its hidden tests, over every repository of the assignment:

```bash
silinx classroom grade exercises/counter4/counter4.exercise.json --org my-course --assignment counter4 --out runs/counter4 --before 2026-12-01T23:59 --csv grades.csv
silinx classroom grade exercises/counter4/counter4.exercise.json --org my-course --assignment counter4 --out runs/counter4-issues --issues --quiet
```

- The organization's repositories named `<assignment>-<student>` are cloned into `--out/<student>`. `--before` takes
  each repository's last commit before the deadline; a repository with none is graded as having no submission.
- Each repository is cloned with no hooks and no symbolic links (one is a plain file). None of the students' workflows
  runs, nothing is pushed, and each submission is graded in a process of its own within the exercise's limits.
- `grades.csv` has one row per student: the points, the overall verdict, then each test's verdict and points. `--json`
  writes the full results.
- `--issues` opens an issue in each student's repository with their report: a visible test's details, and for a hidden
- `--json grades.json` can be opened in Silinx, from the Exercise document's ⋮ menu (**Class Results…**): one row per
  student, one per test (the class's weakest first), and Export CSV ([GRADING.md](GRADING.md)).
  test its verdict and points only.

The same run can be a workflow of a private repository of the teacher's, holding the exercise with its hidden tests.
It is triggered by hand, runs `silinx classroom grade` with a token that may read the organization's repositories (a
secret of that private repository, as `GH_TOKEN`), and keeps the CSV as an artifact. The token is never given to the
students' repositories.
