In short:

- **Schematic editor: Update Symbol and Edit Symbol nearer at hand.** A module instance's right-click menu has Update
  Symbol (enabled when its module changed its ports or its symbol), and its Properties have Edit Symbol, beside Open
  module source.

In detail:

- **Update Symbol in a module instance's right-click menu (#3791)**, after Edit Symbol: what its Properties' button
  does (web/js/sch-modsym.js updateSymbol, shared by both: one Undo step, the same toast); disabled, its tip "The symbol
  is up to date", when it is.
- **Edit Symbol in a module instance's Properties (#3791)**, beside Open module source: its module's symbol in the
  Symbol Editor; hidden in a read-only schematic.
