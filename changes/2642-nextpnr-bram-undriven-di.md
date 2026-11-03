In detail:

- **The nextpnr engine leaves a block RAM's undriven data input unconnected (#2642),** as Silinx's engine does: ISE's
  DRC had warned of a dangling output pin on a 16-bit RAM inferred onto a block RAM.
  - **Tests:** packages/silinx-fpga/test/nextpnr-hard.test.js, packages/silinx-fpga/test/nextpnr-engine.test.js.
