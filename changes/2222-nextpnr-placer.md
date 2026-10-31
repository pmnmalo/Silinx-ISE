In short:

- **The nextpnr engine's designs run faster:** the examples' periods about 2 % shorter, for a Place & Route that takes
  longer (an annealing after nextpnr's analytic placement).

In detail:

- **The nextpnr engine's placer: an annealing refinement, delays fitted to Silinx's routes (#2222):** nextpnr-spartan
  v0.11.0 refines nextpnr's analytic placement with a timing-driven annealing that moves the carry chains and slices
  whole, its delay estimates fitted to Silinx's delays of routed designs (a LUT's output and a flip-flop's apart, a net's
  load by its fanout). On the examples on the four devices the periods are 1.4 % shorter at best of 8 placements and
  2.1 % on average, the slices unchanged; each placement takes three to five times as long.
