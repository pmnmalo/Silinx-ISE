In detail:

- **The bit database's layouts built from the measured tiles (#2502).** Research only; no change for the toolchain's
  users. `research/s3e-bitstream/gen-layout.mjs` takes the tile names and the break rows from the die's measured grid
  (`research/s3e-device/grid.mjs`), not from ISE's device report. Its parts are now functions (`frameGrid`,
  `typeTables`), and from the measured tiles and the committed chip maps they give the four committed layouts
  unchanged.
  - **Tests:** packages/silinx-fpga/test/s3e-bitstream-tools.test.js.
