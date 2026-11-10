In detail:

- **Paths between two points (#3178):** `analyze().paths(n, { from, to })` keeps the paths from some flip-flops (a pass
  of their own) into some others, and `pins()` lists the flip-flops' pins; `timingPaths(…, { between: true })` gives
  the registers (`points`) and the worst path of each two (`pairs`), which the timing step writes to `open/paths.json`;
  the API gains `betweenPaths`.
