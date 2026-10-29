In short:

- Under the Spartan-6 developer flag (SILINX_SPARTAN6_OPEN=1), the Silinx toolchain now maps, places, routes and
  times a design for the Nexys3 and the Atlys. The bitstream is not done yet.

In detail:

- **Spartan-6: Map, Place & Route and the static timing in the open flow (#732):** under the developer flag, the
  open flow packs, places, routes and checks a Spartan-6 design (packages/silinx-fpga/src/open-flow-s6.js) and times
  it with the model fitted to ISE's trce (fpga/s6/timing.js), with the MAP report's lines and the timing report and
  checks the Spartan-3E's flow writes. The server gives the boards' parts their shipped device description. The
  bitstream is still refused. Tests: test/s6-devices.test.js (the gates example on the Nexys3, and blinky with the
  board's pins and clock, timed).
