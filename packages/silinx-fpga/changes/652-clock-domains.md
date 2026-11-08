In detail:

- **Each clock's own critical path made shorter, not only the slowest clock's (#652).** The mappings for speed aim at
  the estimate's critical path, the slowest clock's: ABC's depth and the critical-LUT resynthesis left a second clock's
  path to area. vtr-stereovision3's `tm3_clk_v0` (the one clock of the ISE comparison's PERIOD) had 3 levels of LUTs into
  a counter's enable where XST has 2, under `tm3_clk_v2`'s I2C logic. `domainDelays` (synth-open-path.js) gives each
  clock's estimated critical path; every end of `pathEnds` now carries its `clock` (the latches one group, `latch`).
  After the critical-LUT resynthesis, a design of several clocks has the critical LUTs of each other clock made
  shallower too (synth-open-resynth.js, `r.depth.domains`), kept when no clock's path gets longer and DEPTH_RULE keeps
  the clocks' geometric mean. On the design corpus at Speed and at Normal: vtr-stereovision3's `tm3_clk_v0` 5.04 ->
  3.89 ns by the estimate, vtr-ch-intrinsics' clock 4.25 -> 4.17 ns, both with the same LUTs and slices; the other 65
  designs and the examples (one clock each) have byte-identical netlists. By ISE's trce on the routed designs
  (compare-ise.mjs, main against the change): vtr-stereovision3's `tm3_clk_v0` 5.958 -> 5.306 ns at Speed (-10.9 %)
  and 5.714 -> 5.201 at Area (-9.0 %), 3 -> 2 levels as XST's (4.94 and 5.01 ns), `tm3_clk_v2` 6.882 -> 6.782 and
  7.128 -> 7.124, the same slices; Fast (no resynthesis) and vtr-ch-intrinsics unchanged; every DRC as before, bitgen ok.
  - **Tests:** test/synth-open-domains.test.js (domainDelays on hand-written netlists: two clocks, a block RAM's ports,
    the latches, one clock, no flip-flops; a design of two clocks in VHDL and in Verilog at both efforts: its faster
    clock's enable 3 -> 2 levels, the slower clock's path and the LUTs unchanged, no warning, the netlist simulated).
