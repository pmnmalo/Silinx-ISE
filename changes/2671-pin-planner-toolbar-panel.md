In short:

- I/O Pin Planning has the toolbar and the side panel of the other editors: its board resources fold to a strip, each
  group by its title, and on a narrow window they open over the table from the toolbar's ☰ Board Resources.

In detail:

- **I/O Pin Planning: the diagram editors' toolbar and side panel (#2671):** the schematic, ASM, FSM and Petri net
  editors' flat buttons with an icon and a label (Auto-assign from Board, Clear All), the design's line and the count
  of I/Os assigned; the board's resources in their side panel, Board Resources, whose title's button folds it to a
  strip (remembered, side-fold.js, which now takes the panel's own tips), each group (Clock, LEDs, Switches…) folded
  by its title and kept folded as the assignments change; under 1024 px the panel over the table, shown and hidden by
  ☰ Board Resources (narrow.js). Test: test/ui/pinplanner-panel.test.js.
