In detail:

- **The Nightly's VlogHammer run tells Yosys's alumacc bug from a mismatch (#3733).** `wideexpr_47035`'s
  `6'sb101111 - $signed(-((3'sb111) << s3))` gives 0xfff3 in Silinx's simulation and in Yosys's front end, and
  0xffeb in Yosys's netlist: Yosys's `alumacc` merges the 3-bit negation into the 16-bit subtraction, its wrap lost
  (YosysHQ/yosys#3278, open). Silinx's open synthesis gives the right value (its `0 - x`, #743). A module whose Yosys
  netlist differs, but agrees with `synth -noalumacc`, is now `yosys-bug`, reported, and fails no run.
