In detail:

- **Vivado timing nextpnr's placement, the tooling (part of #3803):** `scripts/xc7-timing-vivado.mjs --placement` places
  each example's netlist with nextpnr here (as the open flow runs it: the same arguments, now `xc7ParArgs` of
  open-flow-xc7.js, its design written with `--write`), and has Vivado route and time that placement: measure.tcl, after
  link_design, finds each cell's site from its tile's grid point (Vivado's GRID_POINT_X and _Y, nextpnr's tile names) and
  fixes it there (place_cell, IS_LOC_FIXED and IS_BEL_FIXED; the same constraints written as placement.xdc), then
  place_design places only what nextpnr's placement did not give (the IO buffers at their pins, a carry chain nextpnr
  moved by a MUXCY), and route_design routes it; placement.rpt counts the cells fixed and those not. The numbers go to
  each example's `nextpnrPlacement` in research/xc7/vivado-timing.json, Vivado's own measurement and the fit kept. It
  separates the placement's quality from nextpnr's estimate of its delays. Tests: xc7-timing-vivado (the cells nextpnr
  placed and those it made, the Tcl run by tclsh on Vivado's commands stubbed, the counts, the measurement file).
