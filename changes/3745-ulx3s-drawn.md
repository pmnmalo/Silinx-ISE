In short:

- **Board Emulator:** the ULX3S is drawn as the real board: D7..D0, the buttons F1, F2, UP, DOWN, LEFT, RIGHT and PWR,
  the red DIP switch where they are, and on its left the breadboard on its header J1 with the examples' display (or
  the VGA connector, ULX3S + VGA).

In detail:

- **The ULX3S drawn in the Board Emulator (part of #3745):** `web/js/emulator-ulx3s.js`, registered in
  `BOARD_LAYOUTS` for `ulx3s` and `ulx3s-vga`, after the board's top view in its repository: the GPIO headers J1 and
  J2 down the long edges, US1, the audio jack, GPDI1 and US2 along the top, D7..D0 and F1 / F2 top left, the DIP
  switch SW1 and PWR top right, UP / LEFT / DOWN / RIGHT bottom right, the FPGA, SDRAM, LCD and JTAG headers, the SD
  slot; the breadboard left of it wired to J1 (the 4-digit display, or the VGA connector); the board has no power
  switch, the emulator's is by US2; no maker's logo; I/O Pin Planning's Board view draws it too. The UI tests check the
  board's size and parts, where they are, that each control is what sits at its centre, in both interfaces and in
  Portuguese.
