In short:

- **Board Emulator:** the Papilio One is drawn as the real board: its wings A, B and C with the design's ports on their
  pins, the DC jack and the USB on the top edge.

In detail:

- **The Papilio One drawn in the Board Emulator (part of #3745):** `web/js/emulator-papilio-one.js`, registered in
  `BOARD_LAYOUTS`, after the board's photo in its datasheet: the red PCB, the DC jack, the PWR LED and the mini USB
  along the top edge, the FT2232 with its crystal, RX / TX LEDs and JTAG header, the jumpers, the 32 MHz oscillator,
  the FPGA and the SPI flash, Wing2 (C) down the left edge, Wing1 (B, A) down the right; the board has no LEDs,
  switches or buttons of its own, so the wings' pins 0..15 carry the design's ports beside them; the board has no power
  switch, the emulator's is by the jack, its LED the PWR LED; no maker's logo. The UI tests check the board's size, the
  ports on the wings, the silkscreen, in both interfaces.
