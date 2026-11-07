In short:

- **Smaller designs with small memories:** a FIFO's distributed RAM or a fixed-length shift register no longer takes a
  slice for each unused address bit (iwls05-sasc: 80 slices -> 52).

In detail:

- **The toolchain's nextpnr engine: a LUT memory's constant inputs on one net of 0 and one of 1 (#2940),** not a LUT
  and a slice each (packages/silinx-fpga/changes/2940-memory-constants.md).
