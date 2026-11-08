In detail:

- **Optimization Fast: a design limited by its logic depth synthesized as at Speed too (#3096).** Fast was Yosys's usual
  mapping alone, so a deep design kept up to 3 times XST's logic levels (#3070: epfl-max 57 against 17). `synthesizeFast`
  (synth-fast.js) uses the usual mapping. A design deeper than DEEP_RULE (more than 16 levels, 1500 LUTs at most, the old
  Normal's rule of #468) is also synthesized as at Speed, and that netlist is kept when it is DEEP_RULE.gain (10 %) faster
  by the estimate: `r.fast { levels, usual, speed, kept }`, said in the log. Fast's back ends take it as `fastSynth`, and
  so do the flow models and the browser's Synthesize. Measured after Place & Route by Silinx's estimate: epfl-priority
  44.1 -> 9.4 ns (87 -> 117 slices), epfl-max 70.8 -> 25.2 ns (544 -> 672), itc99-b14 37.4 -> 33.8 ns (663 -> 657).
  iwls05-i2c, epfl-adder, femtorv32-quark, secworks-siphash and vtr-diffeq1 are not deep by the rule and come out the same.
  - **Tests:** test/synth-goal.test.js (a 128-request priority encoder, 42 levels: Speed's netlist kept; not 10 % faster:
    the usual one; not deep: the usual mapping alone; traffic unchanged), test/ui/open-toolchain.test.js (Fast's log line).
