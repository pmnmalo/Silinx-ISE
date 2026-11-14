In short:

- **Silinx HLS: a long run of statements updating one variable:** a function of a few thousand statements such as
  `x = x + 1;` is synthesized, no longer refused as nesting too deep.

In detail:

- **Silinx HLS: the dataflow graph's passes follow a chain with a stack of their own (#3595):** the nodes a module
  needs (`Graph.needed`), the sums' balancing, the wide multiplications' splitting and a pipeline's stages' values
  walk the graph with an explicit stack (`postorder`, `bottomUp` in core/c-graph.js) instead of one call per node, in
  the same order: a chain of thousands of updates of one variable is made and co-simulated in VHDL and Verilog; the
  HLS corpus's HDL unchanged.
