In detail:

- **The Spartan-6's tests and research that routed with Silinx's own router, on nextpnr (#2824).** The first step of
  the router's removal; no change for the toolchain's users. The routing modules nextpnr's Place & Route shares with
  the router (`route-nets.js`, `route-output.js`, `route-check.js`) are tested on designs nextpnr routed
  (test/s6-routing.test.js); the static timing's tests time a design nextpnr routed; `research/s6/flow-xdl6.mjs` and
  `place-xdl.mjs --route` route with nextpnr. A placement routed by nextpnr has its pads on pins whose I/O paths
  nextpnr's chip database has: the tests' designs are constrained to the Nexys3's switches and LEDs.
  - **Tests:** test/s6-routing.test.js, test/s6-timing.test.js, test/s6-timing-flow.test.js.
