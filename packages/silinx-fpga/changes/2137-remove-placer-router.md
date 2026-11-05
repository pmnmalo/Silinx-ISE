In detail:

- **Silinx's Spartan-3E placer and router removed (#2137).** `placeRouteBest` and `io.placeRoute` leave the API:
  `runFlow` places and routes the Spartan-3E with nextpnr (`io.nextpnr`, the one engine), whatever `spec.engine` says.
  `fpga/place.js`, `place-*.js`, `place-route.js`, `route.js`, `route-*.js`, `replicate.js` and `open-flow-s3e.js` are
  gone; `deviceSites`, `bankOfPad` and `vccoOfStandard` are in `fpga/device-sites.js`, `PlaceError`, `rng` and `crossing`
  in `fpga/place-common.js`, `checkRouting` and `netEndpoints` in `fpga/route-check.js` (the API's `checkRouting` from
  there), `clockReach`, `bufgReach` and `DCM_PAD` in `fpga/clock-reach.js`. `runFlow` no longer gives the back ends
  `knownPips`, `parTries` or `parExtra`. The command line refuses `--engine` and `--no-replicate` by name.
  - **Tests:** packages/silinx-fpga/test/silinx-fpga-api.test.js, test/silinx-fpga-cli.test.js,
    packages/silinx-fpga/test/engine-shared-parts.test.js.
