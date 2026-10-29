In detail:

- **The toolchain's data in its package (#1677):** the second part of step 6 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). The device descriptions (the routing graphs of the Spartan-3E and Spartan-6
  parts) and the Spartan-3E bit database move as they are from core/fpga/devices and core/fpga/bitdb to
  packages/silinx-fpga/devices and packages/silinx-fpga/bitdb. Their loaders (core/fpga/device-node.js
  `SHIPPED_DEVICES_DIR`, core/fpga/bitdb-node.js `DB_DIR`, re-exported by research/s3e-bitstream/db.mjs) read them
  there, and the experiments that build them, the standalone build, the power measurement, the tests and the docs
  name the new folders; the ISE and CodeQL workflows' inputs include packages/, and the tests that build the site from a copy
  of the repository link it. The site's assets keep their names (assets/<version>/devices/, bitdb/). No behaviour change.
