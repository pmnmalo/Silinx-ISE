In short:

- **Schematic editor: junction dots highlighted and movable.** A selected wire's junction dots are highlighted with it,
  and a dot can be dragged (mouse, finger or pen) or moved with the arrow keys. The wires that meet there follow it and
  stay square.

In detail:

- **Schematic editor: a selected wire's junction dots highlighted with it, and a junction dot movable (#3806).** The
  dots on the selected wires are drawn in the selection's colour. A click selects a dot. Dragging it, or the arrow keys,
  moves it: each wire ending there has its end segment moved across, as a dragged segment is, and stretched along. A jog
  is added instead where something else sits on that segment (another wire's end, a net name). A pin or an I/O marker
  under the dot stays where it is, joined to the dot by a new wire. The connections stay the same: a move that would
  short two named nets is refused, and one that changes them is reported. Each move is one Undo step
  (core/schjunction.js, web/js/sch-junction.js). The MCP server's new `move_junction` does the same move.
