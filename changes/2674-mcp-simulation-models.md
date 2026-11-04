In short:

- An AI assistant (MCP) simulates the test bench against the post-synthesis, post-translate, post-map and post-place
  & route models (the last with its timing), makes those models, and writes the simulation's waves as a VCD file.
- The MCP's simulation reads the project's data files (a .mem of $readmemh), as the interface's does.

In detail:

- **MCP: the simulation models (#2674):** `run_process` makes each model (`post_synthesis_model`, `post_translate_model`,
  `post_map_model`, `post_par_model`: the flow up to its stage, then the model) and `simulate` takes `model`: the test
  bench against that netlist as Simulate Post-… Model does (compiled after the sources, its nets single bits, the
  post-place & route model with its SDF's delays), `generate` making it first; a model older than the sources is
  said; `vcd` writes the waves into the exchange folder (a new file). Test: test/mcp-simulate-models.test.js.
- **The MCP's simulation reads the project's data files (#2778):** `simulate` gave the simulator only the HDL, and a
  test bench's `$readmemh` of a .mem said it was not found; it now gets the data files the interface gives it.
