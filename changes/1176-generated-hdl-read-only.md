In short:

- **Drawings and their HDL:** the HDL file generated from a schematic, ASM chart, state diagram, truth table or Petri
  net opens read-only. Its bar says so and links to the drawing, which is the one edited; a module written in HDL stays
  editable.

In detail:

- **The HDL generated from a drawing is read-only (#1176):** web/js/app.js opens it read-only (CodeMirror's
  `readOnly`, switched by `setReadOnly` in web/js/editor.js when a file is linked to a drawing while open, after a
  reload); no Undo / Redo or Templates ▾ in its bar, no Undo, Cut, Paste, Toggle Comment, Rename Symbol, Quick Fix,
  templates or Instantiate module in its right-click menu (Copy, Select All, Find, Check Syntax and Open <drawing>
  kept); Tab, F2, Ctrl+., completion, a paste, a template and a quick fix do nothing, and its save writes nothing. Its
  banner always shows: "Read-only, generated from <drawing>", or "Read-only, not in sync with <drawing>" and the
  reason (in Portuguese too). The Errors tab offers no "Fix: …" for it, and Rename Symbol does not change its
  instances (it names the drawing, as for a drawing without an HDL file).
- **Edits no longer flow from the HDL back into the drawing:** `syncSchematicFromHdl`, `syncAsmFromHdl`,
  `syncFsmFromHdl`, `syncTtFromHdl` and `schStructure` removed (the HDL editor's save was their only caller); their UI
  tests now assert the read-only HDL (truthtable, drawings-tt, fsm, petri, hierarchy, projects), and
  test/ui/generated-hdl.test.js covers a schematic's HDL, a module written in HDL, its conversion while open, and the
  Tasks interface.
