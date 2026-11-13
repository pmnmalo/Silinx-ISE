In short:

- **Board Emulator:** the Spartan-3A / 3AN Starter Kit is drawn as the real board: its 16x2 LCD, LED7..LED0 over
  SW3..SW0, the rotary knob among the NORTH / EAST / SOUTH / WEST buttons, the VGA, PS/2, RS-232 and audio connectors
  along the top, the silkscreen's names with the FPGA pins.

In detail:

- **The Spartan-3A Starter Kit drawn in the Board Emulator (part of #3745):** `web/js/emulator-s3a.js`, registered in
  `BOARD_LAYOUTS`, after the photos of its user guide (UG334): the 5 V jack and the power switch in the top-left
  corner, the VGA, PS/2 (J28), RS-232 DCE (J36) and DTE (J27) connectors and the audio jack along the top edge, the
  SUSPEND switch, Ethernet (J32) and USB on the left edge, the FX2 connector (J17) and the headers J20 and J18 on the
  right edge, the differential headers J2 and J15, the LCD in the bottom-left corner, LED7..LED0 over SW3..SW0, the
  rotary knob among the four buttons in the bottom-right corner; no maker's logo; I/O Pin Planning's Board view draws
  it too. The UI tests check the board's size and parts, where they are, that each control is what sits at its centre,
  in both interfaces and in Portuguese.
