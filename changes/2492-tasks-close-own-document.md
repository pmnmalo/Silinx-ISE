In short:

- **Tasks: a document closed brings the task's own document forward:** closing a source in Design no longer leaves
  the workspace blank when the Design Summary (Implement's) was opened after the task's other sources.

In detail:

- **A document closed in the Tasks interface: the task's own last document in its place (#2492):** the document
  that comes forward was the last one opened, which could be another task's (the Design Summary, opened with the
  project or by Implement), hidden in the current task: the task's remaining tab not active, its document not
  shown. The task's own last document comes forward now (web/js/tasks.js). The flaky "#1564 Tasks: the last
  document of a maximized task closed" UI test hit this when the project's Design Summary opened late, after the
  test's sources. Test: test/ui/tasks.test.js (a regression test, failing on the old code).
