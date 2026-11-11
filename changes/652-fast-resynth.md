In short:

- **Optimization Fast: faster short control paths.** The open synthesis at Fast now makes the critical path's LUTs one level
  shallower, as Speed does, without a second mapping: the clock example 8 % faster, micro80 5 %, some state machines' and
  FIFOs' paths up to 17 %.

In detail:

- **Optimization Fast: the critical-LUT resynthesis of Speed on the usual mapping's netlist (#652).** The usual mapping
  followed a short control path as written, a LUT level more than XST's. Fast's netlist now has its critical LUTs rebuilt
  one level shallower, their fan-out kept, when DEPTH_RULE keeps it (packages/silinx-fpga, synth-fast.js). Area is
  unchanged. The details and measures are in the toolchain's changelog.
