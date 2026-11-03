In short:

- **The FSM editor laid out as the other editors:** no hint or status line; the toolbar says "Encoding:" and "Coding
  Style:" before its selectors, shows the zoom level beside the zoom tools and the number of states and transitions at
  its right end; the reset's name is written on the arrow into the initial state.

In detail:

- **The FSM editor's layout (#2729):** the hint line under the canvas and the status line under the editor are gone,
  in the editor and in a Petri net's state machine (read-only). "N state(s), M transition(s)" is the toolbar's
  informational text at its right end (as #2725); the zoom level follows the zoom tools; "Encoding:" and "Coding
  Style:" label the toolbar's two selectors. The reset's name is drawn on the start-up arrow (fsm-render.js). A text
  typed in place that is not valid goes to the console as a warning (`onMessage`), no longer to the status line; a
  read-only view's description is disabled too. Portuguese for the new labels. Tests: test/ui/fsm-layout.test.js (both
  interfaces), test/ui/petri-fsm.test.js, test/ui/fsm.test.js.
