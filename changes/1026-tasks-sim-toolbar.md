In short:

- **Tasks ▸ Simulate:** the simulator's icons are in the waves' own top line (where "Default.wcfg" was): the waves get
  the toolbar's height.

In detail:

- **Tasks ▸ Simulate: the simulator's icons in the wave window's line (#1026):** in the Tasks interface the
  simulator's toolbar moves into the wave window's caption, whose name ("Default.wcfg") and cursor text are no longer
  shown (`placeSimToolbar` in web/js/tasks-sim.js, web/css/tasks.css); back under the title bar in the modern and
  classic interfaces.
