In short:

- **The hold check as trce's:** the hold check of two flip-flops no longer reports as met a hold violation trce finds;
  its slack follows trce's within about 0.1 ns.

In detail:

- **Static timing: the hold check of two flip-flops fitted to trce's hold paths (#2226):** `pads().hold`
  (src/fpga/timing.js) took the inputs' hold time (-1.018 ns, `model.clock.hold`) and `minScale` for every
  flip-flop, 0.57-0.79 ns over trce's slack, so a real violation (trce: -0.659 ns on blinky with 12 clock pins off the
  global lines) was reported as met. The check now takes trce's earliest delays (`model.clock.minLogic` 0.80 of the
  logic's, `minNet` 0.784 of the wires') and the end's own hold margin: each setup arc's third element (`instArcs`,
  src/fpga/timing-arcs.js), the way through the slice at its earliest less the flip-flop's hold time (`Tckdx`,
  `Tckdi`, `Tckdy`, `Tckce`, `Tcksr`, trce's (-Th)), fitted with research/s3e-route/ff-hold.mjs on nine routings of
  blinky and stopwatch. Each routing's worst hold path is then trce's pair of flip-flops, its slack within -0.09 / +0.13
  ns; the periods and the pads' paths are unchanged. Tests: test/fpga-ff-hold.test.js (fixture:
  blinky-hold-violation, trce's numbers).
