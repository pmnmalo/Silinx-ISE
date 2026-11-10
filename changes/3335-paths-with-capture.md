In short:

- **Show Path with the logic analyzer on:** the timing report's paths are traced back to their source lines again when
  the design is implemented with a capture.

In detail:

- **The timing paths with a capture (#3335):** with the logic analyzer (#3176) the synthesis's top is its wrapper; the
  paths now read that netlist, the one the run routed, instead of the project top's from an earlier run, and Show Path
  finds the design's lines. Test: mcp-timing (the clock example timed without and then with a capture: every path
  traced; it failed before).
