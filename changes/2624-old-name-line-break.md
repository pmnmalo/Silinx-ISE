In detail:

- **The old name split by a line break (#2624, part of the rename to Silinx):** `test/old-name.test.js` counts the
  old name when a line break comes between its two words (in a comment, a Markdown quote or list, or plain text),
  which it missed; the one such place left, a comment of the silinx-fpga package's command line, says Silinx.
