In short:

- **Board Emulator:** the Elbert V2 is drawn as the real board: its three digits, D1..D8, the six round push buttons
  and the DIP switch where they are, the VGA, stereo jack and micro SD along the top; every board is now drawn as the
  real one.

In detail:

- **The Elbert V2 drawn in the Board Emulator (Fixes #3745):** `web/js/emulator-elbert-v2.js`, registered in
  `BOARD_LAYOUTS`, after Numato's connection diagram and the board's photo: the green PCB, the DC barrel jack, the
  power select jumper, the mini USB, P8 and the JTAG header (P3) down the left edge, the three LM317s, the flash, the
  PIC with its ICSP and FWUP, the 12 MHz crystal, the FPGA, the VGA, the stereo jack and the micro SD along the top,
  SW1..SW6 top right over the upright DIP switch (DPSwitch0 at the top, ON to the left), the 3 digits bottom left, each
  where its enable's pin is (P120 the left one, S3; P124 the right one, S1), D8..D1 left to right, the headers P4, P2,
  P6, P1 along the bottom edge and P5 under the display; the board has no power switch, the emulator's is by the USB;
  no maker's logo. The UI tests check the board's size, its parts and where they are, the silkscreen, each control at
  its centre, in both interfaces and in Portuguese.
