In short:

- The Try it panel of the state diagram, ASM chart and Petri net editors can be resized by dragging its edge, and moved
  below or to the left of the drawing (#3802) by dragging its title bar (or its ⇆ button); its place and size are kept
  per editor.

In detail:

- **The drawing editors' bottom panel resized and moved (#3797):** one module for the three editors
  (`web/js/dock-panel.js`): its inner edge dragged (a finger or a pen too; ↑ ↓ / ← → on the focused edge) sizes it
  between 15% and 85% of the drawing area, the drawing kept in view (the FSM fitted again); its title bar dragged, the
  place it will go shown, docks it below the drawing or on its right, as its ⇆ button does. Docked rather than
  floating, so that it never covers the drawing being tried. Its place and size are kept per editor kind
  (`silinx.<kind>.trypanel`), when it is closed and opened again and after a reload; the FSM's Tables and the Petri
  net's Analysis, the same panel, follow them. On a narrow screen it is always below, still resizable. Its tips in
  Portuguese.
