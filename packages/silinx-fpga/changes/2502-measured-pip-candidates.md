In detail:

- **The bit database's routing tests on the measured descriptions (#2502).** Research only; no change for the
  toolchain's users. `research/s3e-bitstream/gen-pipcover.mjs` takes `measured`, the die's measured description, as
  the graph it routes its tests on, and its candidates are the measured PIPs; `measure-db.sh` passes it by default.
  The PIPs of the measured descriptions that only the bit database showed (258, 789, 788 and 829 per tile type on the
  four Spartan-3E dies) were asked of ISE's arc probe (`candidates.mjs types`), and all exist. Every PIP of the four
  descriptions is now shown by ISE, in a route or by the probe.
  - **Tests:** test/s3e-device.test.js, packages/silinx-fpga/test/s3e-bitstream-tools.test.js.
