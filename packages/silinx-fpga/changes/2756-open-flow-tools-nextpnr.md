In detail:

- **The open flow's research command line on the nextpnr engine (#2756).** `research/s3e-route/open-flow.mjs`, which
  `npm run check:open-flow`, the ISE tests and the design corpus's board designs run, builds through the flow's
  Translate, Map and Place & Route with the nextpnr engine (`runFlow`), as the application does, not through Silinx's
  own packer, placer and router; it writes no `placed.xdl`, and refuses the options of Silinx's placer and router
  (`--effort`, `--timing`, `--timing-route`, `--tries`, `--no-replicate`, `--replicate-opts`) by name. Its tests assert
  what ISE requires where nextpnr chooses the sites (a clock pad into its buffer or its DCM on the dedicated path),
  not the sites Silinx's placer chose. A DCM with five outputs on global buffers, which Silinx's placer refused, is
  built (the fifth through general routing); two IOB registers on different clocks in a LOC'd differential pair do not
  route yet (#2766), some clocks into DCMs and buffers take general routing where a dedicated path exists (#2770), and nextpnr does not say when a DCM's CLKIN comes from a pad through general routing (#2768).
  Checked with ISE (`test/ise/open-flow.test.js`, the new tool): every design DRC clean and byte-identical (CRC on and
  off) but the LOC'd pairs of #2766, and the five-output DCM and the Clocking Wizard's module on the XC3S100E too.
  - **Tests:** test/ise/open-flow.test.js (the LOC'd pairs todo, #2766), test/open-flow.test.js, test/blockram-flow.test.js, test/clocking-flow.test.js, test/fpga-place-route.test.js.
