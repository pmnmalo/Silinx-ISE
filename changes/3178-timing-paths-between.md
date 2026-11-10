In short:

- **The paths between two registers:** the timing report's Paths panel has From and To, two of the design's
  registers: the worst path between them, or from one into each register it reaches, or into one from each that
  reaches it.

In detail:

- **Paths between two chosen points (#3178):** the timing step keeps the worst path of each two registers (a
  flip-flop's named signal) in `build/open/paths.json` (`points`, `pairs`); the Paths panel's From and To choose them,
  and the MCP server's `timing_paths` takes `from` and `to` (a register by its name or its last part). On blinky the
  path from speed_ctrl's level into its ticks is the critical path, and the slowest pair the slowest path.
