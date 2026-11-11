In detail:

- **Optimization Fast: a deep design too large for DEEP_RULE gets the SOP balancing again (#370).** Fast was Yosys's usual
  mapping alone, and #3096's DEEP_RULE (1500 LUTs at most) synthesizes only a smaller deep design as at Speed. So the EPFL
  arbiter kept the area script's mapping of its 128 ring-shaped priority chains: 4033 LUTs and 30 levels, the "area mapping
  larger than its depth mapping" of #370. The old Normal effort had given it the GIA's SOP balancing (DEPTH_SOPB, #654).
  `synthesizeFast` now asks the usual run for it (synthesizeVerilog's `sopb: n`, with depth false: the design written before
  its LUT mapping, without the wide-multiplexer count, and that one remap for a design of more than n LUTs and more than
  SOPB_RULE.levels levels). The remap is kept when DEEP_RULE.gain (10 %) faster, as the old Normal kept it, and its result
  is in `r.depth.sopb`. The order with #652's critical-LUT resynthesis at Fast: the balancing first (in the usual run), then the
  resynthesis of the netlist that run keeps, so it works on the shallower netlist (and leaves one above SPEED_RULE.maxLuts,
  as the balanced arbiter, as it is). Every other design's Fast netlist is byte-identical: the examples, iwls05-spi, iwls05-i2c and the
  corpus's deep designs below 1500 LUTs, whose deep path is unchanged. Area and Speed are unchanged.
  - **Measured** (the app's flow, the EPFL arbiter in the corpus's I/O wrapper on the XC3S1200E, Silinx's estimate after
    Place & Route, seeds 1 / 2 / 3): 4090 -> 2579 LUTs (-37 %), 2070 -> 1290 slices (-38 %), 30 -> 7 levels, 37.52 / 40.12 /
    37.74 -> 12.60 / 12.71 / 12.77 ns (-67 %). The other deep designs above 1500 LUTs come out the same: epfl-sin,
    epfl-voter, itc99-b20, b21, b22, secworks-sha256, the T80 and vtr-sha (the balancing is not 10 % faster on them, or
    they are not deeper than 16 levels). It costs one remap of seconds on such a design.
  - **Tests:** test/synth-goal.test.js (a 128-request priority encoder with DEEP_RULE.maxLuts below its size: 42 levels and
    49.0 ns in the usual mapping, 6 levels and 7.70 ns so, 217 LUTs, 109 slices, then 7.62 ns with #652's resynthesis; not 10 % faster: the usual netlist, the
    same as FAST_SYNTH's; the netlist simulated against the design; no warning). The traffic test checks that a design not
    deep keeps FAST_SYNTH's netlist.
