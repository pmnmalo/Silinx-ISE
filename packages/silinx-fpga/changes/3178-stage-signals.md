In detail:

- **A timing path's stages name their signals (#3178):** each stage of `timingPaths` gains `signals`, the named Yosys
  signals its cells drive (a clock-to-out's flip-flop, a logic stage's LUT, a setup's logic and register), by which the
  IDE finds a path's elements in its drawings.
