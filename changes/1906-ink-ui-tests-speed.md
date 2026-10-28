In detail:

- **The handwriting UI tests about 15 times faster (#1906):** their strokes' points are sent to the browser at once, in
  order, each not waited for: Chrome handles one input event a frame, so a drawing of 1600 points waited for 1600 frames
  (37 s here, 90 s and a timeout on a release's CI runner). Each handwriting UI test now takes 2 to 8 s (test/ui/ink.test.js,
  ink-table.test.js, ink-schematic.test.js); the Copy Drawing test checks that every point sent reached the pad, in its
  place and order.
