In short:

- **Small memories on nextpnr:** a distributed RAM's unused address bits and a shift register's fixed length no longer
  take a LUT and a slice each: iwls05-sasc's FIFOs 81 slices -> 52, 9.5 % faster.

In detail:

- **A LUT memory's constant inputs on one net of 0 and one of 1 (#2940).** nextpnr made a LUT of 0 or 1 for each
  constant bit of a distributed RAM's or shift register's input (its LUT is the memory, so the constant cannot be folded
  into it), each in a slice of its own. `nextpnrNetlist` now puts them on one GND and one VCC cell's net
  (`shareMemoryConstants`, as ISE's GLOBAL_LOGIC0 / 1). iwls05-sasc at Optimization Speed (XC3S1200E): 81 slices -> 52,
  161 packed LUTs -> 98, critical path 4.888 -> 4.424 ns (Silinx's former engine: 49 slices, 4.200 ns); a 4-word FIFO's
  memory and a fixed-length shift register (research/nextpnr-s3e/memconsts.v) 28 slices -> 13.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (the netlist's constants; the fixture built: its slices,
    no warnings, a complete bitstream, the routed XDL simulated against the netlist).
