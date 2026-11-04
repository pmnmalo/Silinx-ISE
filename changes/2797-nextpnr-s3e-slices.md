In short:

- **The nextpnr engine is no bigger than Silinx's on the Spartan-3E:** every example takes at most as many slices with
  nextpnr as with Silinx's own engine (pong, clock and vga one fewer), on the Basys2 and the Nexys2.

In detail:

- **nextpnr's slices on the Spartan-3E (#2797):** nextpnr-spartan v0.18.0 routes the constants that need no LUT as
  Silinx's router ties them (a carry chain's carry in at 0, a pad's output at 0 or 1, a flip-flop's D through BX / BY:
  from a free slice's GND source or the VCC site that reaches the pin), where it made a LUT each, and takes an enable or a
  set / reset active low as the slice's CEINV / SRINV: the flow's netlist turns an inverter on a flip-flop's control pin
  into its `IS_<pin>_INVERTED`, as Silinx's packer does (#527). A slice that is only a constant 0's source is no longer
  counted as occupied, as ISE's map and Silinx's packer count it. The examples, nextpnr / Silinx: traffic 66 / 66,
  blinky 116 / 116, pong 224 / 225, stopwatch 197 / 197, clock 195 / 196, vga 143 / 144, isqrt 63 / 63, uart 112 / 112,
  micro80 148 / 148 (69, 122, 232, 207, 200, 148, 65, 113 and 154 before); their periods unchanged on average (+0.2 %).
  ISE's DRC passes each, its `.bit` byte-identical to Silinx's.
  - **Tests:** test/nextpnr-size.test.js, packages/silinx-fpga/test/nextpnr-engine.test.js, packages/silinx-fpga/test/nextpnr-s3e.test.js, packages/silinx-fpga/test/nextpnr-hard.test.js.
