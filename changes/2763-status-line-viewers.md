In short:

- **A status line in the viewers:** I/O Pin Planning (the I/Os assigned, the top, the device, the board), the FPGA view
  (the site, net or module selected, the slices and I/Os used) and the Board Emulator (its time and speed) say it in a
  status line at their bottom, no longer in their toolbars.

In detail:

- **The viewers' status line (#2763):** I/O Pin Planning, the implemented design's FPGA view and the Board Emulator
  mount the shared status line (web/js/status-line.js), their informational texts out of their toolbars (#2725); the
  emulator's time is in it (right below the board in the Tasks interface still, #1022). The status line's style is a file of its own, web/css/status-line.css, which the demo
  pages load too.
