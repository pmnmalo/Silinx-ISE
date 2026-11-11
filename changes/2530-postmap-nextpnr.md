In short:

- **Post-Map Simulation Model:** on the Spartan-3E it is now made of nextpnr's packing, the slices as the bitstream fills
  them, no longer of Silinx's own packer.

In detail:

- **The Post-Map Simulation Model from nextpnr's packed design (#2530):** nextpnr packs at Place & Route, so Generate
  Post-Map Simulation Model places and routes the design as Place & Route does (its seeds: the same design) and writes the
  model of its routed design without the routing: the Post-Place & Route model's primitives with no LOC and no timing
  (`core/sim-model.js` postMapModelsOfRouted). The design synthesized with the test bench's generics and the Board
  Emulator's design are placed once each, and the Post-Place & Route model of a run reuses the first. The Spartan-3E's
  back end says it packs at Place & Route (`packsAtPar`, `open-flow-backends.js`); the Spartan-6's, whose Map is still
  Silinx's, keeps the model as it was.
