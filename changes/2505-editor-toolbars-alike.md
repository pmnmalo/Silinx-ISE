In short:

- **The drawing editors alike:** the Petri net, FSM, ASM and Algebra editors' toolbars and the Petri net, FSM and ASM
  side panels look as the Schematic editor's; Undo, Redo and Print are the main toolbar's only.
- **Petri net editor:** Zoom In and Zoom Out.

In detail:

- **The toolbars as the Schematic editor's (#2505):** flat buttons in both interfaces, its icons for Delete and the
  zooms (web/js/editor-icons.js), the zoom level in the status bar, the same order of groups; the FSM's Arrange in its
  menu, as the ASM chart's; the Algebra editor's menu (Algebra from Module, Handwritten Algebra) an icon and a label.
- **No second Undo, Redo or Print (#2505):** none in the Schematic, Algebra, ASM, FSM and Petri net editors' toolbars,
  no Print in the ASM and FSM editors': the main toolbar's, Ctrl+Z, Ctrl+Y and Ctrl+P remain.
- **No note of the HDL in sync (#2505):** the FSM and the Petri net no longer say "HDL: x.vhd — generated from …", and
  the FSM has no `</> HDL` panel: its file is in the Design pane. "Not in sync with" stays.
- **The side panels as the Schematic editor's Properties (#2505):** the Petri net, FSM and ASM editors': its caption,
  width, titles and fields.
- **The Petri net's zooms (#2505):** Zoom In and Zoom Out in its toolbar and on + and −; F fits, in the FSM and ASM
  editors too.
