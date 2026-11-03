In short:

- **I/O Pin Planning's Board view:** the ports in a Ports panel on the left, as the editors' panels; a bus expanded
  into its bits, each dragged onto its own pin; a bit taken off its pin by its ✕ or a right-click; VGA, PS/2, the Pmods
  and the clocks set by dropping onto their rows in Board Resources.

In detail:

- **I/O Pin Planning: a Ports panel, a bus's bits one by one, a bit taken off its pin (#2715):** the Board view's ports
  in a side panel on the left, as the schematic editor's Symbols (its title, folded to a strip and remembered; under
  1024 px over the board, shown by the toolbar's ☰ Ports); a bus
  expanded into its bits, where each one is, each dragged alone (the bus's other bits kept); a port's or a bit's ✕, a
  part's right-click menu and a row of Board Resources' take it off its pin, undoable (a clock's period with it). The
  resources the drawing has no part for (the clocks, VGA, PS/2, the serial port, the Pmods) take a drop on their rows
  in Board Resources; the chips under the board, which repeated that panel, are gone. What a drop places, the pins it
  takes from other ports and its warnings go to the console only, not under the board (core/pin-board.js
  `portBit`, `boardRemove`; web/js/pinplanner-ports.js).
