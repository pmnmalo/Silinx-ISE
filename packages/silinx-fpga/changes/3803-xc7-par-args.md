In detail:

- **The 7-series' nextpnr arguments in the package's API (part of #3803):** `xc7ParArgs` of open-flow-xc7.js, the
  arguments Place & Route runs nextpnr with (the same as before), exported from index.js with `nextpnrXdc` and
  `portBits`, for Silinx's scripts/xc7-timing-vivado.mjs, which runs nextpnr again with them for its placement
  (`--placement`: Vivado routing and timing it).
