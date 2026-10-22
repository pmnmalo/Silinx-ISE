In short:

- The Tasks interface's Emulate: the board keeps its size when the window is made smaller; the Watch and the VGA
  monitor go below the board instead, and the emulator's area scrolls.

In detail:

- **The Tasks interface's Emulate: the board keeps its proper size (#1021):** the board's picture is never zoomed below
  its own size (it was down to 0.3 on a small window); on a large window it is still enlarged, at most 1.5 times, to
  the room beside the Watch. When the width runs short, the Watch and then the VGA monitor wrap to the next row, below
  the board, and the emulator's area scrolls (across too, on a tablet in portrait narrower than the board). The modern
  and classic interfaces are unchanged.
