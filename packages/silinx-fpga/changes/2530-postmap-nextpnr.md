In detail:

- **A back end that packs at Place & Route says so (#2530):** the Spartan-3E's back end (nextpnr) mounts with
  `packsAtPar: true`, and `runFlow` gives the simulation models `packsAtPar()`: the IDE's Post-Map Simulation Model is then
  written from nextpnr's routed design (without the routing) rather than from `fpga/pack.js`.
