In detail:

- **The IDE imports the toolchain through its API (#1678):** the second part of step 7 of the toolchain's
  separation (#1651, docs/TOOLCHAIN-SEPARATION.md). server/, web/js, core/, scripts/ and bin/ import
  packages/silinx-fpga through its entries only, each import the lightest with its names: `src/index.js`,
  `src/node.js` (the disk's loaders and Yosys in Node: server/'s flow, scripts/), and a new light one, `src/parts.js` (`silinx-fpga/parts`: the parts' families and resources, the UCF, the steps by name, the
  XDL format), so the IDE's pages load 7 of the package's modules, not its 58. The tests and the research import
  the package's modules by their paths; core/'s 75 old paths, which re-exported them, are gone, and the comments and
  docs name the modules where they are. The standalone build and the Node tests of the pages resolve /packages/. Tests:
  test/toolchain-boundary.test.js (the IDE imports the entries only, each import the lightest, no old path left), test/silinx-fpga-api.test.js (the light entry: its names, its 7 modules), test/silinx-fpga-package.test.js.
  No behaviour change.
