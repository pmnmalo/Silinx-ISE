In short:

- **The FSM editor's problems in the console:** its errors and warnings are in the console's Errors and Warnings tabs,
  updated as the diagram is edited; a click on one selects its state or transition. The Problems section of its
  Properties panel is gone.

In detail:

- **The FSM editor's problems to the console (#2737):** the editor gives its validation to `onProblems(diags)` and no
  longer lists it; drawings.js puts its errors and warnings in the console's Errors and Warnings tabs with the ASM
  editor's editor-problems.js (#2730), in the interface's language (again when it changes), removed when the editor
  closes; a row's click selects the state or the transition (`focus(d)`). The notes (a state that stays when no
  condition is true) are no longer listed. A read-only view is not validated. Tests: test/ui/fsm.test.js,
  test/ui/new-source-empty.test.js, test/ui/projects.test.js, test/ui/petri-fsm.test.js.
