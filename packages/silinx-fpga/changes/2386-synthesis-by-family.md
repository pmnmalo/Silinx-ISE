In detail:

- **The synthesis by family (#2386):** the back end gives its synthesis and the names of its report's lines (`synth`,
  `synthName(id, resource)`, replacing `xstNames`): the Xilinx families' `synthesizeVerilog` (`synth_xilinx` and Silinx's
  mappings), another family's Yosys script through `scriptSynthesis({ script, files, utilization, quiet })` (`synth-script.js`),
  and Yosys's generic `synth` for a registered family that gives none. `runFlow` names no synthesis. `FAMILY_INFO` needs only a
  family's name (`xise`, `pm` optional). The Spartan-3E and Spartan-6 give the same netlists and reports; a fake family is
  synthesized with its own script into Yosys's generic cells in the tests.
