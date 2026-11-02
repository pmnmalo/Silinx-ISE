In detail:

- **The parts of Silinx's placer and router that other modules use, in modules of their own (#2137):** the first step
  of removing the Spartan-3E's own placer and router, moved as they are, with no change in behaviour. The device's
  sites and its I/O banks' voltages (`deviceSites`, `bankOfPad`, `vccoOfStandard`) go to `fpga/device-sites.js`; the
  placers' error, seeded random numbers and crossing correction (`PlaceError`, `rng`, `crossing`, which the
  Spartan-6's placer uses too) to `fpga/place-common.js`; a routed design's check (`checkRouting`, `netEndpoints`, which
  the nextpnr flow and the Spartan-6 use) to `fpga/route-check.js`. `fpga/place.js` and `fpga/route.js` still export
  them. Test: test/engine-shared-parts.test.js.
