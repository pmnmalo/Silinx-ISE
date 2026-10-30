In short:

- The Silinx toolchain builds for the Spartan-6 boards (Nexys3, Atlys) in the local server, with no developer flag:
  synthesis, Map, Place & Route, the static timing and the bitstream.

In detail:

- **Spartan-6: the developer flag removed (#732):** the Nexys3's and the Atlys's parts (XC6SLX16, XC6SLX45 in the
  CSG324) are available to the Silinx toolchain without `SILINX_SPARTAN6_OPEN` (the package no longer exports
  `spartan6Open`); the other Spartan-6 parts are refused as before, with ISE's modes named. The browser edition does
  not have the Spartan-6's bit databases yet. Tests: test/s6-devices.test.js, test/open-toolchain.test.js, test/docs.test.js (the README names both boards), packages/silinx-fpga/test/silinx-fpga-api.test.js. The browser edition: #2103.
