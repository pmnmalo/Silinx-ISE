In short:

- **Board Emulator:** the Spartan-3 Starter Board is drawn as the real board: LED7..LED0 over BTN3..BTN0, the 4-digit
  display over SW7..SW0, the expansion connectors A1, A2 and B1, the VGA, RS-232 and PS/2 connectors on their edges.

In detail:

- **The Spartan-3 Starter Board drawn in the Board Emulator (part of #3745):** `web/js/emulator-s3-starter.js`,
  registered in `BOARD_LAYOUTS`, after the component locations of its user guide (UG130, figure 1-2): the green PCB,
  A1 and A2 along the top edge, the VGA connector, the power jack and the RS-232 DB9 (J2) down the left edge, B1 and
  the PS/2 port (J3) on the right, the FPGA, the Platform Flash, the JTAG headers J7 and J5, PROG and DONE; the
  board has no power switch, the emulator's is by the power jack, its LED the POWER LED; no maker's logo; I/O Pin
  Planning's Board view draws it too. The UI tests check the board's size and parts, where they are, that each control
  is what sits at its centre, in both interfaces and in Portuguese.
