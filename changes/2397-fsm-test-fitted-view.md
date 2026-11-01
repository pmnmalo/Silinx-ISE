In detail:

- **The state diagram's UI test waits for the fitted view (#2397):** the test read a state's position before the
  editor's first fit (only the circle's size was waited for) and double-clicked 130 px under it after the fit,
  on that state's rim, where no name field opens: it failed on fast CI runs. It now waits for the view fitted
  (`fitted()`, new in the editor's API, web/js/fsm-editor.js) and for the point to be the empty background.
  Checked with the editor's first fit delayed by up to 1.5 s, in both interfaces. Test: test/ui/fsm.test.js.
