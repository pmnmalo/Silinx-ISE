In detail:

- **The design corpus's `ci` run times recorded on the nextpnr engine 1.1.0 (#3003).** `test/designs-corpus/times.json`'s
  `ci` baseline (and the README's table) taken from the first Nightly on nextpnr-himbaechel-spartan3e 1.1.0 (#2912),
  no longer the old engine's of 2026-10-27: 8455 s of synthesis and 20438 s of flow in all (6615 s and 7714 s
  before); the designs job took 2 h 43 min of its 340 min (#2909). The run's one regression, secworks-sha256's
  critical path, is #3002.
  - **Tests:** test/yosys-update.test.js: the "yosys update" workflow's corpus subset now takes 46 min of one job by
    these times (17 min before), about 15 min with the workflow's 4 jobs of its 90; its bound raised from 40 to 60 min.
