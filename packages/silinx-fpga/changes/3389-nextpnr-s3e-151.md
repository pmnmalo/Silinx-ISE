In detail:

- **The Spartan-3E's nextpnr engine at 1.5.2 (#3389, part of #2819 and #2982):** `@silinx/nextpnr-himbaechel-spartan3e`
  1.5.2. Its 1.5.1 (nextpnr-spartan PR 36) packs the slices as densely as Silinx's packer, and `sliceEstimate` (slice-estimate.js)
  follows its four changes: the control set compares the set / reset's synchrony, not its mode (a flip-flop set and one
  reset by one net, one slice); the flip-flops alone go into the free sides of the wide multiplexers' slices too (BX the
  MUXF5's select, BY the MUXF6 .. MUXF8's placed in the slice: `record_mux_slices`), not only the carry chains'; a sum
  whose LI is 0 and a stage whose select is 0, of a net, are wires, left out (their loads read the carry in, the DI); each
  LUT pairs with the first flip-flop it feeds, the LUTs in the netlist's order.
  1.5.2 (nextpnr-spartan PR 39, part of #2982) predicts a CLB-to-CLB delay from Silinx's route table (`timing.js`
  delayTable), weighs timing 0.9 in HeAP's refinement and lets `--placer sa` place carry chains.
