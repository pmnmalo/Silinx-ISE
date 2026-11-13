In short:

- **Every example on the Basys 3 and the Nexys A7 (experimental):** gates … micro80 build through the Silinx toolchain on
  both boards with no warning at the boards' 100 MHz; their size and speed are in docs/TOOLCHAIN.md.

In detail:

- **The examples' size and speed on the 7-series (#3147):** test/open-flow-xc7-server.test.js reports each example's LUTs
  (its feed-throughs), registers, slices and frequency on the Basys 3 and the Nexys A7, and holds them to a table: up to
  15 % more LUTs, the registers within 10 %, the frequency up to 15 % lower (a regression of nextpnr's packer, as #3160's
  feed-through LUTs, fails). The table is in docs/TOOLCHAIN.md; the README says every example builds on both boards and
  runs on them in the Board Emulator. The comparison against Vivado's numbers is #3760.
