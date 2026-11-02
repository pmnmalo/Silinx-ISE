In short:

- **Board Emulator:** the Watch, the timing generics, the messages and the notes on the engine are in a Properties
  panel at the right of the board, as in the diagram editors, folded to a strip with one click; the Engine, When
  hidden and Show (the VGA monitor, the serial terminal…) are in the toolbar's menu, the three dots at its right.

In detail:

- **Board Emulator laid out as the diagram editors (#2666):** its side column is a side panel at the board's right
  (web/js/emulator-side.js), folded as the ASM, FSM and Petri net editors' Properties (side-fold.js) and remembered,
  below the board when the emulator is under 900 px wide (a container query); the board's area scrolls on its own.
  The toolbar's menu (toolbar-menu.js) holds the engine, what it does when hidden and the modules shown
  (web/js/emulator-toolbar.js, emulator-modules.js). The print view keeps the Watch; the Tasks interface fits the
  board to the room left of the panel (web/js/tasks-emu.js). Test: test/ui/emulator-panels.test.js.
