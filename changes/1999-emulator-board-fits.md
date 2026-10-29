In short:

- The Board Emulator fits a tablet's window: the board is drawn smaller (down to 70 %) and no longer covers the
  emulator's controls (Clock, When hidden).

In detail:

- **The emulator's board on a small window (#1999):** in the Tasks interface the board is zoomed to fit the window
  down to 0.7 (it was never made smaller than its proper size, #1021), the Watch below it when beside it the board
  would be smaller than its proper size; the emulator's bar keeps its rows (a flex item that no longer shrinks), so its
  second row (Power cycle, Clock, When hidden) is never under the board.
