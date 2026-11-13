In short:

- **State diagrams:** while Try it is open, the diagram cannot be changed: states and arrows stay where they are and
  the Properties panel's fields are disabled, as in the schematic's Try it.

In detail:

- **The FSM editor locked while Try it is open (#3793):** a state is not moved, an arrow not bent, no transition drawn,
  no state added and nothing edited in place; Delete, Cut, Paste, Undo / Redo and the toolbar's State, Delete, Arrange,
  Encoding and Coding Style are disabled; a state or a transition is still selected, its properties shown with their
  fields disabled and their buttons hidden, as in a read-only diagram. The view is still panned and zoomed, and the
  simulation stepped. A text being typed in place is applied when Try it opens; closing Try it unlocks the diagram.
