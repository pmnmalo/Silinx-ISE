In detail:

- **silinx-fpga published on npm (#1681):** the last part of step 10 of the toolchain's separation (#1651): the
  workflow silinx-fpga-release.yml publishes the package on npm, with npm's provenance, when its own tag
  `silinx-fpga-vX` is pushed: the commit on main, the package's version X with its changelog section, and CI (which
  the tag starts too, as a `v*` one) passed on that commit (scripts/wait-for-ci.mjs accepts its run). The package is
  no longer private. Tests: test/silinx-fpga-release-workflow.test.js, test/wait-for-ci.test.js,
  test/ci-workflow.test.js, test/silinx-fpga-package.test.js.
