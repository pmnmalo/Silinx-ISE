# The interface: rules for its editors and viewers

Every document of Silinx ISE (a text editor, a drawing editor, a read-only view) is laid out the same way, so that a
student who knows one knows them all. These are the rules a change to the interface follows, whoever makes it, a
person or an AI agent; [CLAUDE.md](../CLAUDE.md) points here. When a rule does not fit a new case, ask, and add the
answer here.

## A document

- **Its name is its tab's**, and its path the tab's tip. Nothing inside the document repeats them: no title, no
  path, no "file.vhd" label (#2514, #2710).
- **Its toolbar is its first line.** No bar above it, below the tabs: no title bar, no notice bar, no second
  toolbar (#2710). What a document has to say goes in its toolbar (the read-only notice, "Not in sync with …") or
  in its hint line at the bottom.
- **The toolbar's layout**, as the Schematic editor's (#2505): flat buttons with the shared icons; the tools that
  change the document on the left (add, delete), then zoom, then the document's settings; a spacer; the
  Properties toggle; the toolbar's ⋮ menu (`web/js/toolbar-menu.js`) at the right end of its first line for the
  commands used now and then (layout, conversion, export, analysis), its place kept free whatever wraps (#2208,
  #2331).
- **No Undo, Redo or Print in a document's toolbar**: the main toolbar's, the Edit and File menus' and Ctrl+Z,
  Ctrl+Y, Ctrl+P act on the document in front (#2505, #2514).
- **The side panel** is the Schematic editor's Properties: on the right, its caption, its width and fields, folded
  to a strip by the button in its caption and remembered per editor (`web/js/side-fold.js`). The emulator, the pin
  planner and the implemented design's view use the same (#2666, #2668, #2671).
- **The hint line** at the bottom says what the mouse does ("Double-click to add a state · …"); a read-only view's
  starts with "Read-only · …".

## A read-only view

A view made from something else (the HDL generated from a drawing, a C source's HDL and state machine, a module's C
model, a Petri net's state machine, the RTL schematic) is the document's own editor in its read-only mode, not a
viewer of its own:

- **The notice** ("Read-only, generated from x", "Read-only, the state space of the Petri net x (N states)") is a
  `.gen-banner.read-only` at the **right end of the toolbar**, before its ⋮ menu, its link opening the source,
  ellipsized when the window is narrow (#2697, #2710). The editors take it as an option (`banner` of
  `mountAsmEditor` and `mountFsmEditor`, `setBanner` of the schematic editor). Out of sync, it is also
  `.out-of-sync` (red).
- **The tools that change it are hidden**, not disabled: add, delete, arrange, validate, the language and the
  encoding, the Problems panel. Zoom, pan, select, Tables and Simulate stay. Its properties are shown, their fields
  disabled.
- Nothing in it is validated or reported: it is right by construction, or its source's problems say why not.

## The Design pane

- One row per module: its drawing's badge first (the base, which opens it), the views made from it next (`[FSM]` of a
  Petri net, `[ASM]` of a C source), its HDL last (`[VHDL]` / `[Verilog]`). A badge's right-click opens the module's
  commands, which also hold every view its badges open.
- Process output goes to the console (`web/js/messages.js`), errors as `ERROR: …`; a toast for an action that can be
  undone carries its Undo. No `alert()`.

## Everywhere

- **Both interfaces** (Silinx and ISE style), **light and dark themes**, **narrow screens** (a tablet in portrait)
  and **touch** (a long press is the right click).
- **Portuguese**: every label has its translation (`web/js/i18n.js` and its modules, anchored patterns).
- **Tests**: a UI test in both interfaces for anything visible. `test/ui/editor-toolbars.test.js`,
  `test/ui/text-editor-bar.test.js` and `test/ui/readonly-notice.test.js` check the rules above on every editor; a
  new editor or view joins them.
