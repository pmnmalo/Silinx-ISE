In detail:

- **The open synthesis counts the slices as nextpnr packs them (#2529):** `sliceCount` (synth-open.js: Optimization
  Area's comparison, the mappings for speed's rules keepDepth and keepChains) no longer packs the netlist with
  `fpga/pack.js`: `sliceEstimate` (slice-estimate.js) counts the slices as the spartan3e micro-architecture of nextpnr
  packs them (the control inverters, its wide multiplexers, memories, carry chains, the flip-flops alone into the chains'
  slices, then the LUTs and flip-flops by control set), without running it; a netlist of another family's cells has none
  (null), as before. Against nextpnr's slices on the ten examples (the XC3S250E): the same on six, one more on pong,
  stopwatch, clock and vga, as the packer. The open synthesis keeps the same netlists on the examples (High, Normal and
  Area), the fixture designs and 50 of the corpus's 52 designs of up to 1500 LUTs (High); on itc99-b08 and iwls05-usb-phy
  the packer's count was 1 to 9 slices off nextpnr's (the estimate's at most 1), and the netlists now kept are smaller once
  placed (b08 19 -> 18 slices, 6.223 -> 6.028 ns; usb-phy 67 -> 65 slices, 4.822 -> 4.852 ns).
