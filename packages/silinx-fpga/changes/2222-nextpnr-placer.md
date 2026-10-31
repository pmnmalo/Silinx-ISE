In short:

- **`--engine nextpnr` gives faster designs:** about 2 % shorter periods, for a longer Place & Route.

In detail:

- **The nextpnr engine's placer (#2222):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.11.0. HeAP's refinement is a timing-driven annealing (placer1 from a temperature of 1e-2 in a window of 30 tiles, 30
  passes a temperature, the criticalities to the 4th) that moves the carry chains and slices whole; the placer's delays
  are fitted to Silinx's delays of the examples' routes (from a flip-flop's Q through an OMUX, from a LUT by its CLB's
  fast connects, by the distance) plus a net's load, about 60 ps a doubling of its fanout. Settings tried and dropped
  are reported in the issue.
