In detail:

- **The release script through the toolchain's API (#2356):** scripts/package-release.mjs imports `leaveOutChipdbs`
  from `silinx-fpga/node`, no longer from its module; a pull request's related tests now include
  test/toolchain-boundary.test.js and test/layering.test.js for any changed source (they read every source's imports),
  which would have caught it.
