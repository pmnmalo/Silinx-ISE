In detail:

- **A back end places and routes another netlist (#2137).** The Spartan-3E's and the Spartan-6's back ends give
  `placeRouteNetlist(text, top)`: their Map and Place & Route (nextpnr) on a netlist other than the run's, on a report and
  a log of their own, nothing written; it resolves the routed design. `runFlow` hands it to the simulation models
  (`io.simModels`), which no longer use `placeRouteBest`.
  - **Tests:** test/sim-model-par.test.js.
