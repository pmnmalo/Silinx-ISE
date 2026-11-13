In short:

- **The Symbol Editor: a module's symbol of its own.** *Edit Symbol* (a module's right-click menu in the Design pane, or
  an instance's in a schematic) opens the module's symbol: its pins reordered or moved to another side (left, right, top,
  bottom: dragged there, or by their Properties), the spacing between the pins, the body's size and where the module's
  name is drawn. The symbol is saved with the project, as ISE's `.sym`; the schematics' instances of the module take it
  with *Update Symbol*, their connections kept.

In detail:

- **A module's symbol file, `<module>.sym.json` beside its source (#3755).** It holds the pins' order and sides, the
  spacing, the width and height and the name's place (core/symbol-layout.js); the project's modules read it (the
  interface's and the server's), its pins kept in step with the module's ports (a new port added on its default side, one
  gone dropped). A module without one is drawn as before.
- **The Symbol Editor (#3755)**, a document of its own (web/js/symbol-editor.js): the symbol drawn as the schematic draws
  it, a pin selected and dragged to its new place, ◀ Earlier / Later ▶, the Properties (the pin's Side and Position, the
  symbol's spacing, width, height and name), Reset to Default in its ⋮ menu; the main toolbar's Undo and Redo; its
  Properties panel foldable and behind ☰ on a narrow window; its status line its pins and size; its messages in the
  console; in Portuguese.
- **An instance keeps the layout it was placed with (#3755)**, as it keeps its ports (#1183): a changed symbol marks it
  out of date (Check Schematic's warning, its Properties' note) until *Update Symbol*, the wires following their pins. Its
  port map is written in the module's order, whatever the drawing's, so a symbol redrawn never changes the HDL.
- **MCP (#3755):** `read_symbol` and `edit_symbol` (a module's symbol, as the Symbol Editor reads and edits it) and
  `update_symbols` (a schematic's Update Symbol).
