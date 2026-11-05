In short:

- **One right-click menu per module:** in the Design pane, a module's menu is the same on its name and on every
  badge ([Schematic], [FSM], [ASM], [Petri], [Algebra], [VHDL], [Verilog]); the drawing's commands are in it, and its
  Open opens what a double-click opens.

In detail:

- **The Design pane's module menu the same everywhere (#2872):** every badge of a module's row shows the row's menu
  (the module's, or a drawing's own for a drawing with no HDL file), no longer a short menu of the drawing's (#220).
  The drawing's commands joined the module's menu (Convert to State Diagram (FSM)… for an ASM chart, Convert to ASM
  chart for a state diagram, View State Machine (FSM) for a Petri net, Export as ISE Schematic (.sch)… for a
  schematic: web/js/drawings.js `drawingCommands`, in place of `syncedViewMenu`); its Open opens the drawing, else the
  HDL, as a double-click does.
