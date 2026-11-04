In detail:

- **The Post-Place & Route model's design by nextpnr (#2137).** When the test bench gives the top other generics, the
  design synthesized with them is placed and routed for its model by the family's back end, nextpnr, as Implement does
  (`placeRouteNetlist`, a report and a log of its own), no longer by Silinx's own placer and router. The console says
  "Placing and routing the design synthesized with the test bench's generics (nextpnr), for its model."; a failure names
  nextpnr's reason.
  - **Tests:** test/sim-model-par.test.js (the examples' test benches on their post-place & route models, through
    nextpnr; blinky's with its test bench's generics).
