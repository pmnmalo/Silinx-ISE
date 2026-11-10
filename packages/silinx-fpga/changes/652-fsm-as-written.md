In detail:

- **State machines Yosys makes one-hot itself, tried as written too (#652):** at Optimization Effort High, a design whose
  state registers Yosys's `fsm` extracts by itself (a Verilog register written without an initial value: Yosys's `auto`,
  one-hot) is synthesized once more with them marked `fsm_encoding "none"`, their author's codes kept (as XST keeps
  iwls05-usb-phy's `fs_state` and vtr-stereovision3's `reg_prog_state`), the rest of the script and High's mappings from
  that netlist (`fsmExtracted` in synth-fsm.js, `r.depth.written`). It is kept when DEPTH_RULE keeps it and it is
  3 % faster by the estimate or 5 % smaller in LUTs or slices (picorv32's, as fast and 8 LUTs fewer, routed 8 %
  slower, is not). The design corpus, routed at seed 1: secworks-aes 8691 → 7225 LUTs (−17 %), secworks-sha256
  2868 → 2677 (−7 %), vtr-stereovision3 144 → 126 LUTs and 120 → 99 flip-flops, iwls05-usb-phy 127 → 115 LUTs;
  secworks-sha1 15 % shorter (seeds 1-3), vtr-stereovision3 4 %, iwls05-usb-phy 3 %. The examples have no such
  machine: their netlists are the same. Synthesis at High takes 3 to 30 s more on the 13 designs that have one.
