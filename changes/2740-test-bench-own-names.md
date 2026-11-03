In short:

- The Test Bench Wizard's test bench of a module with a port named done (or got, errors, k, vin…) runs: its own
  names no longer clash with the module's ports.

In detail:

- **The test bench's own names never a port's (#2740):** the Test Bench Wizard's test benches (core/testbench.js
  `generateTestbench`, `generateSkeleton`) declare their constants, signals, variables and labels with tb_ before
  them when the module has a port of that name (VHDL whatever its case): a port named done (traffic's timer) made
  two signals named done, the clock never ran and Fill Expected from Current Design said the simulation did not
  reach every vector. A test bench without a clash is as it was (the examples' modules: 128 test benches and
  skeletons byte for byte). Tests: test/testbench.test.js, test/mcp-test-bench.test.js.
