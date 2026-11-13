In short:

- The Try it panel of the state diagram, ASM chart and Petri net editors moves to the left of the drawing, beside the
  Design pane, rather than to its right; the drawing is zoomed to fit whenever the panel moves.

In detail:

- **The drawing editors' bottom panel docked on the left (#3802):** `web/js/dock-panel.js` docks the Try it panel
  (and the FSM's Tables, the Petri net's Analysis) below the drawing or on its left, between the Design pane and the
  canvas, its right edge the one that resizes it (← → on it); a place kept on the right by #3797 reads as the left.
  Whenever the panel moves (its title bar dragged, its ⇆ button, or a narrow screen putting it below), the drawing is
  zoomed to fit the area it is left with, as Zoom to Full View, once the layout has the new size; a plain resize keeps
  each editor's behaviour. Tips in Portuguese; unit and UI tests (both interfaces) updated.
