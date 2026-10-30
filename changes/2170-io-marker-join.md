In short:

- Schematic editor: an I/O marker added or renamed with the name of a net already there asks whether to join it; joined,
  the marker takes the net's width (count(7:0): 8 bits). A new marker placed on empty space takes the direction of the
  marker added last, not always Input.

In detail:

- **I/O markers: joining a net of their name, and the direction of a new one (#2170):** the Add I/O Marker tool, the
  Properties panel's Name and Rename… ask, when the name is that of another net, "Join" (the marker takes the net's
  whole width from its net names, and a marker placed unconnected the net's direction: an output when it is driven) or
  "Choose another name" (the name asked again; a rename not made). A marker placed on a pin or a wire still takes its
  direction from it; on empty space, the direction of the marker added last (its highest id). The name prompt's Enter
  no longer reaches the dialog it opens (it pressed Join at once). New core/schmarker.js. Tests:
  test/schmarker.test.js (the direction, the join, the HDL of a joined marker compiled and simulated in VHDL and
  Verilog with no warnings), test/ui/sch-iomarker-join.test.js (English, Portuguese), test/ui/sch-tools.test.js.
