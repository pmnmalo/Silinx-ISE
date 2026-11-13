In short:

- **Board Emulator:** the iCEBreaker + PmodVGA is drawn as the real board: the iCEBreaker with the PmodVGA plugged into
  PMOD1A and PMOD1B.

In detail:

- **The iCEBreaker + PmodVGA drawn in the Board Emulator (part of #3745):** registered in `BOARD_LAYOUTS` with the
  iCEBreaker's layout (`web/js/emulator-icebreaker.js`), which draws the PmodVGA over PMOD1A and PMOD1B when the
  board has the VGA's pins: its two headers, its VGA connector on its far edge, the colours' and syncs' pins. The UI
  tests check the board's size and parts, the module over the board, that each control is what sits at its centre, in
  both interfaces.
