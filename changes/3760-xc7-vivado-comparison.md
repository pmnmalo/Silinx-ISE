In short:

- **The 7-series against Vivado (experimental):** every example on the Basys 3 and the Nexys A7 compared with AMD Vivado:
  about the same LUTs, and Vivado's design rule check passes on Silinx's netlists; the table is in docs/TOOLCHAIN.md.

In detail:

- **The 7-series' examples against Vivado (#3760, part of #3145):** `scripts/xc7-vivado-compare.mjs` builds every example
  on the Basys 3 and the Nexys A7 three ways: Silinx's open flow; AMD Vivado's own flow from the HDL, as the application's
  Vivado flow runs it; and Silinx's netlist placed, routed and written as a bitstream by Vivado (Vivado's DRC and
  `write_bitstream`'s on Silinx's synthesis, its LUTs counted Vivado's way, #3160). The results are recorded in
  `test/xc7-vivado-comparison.json`, their table is in docs/TOOLCHAIN.md, and `test/xc7-vivado-comparison.test.js` checks
  them: Vivado's builds with the expected warnings, routed, met and DRC clean; Silinx's netlist through Vivado's DRC with
  its clock met; the open flow's LUTs and frequency within bounds of Vivado's. `test/vivado/examples.test.js` builds the
  examples on the Nexys A7 too. What it found: Vivado builds every example with only the known warnings on both boards,
  and accepts every netlist of Silinx's (no DRC error, its bitstream written); Silinx's LUTs are about Vivado's (1,308
  against 1,267 on the Basys 3), nextpnr's frequency estimate 1.2–1.75 times Vivado's timing of the same netlist, and
  stopwatch's DSP48E1s 2.2 times (#3875); Silinx's .bit is not compressed where the XDC asks for it (#3876). The
  comparison in the weekly Quality workflow is #3834.
