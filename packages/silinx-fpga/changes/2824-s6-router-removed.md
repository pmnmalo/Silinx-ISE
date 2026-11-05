In detail:

- **Silinx's Spartan-6 router removed: nextpnr places and routes the Spartan-6 alone (#2824).** As the Spartan-3E's
  placer and router went (#2137), now that nextpnr's speed gap on the Spartan-6 (#2798, 13.5 % on the examples) is
  accepted for now: `fpga/s6/route.js` and `route-swap.js` (its LUT input swapping, #1152) are gone with
  `open-flow-s6.js`'s Place & Route, `test/s6-route.test.js` and `research/s6/compare-route.mjs` (with its record,
  `measured/route-compare.json`; the results stay in the research README and in git's history). `runFlow` on the
  Spartan-6 places and routes by nextpnr whatever `spec.engine` says (the application and the command line already
  did); Place & Route alone packs first, as before. The Spartan-6's placer stays: nextpnr's step places the pads, the
  global buffers, the block RAMs and the DSPs with it. The modules nextpnr's routing uses (`route-nets.js`,
  `route-output.js`, `route-check.js`) stay, tested on nextpnr's routing (test/s6-routing.test.js).
  - **Tests:** test/s6-routing.test.js, test/open-flow-backends.test.js, packages/silinx-fpga/test/nextpnr-s6.test.js.
