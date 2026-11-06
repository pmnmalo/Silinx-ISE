In detail:

- **The ISE comparison at the Optimizations Area and Speed (#2941):** `test/designs-corpus/compare-ise.mjs` built Silinx at
  `optLevel` 1 and 2 and the Quality page called them Normal, the default, and High; since #2470 `optLevel` 1 alone is Fast.
  It now builds Area (a new project's default) and Speed by their ISE properties (`GOAL_IMPL`), records them in the results
  (`optimizations`), and the page names its columns, summary and lines after them; a `--filter` run is not merged into
  results of other Optimizations, and the results before (2026-10-25) still read as Normal and High.
