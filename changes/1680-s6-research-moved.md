In detail:

- **The Spartan-6 research in the toolchain package (#1680):** the third and last part of step 9 of the toolchain's
  separation (#1651, docs/TOOLCHAIN-SEPARATION.md). research/s6 moves as it is into packages/silinx-fpga/research/s6,
  its relative paths adjusted (the toolchain's sources, bit databases and the IDE's test helpers); the IDE's tests that
  read its measurements, `npm run check:open-flow`'s Spartan-6 bitstream comparison and the documentation follow.
  Tests: test/layering.test.js (the application imports nothing of the research; research/s6 gone, its README in the
  package), test/toolchain-boundary.test.js (the package's research is no API: the scripts may import it, as
  check:open-flow does check-bitgen6.mjs).
