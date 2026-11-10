In detail:

- **The truth table's and the Petri net's mount functions split (#3218, #405):** `mountTtEditor` (299 lines) and
  `mountPetriEditor` (300 lines) were at the 300-line limit of a function, and the read-only modes of a shared project
  (#3181) would have taken them over it. The truth table's results (the forms of each output, their notation and tick
  boxes) moved to `web/js/tt-results.js`, and the Petri net's toolbar (its tools, Delete, the zoom, Check, Simulate,
  the ⋮ menu with PNML) moved to `web/js/petri-toolbar.js`. Both moved as they were, with no change in behaviour, and
  each has a test of its own (`test/ui/tt-parts.test.js`, `test/ui/petri-parts.test.js`).
