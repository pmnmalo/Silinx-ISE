In detail:

- **The toolchain package's own tests (#1680):** the first part of step 9 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). The 16 unit test files that import the package alone (the device description, the
  netlist, pack, place, route, timing's parts, the bitstream, the synthesis's BDD and resynthesis, Yosys's
  integrity, the API), its simulators of a packed design (fpga-sim.js) and its fixtures (fixtures/fpga) move as they
  are into packages/silinx-fpga/test, `npm test` there. The IDE's tests and the research that use the simulators or
  the fixtures read them there. The repository's `npm test`, the CI's parts (scripts/test-shard.mjs: the unit tests'
  folders, UNIT_DIRS), the timings and a pull request's related tests (scripts/related-tests.mjs) take the package's
  folder too. Tests: test/toolchain-boundary.test.js (the package's tests import the package alone),
  test/test-shard.test.js (the unit tests of both folders), test/related-tests.test.js (a change of the package runs
  the tests of its folder, and of the IDE's that import its helper).
