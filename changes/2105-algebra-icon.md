In short:

- The Boolean Algebra source has an icon of its own, an expression with a bar (Ā·B), instead of the old truth
  table's grid.

In detail:

- **Boolean Algebra: an icon meaning algebra (#2105):** web/js/icons.js's new `algebra` icon (Ā·B on paper, drawn
  with paths so a row's text stays its label) is used in the Design pane's rows, the New Source list, the Tools
  menu, the document's tab and the processes; the old id `truthtable` draws it too. Tests:
  test/ui/algebra-icon.test.js, both interfaces.
