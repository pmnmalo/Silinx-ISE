In short:

- **The nextpnr engine uses MUXF7 and MUXF8:** the widest multiplexers now take the CLB's dedicated wires, as with Silinx's own
  engine, instead of becoming LUTs.

In detail:

- **The nextpnr engine: MUXF7 and MUXF8 (#2190):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.6.0. On a CLB's upper slices the FXMUX is a MUXF7 (X0Y1, the CLB's two F6s) or a MUXF8 (X1Y1, the F7s of its CLB and the
  CLB above); its packer takes a whole tree as one cluster, as Silinx's does.
  - **research/nextpnr-s3e/lib.mjs**'s simCheck simulates them; the converter and Map already took them.
  - **research/nextpnr-s3e/widemux.v through nextpnr:** the same multiplexer settings as Silinx's packer; ISE's DRC with no errors
    or warnings, the .bit byte-identical to ISE's bitgen; its flip-flops simulate equal to the netlist. The examples use neither
    multiplexer: their sizes do not change.
  - **Tests:** test/nextpnr-s3e.test.js (the places and the wires, the settings against Silinx's packer, the simulation catching
    swapped inputs) and test/nextpnr-engine.test.js (the design built with the engine, no warnings).
