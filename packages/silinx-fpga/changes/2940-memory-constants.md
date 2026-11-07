In short:

- **Small memories on nextpnr:** a distributed RAM's unused address bits and a shift register's fixed length no longer
  take a LUT and a slice each: iwls05-sasc's FIFOs 80 slices -> 52.

In detail:

- **A LUT memory's constant inputs on one net of 0 and one of 1 (#2940).** nextpnr made a LUT of 0 or 1 for each
  constant bit of a distributed RAM's or shift register's input (its LUT is the memory, so the constant cannot be folded
  into it), each in a slice of its own. `nextpnrNetlist` now puts them on one GND and one VCC cell's net
  (`shareMemoryConstants`, as ISE's GLOBAL_LOGIC0 / 1). On the design corpus (Basys2-250, one placement): iwls05-sasc 80
  slices -> 52, 159 packed LUTs -> 96, critical path 5.198 -> 4.766 ns; iwls05-simple-spi 111 -> 79 slices, 6.699 -> 6.317
  ns. At Optimization Speed (XC3S1200E): iwls05-sasc 4.563 -> 4.467 ns, its Place & Route 97 -> 26 s (Silinx's former
  engine: 49 slices, 4.200 ns). A 4-word FIFO's memory and a fixed-length shift register (research/nextpnr-s3e/memconsts.v):
  28 slices -> 13.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (the netlist's constants; the fixture built: its slices,
    no warnings, a complete bitstream, the routed XDL simulated against the netlist).
