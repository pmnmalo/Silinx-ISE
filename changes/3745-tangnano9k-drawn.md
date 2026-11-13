In short:

- **Board Emulator:** the Tang Nano 9K is drawn as the real board: S1, S2 and LED1..LED6 where they are, with the
  breadboards on its headers: the examples' display (or VGA) on J7 over it, their LEDs, switches and buttons on J6
  under it, each wired to its pin.

In detail:

- **The Tang Nano 9K drawn in the Board Emulator (part of #3745):** `web/js/emulator-tangnano9k.js`, registered in
  `BOARD_LAYOUTS` for `tangnano9k` and `tangnano9k-vga`, after the board's photo and pinout, turned a quarter: the
  USB-C and S1 / S2 on the left end, LED1..LED6 by the FPGA, the 27 MHz oscillator, the flash, the LCD connectors, the
  HDMI on the right end, the headers J7 and J6 along the long edges with their pins' numbers; J7's breadboard (the
  4-digit display, or the VGA connector) and J6's (LD0..LD7, SW0..SW7, BTN0..BTN3 under their pins) wired to them; the
  board has no power switch, the emulator's is by the USB-C; no maker's logo; I/O Pin Planning's Board view draws it
  too. The UI tests check the board's size and parts, where they are, that each control is what sits at its centre, in
  both interfaces and in Portuguese.
