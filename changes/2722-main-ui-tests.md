In short:

- **A state diagram's state no longer shows "null":** a selected state with no comment had the word "null" in its
  properties.

In detail:

- **UI tests in step with main again (#2722):** a state's properties in the state diagram editor showed the text
  "null" under its name when it has no comment (since #2696; web/js/fsm-side.js), which the FSM editor's Portuguese
  test caught, now with an assertion of its own; the hierarchy test expects a Petri net's [FSM] badge (#2696); the open
  toolchain's Technology Schematic test, blinky's and pong's cell counts after their counters were narrowed (#2321).
