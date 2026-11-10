In short:

- **Exercises in the interface:** Project ▸ Exercise… opens a graded exercise. A student reads its statement and runs
  its visible tests on their project. A teacher makes one from the project's top and edits its tests in its Properties.
  An example ships: `exercises/counter4`.

In detail:

- **The Exercise document (Fixes #3192):**
  - web/js/exercise-view.js: Project ▸ Exercise… and a `.exercise.json` opened from the Files. The document has Add
    Test, Delete Test and Run Visible Tests, the ⋮ menu's Run All Tests and Ports from the Top, the statement in the
    interface's language, the ports, the tests with their verdicts and points, and the report in the console.
  - web/js/exercise-props.js: the Properties panel (the title, the statement and the top, the selected test's
    settings), folded as the editors' are, behind ☰ Properties on a narrow screen.
  - web/js/i18n-grade.js: the Portuguese labels.
  - core/grade-format.js: withFileTexts (an exercise's files beside it, read from the project), newExercise and
    exerciseFileOf (New Exercise).
  - The MCP server's grade tool: the action new.
  - exercises/counter4: the example exercise, with its starter project.
