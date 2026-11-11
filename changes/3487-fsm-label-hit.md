In short:

- **State diagram editor:** a click or a double click on a transition's label selects and edits that transition, even
  where another transition's arc crosses it (it took the other transition's condition).

In detail:

- **The FSM editor's label under the pointer wins (#3487):** a later transition's arc, drawn above an earlier one's
  label, took the press with its wide invisible hit stroke, so a click selected it and a double click opened its
  condition; the pointer's handlers (web/js/fsm-pointer.js) now take the transition whose label is under the pointer
  before the arc. Test: fsm-parts (a click on t1's label and on t4's selects each; a double click on t1's label edits
  t1's condition, undone; t4's opens its own).
