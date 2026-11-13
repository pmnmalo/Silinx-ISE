In short:

- **Board Emulator:** the Cmod S6 is drawn as the real board: a 48-pin DIP module with LD3..LD0 and the buttons BTN0
  and BTN1 where they are.

In detail:

- **The Cmod S6 drawn in the Board Emulator (part of #3745):** `web/js/emulator-cmod-s6.js`, registered in
  `BOARD_LAYOUTS`, after the photo of its reference manual: 2.6" x 0.7", the DIP pins along both long edges (1..24 and
  25..48), the micro USB on the left end, the FPGA in the middle, LD3..LD0 in a column, BTN0 and BTN1, the header J4
  on the right end; the board has no power switch, the emulator's is by the USB, its LED the POWER LED; no maker's
  logo; I/O Pin Planning's Board view draws it too. The UI tests check the board's size and parts (on a design of its
  own: 4 LEDs and 2 buttons), where they are, that each control is what sits at its centre, in both interfaces and in
  Portuguese; `test/web-emulator.test.js` asks a layout for at least three kinds of parts, or all the board has.
