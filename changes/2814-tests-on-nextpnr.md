In detail:

- **Tests on the nextpnr engine (#2814).** Three test files still built with Silinx's engine, which the application no
  longer chooses (#2137), and failed on `main`:
  - `test/nextpnr-size.test.js` compares nextpnr's slices with Silinx's packer's by packing the build's own netlist
    (`fpga/pack.js`, which stays);
  - `test/s6-devices.test.js` asserts nextpnr's routing line on the Nexys3;
  - `test/compiled-words.test.js` places and routes blinky's models through nextpnr, its Post-Place & Route model one
    cell fewer, a constant on routing.
  - **Tests:** those three.
