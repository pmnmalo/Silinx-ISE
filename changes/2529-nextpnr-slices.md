In detail:

- **The open synthesis counts the slices as nextpnr packs them (#2529):** Optimization Area's comparison of its two netlists
  (the slices it says in the log) and the rules of the mappings for speed count a Spartan-3E netlist's slices as the
  nextpnr engine packs them (`packages/silinx-fpga/src/slice-estimate.js`), no longer with Silinx's packer: the same
  netlists kept on the examples and the fixture designs; two designs of the corpus get a netlist smaller once placed.
