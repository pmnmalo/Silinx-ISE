In detail:

- **Silinx's Spartan-3E placer and router removed (#2137).** nextpnr has been the application's one place and route
  engine since #2810; its code, its tests and the two research scripts that placed and routed with it
  (`research/s3e-place/flow.mjs`, `research/s3e-route/route.mjs`) are gone. Register replication (#4) went with it. The
  parts other modules use stay, moved as they were: the device's sites and banks (`fpga/device-sites.js`), the placers'
  common parts (`fpga/place-common.js`, the Spartan-6's placer's), a routed design's check (`fpga/route-check.js`), and
  the clock network's reach and ISE's clock pad per DCM (`fpga/clock-reach.js`, which the device tests and the research's
  generators of ISE designs read). Silinx's packer stays (#2529, #2530), and so does the Spartan-6's own engine. The bank
  VCCO tests (#128) run on nextpnr: two LOC'd I/Os of one bank with different VCCO are accepted by nextpnr (#2813, a todo),
  and its message for an I/O with no pad of its VCCO names the cell (#2816).
  - **Tests:** packages/silinx-fpga/test/engine-shared-parts.test.js, packages/silinx-fpga/test/fpga-hard.test.js,
    packages/silinx-fpga/test/silinx-fpga-api.test.js, test/designs-corpus-fixes.test.js, test/open-flow-core.test.js,
    test/iob-pair-clocks.test.js, test/iob-ddr.test.js, test/fpga-timing.test.js, test/silinx-fpga-cli.test.js.
