In detail:

- **The open flow's check against ISE runs on the nextpnr engine (#2756):** `npm run check:open-flow` and the ISE tests
  build each design as the application does, through nextpnr, not through Silinx's own placer and router.
  - **Tests:** test/open-flow.test.js, test/blockram-flow.test.js, test/clocking-flow.test.js, test/fpga-place-route.test.js.
