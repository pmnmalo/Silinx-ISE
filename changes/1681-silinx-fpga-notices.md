In detail:

- **silinx-fpga's notices and npm contents (#1681):** the first part of step 10 of the toolchain's separation
  (#1651, docs/TOOLCHAIN-SEPARATION.md). The package has its own NOTICE (Apache-2.0, its code and its data) and
  THIRD-PARTY-NOTICES.md (Yosys / YoWASP and nextpnr-spartan, with their licence texts), which
  scripts/third-party.mjs writes with the IDE's; the IDE's NOTICE names silinx-fpga (Apache-2.0) among its
  components. Its package.json gets a `files` list: the npm package holds src/, bin/, bitdb/, devices/ and the
  notices, not the research (24 MB) nor the tests. Tests: test/third-party.test.js (the licence, the notices, the
  packed files and every relative import of the code in them), test/private-data.test.js (the package's notices
  name their authors, as the IDE's: the private-data check allows them).
