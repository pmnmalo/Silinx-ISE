In short:

- The Atlys (Spartan-6, under the developer flag) has a seven-segment display and VGA on its VHDCI connector (as a
  Digilent VmodBB wires them), so every example builds on it.

In detail:

- **The Atlys: the seven-segment display and VGA on its VHDCI connector (#732):** the Atlys has neither on the
  board and only one 8-I/O Pmod, so its board description puts them on the VHDCI connector's pins (EXP-IO1..7_P the
  segments, then the decimal point, the four anodes, VGA's 3-3-2 colour and its syncs), with the rest of the
  connector as two buses, vhdci_io1 and vhdci_io2. Every example's ports now have pins on the Atlys and all seven go
  through the open flow to the bitstream with no warnings; the routing comparison against ISE
  (research/s6/measured/route-compare.json) is recorded again with the new pins. Tests: test/boards.test.js,
  test/s6-devices.test.js (the blinky on both Spartan-6 boards), test/s6-research.test.js.
