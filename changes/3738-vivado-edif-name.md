In detail:

- **The 7-series timing measured with Vivado: the netlist named after its top (#3738):** `scripts/xc7-timing-vivado.mjs`'s
  `measure.tcl` read Silinx's netlist as `netlist.edf`, and Vivado's `link_design -top` found no top module in it
  (Project 1-68); it reads it as `<top>.edf` (blinky on the Basys 3: Vivado 198.8 MHz, nextpnr 241.6 MHz).
  test/xc7-timing-vivado.test.js.
