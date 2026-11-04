In short:

- **The waveform viewer's status line:** the look of every editor's and viewer's.

In detail:

- **The waveform viewer's status line the shared one (#2785):** its line (the simulated time, the cursor, the marker's
  delta, a run's progress) has the documents' status line's class and style (`.doc-status`, web/css/status-line.css,
  #2763), 20 px high as the others; its test of the theme's wave colour counts the window's pixels in it rather than six
  points a trace may cross.
