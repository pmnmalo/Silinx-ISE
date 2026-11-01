In short:

- **The text editors' bar:** the HDL, C/C++ and memory initialization file editors no longer show Undo, Redo and the
  file's path in their bar: the main toolbar has Undo and Redo, the tab the path.

In detail:

- **No Undo / Redo, no path in the text editors' bar (#2514):** the bar of the text editors (HDL, C/C++, memory
  initialization file, constraints) without its own Undo and Redo, the main toolbar's, Edit ▸ Undo / Redo and
  Ctrl+Z / Ctrl+Y remaining, and without the file's path, in the tab and its tip. Test: test/ui/text-editor-bar.test.js.
