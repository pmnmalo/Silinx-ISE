In detail:

- **An exercise's process check refused, with its reason (#3329):** a check test's `process` check (a guided lab's: it
  reads the last run's reports, which grading does not run) is one of the exercise's problems
  (`core/grade-format.js exerciseProblems`: "a process check is a guided lab's: grading runs its own synthesis test"),
  no longer listed among the checks an exercise can have (`GRADE_CHECKS`); an exercise graded all the same gives that
  test a Grading Error with the same reason, not a Runtime Error from a TypeError (`io.reports is not a function`).
  Tests: grade (the exercise's problem; its grading's Grading Error; a check of no kind graded).
