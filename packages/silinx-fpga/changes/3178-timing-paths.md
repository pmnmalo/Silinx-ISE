In detail:

- **The slowest paths of the timing analysis (#3178):** `timingGraph().analyze()` returns `paths(n)`, the worst path into
  each flip-flop, slowest first (a path between the clock's two edges counted twice); `fpga/timing-paths.js` gives each
  stage its site, net and source lines (`timingPaths`, `cellSources`, `pathsText`, `pathHighlight`), and the timing
  step writes them to `open/paths.json`.
