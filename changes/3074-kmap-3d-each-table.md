In short:

- **Boolean algebra:** the Karnaugh map's 3D box is each table's own: a map put in 3D no longer turns another table's flat
  map 3D when one of its cells is clicked.

In detail:

- **Each table its own 3D box (#3074):** the 3D box (the stacked maps of 5 or 6 inputs, the cylinder and the torus of 3
  or 4) was one setting for every open table, read when a map was drawn again; it is the editor's now, unticked when a
  table is opened, kept while it stays open; the 3D map's turn too, each table's (one turned no longer turns another's at
  its next redraw). The interface's rules say it (docs/UI-GUIDELINES.md: a document's view is its own).
