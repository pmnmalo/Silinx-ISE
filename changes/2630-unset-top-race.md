In detail:

- **Tests: the #1220 Unset as Top Module UI test waits for the hierarchy's top module redraw (#2630):** in the ISE
  style interface, setting the top module redraws the hierarchy tree with the new top first; waiting for the row to
  become top before clicking avoids a race where the click missed 'b'.
