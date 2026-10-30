In detail:

- **The Spartan-3E research in the toolchain package (#1680):** the second part of step 9 of the toolchain's
  separation (#1651, docs/TOOLCHAIN-SEPARATION.md). The research that builds the package's data (s3e-device,
  s3e-bitstream, s3e-place, s3e-route) and the nextpnr spike (nextpnr-s3e, #1954) move as they are into
  packages/silinx-fpga/research, their relative paths adjusted; the five tests that then import the package alone
  (fpga-bitgen, iob-reg, s3e-bitstream-tools, s3e-devices, nextpnr-s3e, with its fixture) into packages/silinx-fpga/test.
  The IDE's tests, scripts, documentation and workflows (CodeQL's ignored paths, ISE's, the Yosys update's) and the
  release zip's measurements left out follow; research/s6 stays until the Spartan-6 work settles. Tests:
  test/layering.test.js (the application imports nothing of either research folder; the old folders gone),
  test/related-tests.test.js (a measurement of the moved research runs its test there).
