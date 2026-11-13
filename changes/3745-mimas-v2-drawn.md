In short:

- **Board Emulator:** the Numato Mimas V2 is drawn as the real board: its 3-digit display, D1..D8, the six push
  buttons and the blue DIP switch where they are, the JTAG, VGA, audio and micro SD connectors along the top, the
  headers P6..P9 along the bottom.

In detail:

- **The Mimas V2 drawn in the Board Emulator (part of #3745):** `web/js/emulator-mimas-v2.js`, registered in
  `BOARD_LAYOUTS`, after Numato's connection diagram and photo: the black PCB, the DC jack and the mini USB on the left
  edge, the digits S1..S3 (SevenSegmentEnable[2..0]) and D1..D8 (LED0..LED7) over P6..P9, SW1..SW6 (Switch0..5) on
  the right, the DIP switch's positions 1..8 (DPSwitch7..0) in the bottom-right corner; the board has no power switch,
  the emulator's sits by the USB; no maker's logo; I/O Pin Planning's Board view draws it too. The UI tests check the
  board's size and parts, where they are, that each control is what sits at its centre, in both interfaces and in
  Portuguese.
