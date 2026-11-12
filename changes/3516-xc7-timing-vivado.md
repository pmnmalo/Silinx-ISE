In detail:

- **The 7-series' timing measured with Vivado, the tooling (part of #3516):** `scripts/xc7-timing-vivado.mjs` runs the
  examples' netlists, as Silinx's open flow makes them (Yosys's synth_xilinx, written as an EDIF), through Vivado ML
  Standard 2025.2 on the ISE runner's machine (its Docker image; `--detach`, `--collect`, one design at a time, alone
  there): link_design, place_design, route_design, then write_sdf, report_timing with each path's elements, the timing
  summary's Fmax and the routes' nodes; nextpnr's Fmax on the same netlist alongside. `scripts/xc7-timing-parse.mjs`
  reads the SDF, the paths and the routes; `scripts/xc7-timing-fit.mjs` makes the numbers of them (the cells' delays by
  nextpnr's arcs, the routes' delays by wire class) and fits the table the fork's chip database is built with (the
  slice's LUT and flip-flop stubs replaced, a delay per wire class by non-negative least squares). Only numbers are
  written (packages/silinx-fpga/research/xc7/), never Vivado's files. Tests: xc7-timing-vivado (a hand-written SDF and
  report_timing, the routes, the fit on known delays, the Tcl and the run's script).
