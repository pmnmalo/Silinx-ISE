In short:

- In the schematic editor, double-clicking a module's symbol opens the module's drawing (its schematic, state diagram,
  ASM chart, truth table…), as the Design pane does, instead of the HDL generated from it.

In detail:

- **Schematic editor: a module symbol double-clicked opens its main source (#2046):** web/js/drawings.js opens it
  with design.js's openModuleSource, as the module's Design row's double-click: its drawing when it is drawn, its
  wizard, else its HDL. Tests: test/ui/sch-open-module.test.js (a schematic, a state diagram, a truth table and a VHDL
  module; both interfaces).
