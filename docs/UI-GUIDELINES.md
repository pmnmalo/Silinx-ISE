# The interface: rules for its editors and viewers

Every document of Silinx ISE (a text editor, a drawing editor, a read-only view) is laid out the same way, so that a
student who knows one knows them all. These are the rules a change to the interface follows, whoever makes it, a
person or an AI agent; [CLAUDE.md](../CLAUDE.md) points here. When a rule does not fit a new case, ask, and add the
answer here.

## A document

- **Its name is its tab's**, and its path the tab's tip. Nothing inside the document repeats them: no title, no
  path, no "file.vhd" label (#2514, #2710).
- **Its tab is the user's to place** (#2887): dragged in its row or to the other side's (a finger or a pen too),
  Alt+Shift+← / → when focused, the tip's second line saying so; the order is kept with the open documents.
- **Its toolbar is its first line** and its **status line its last** (#2763). No bar above the toolbar, below the
  tabs: no title bar, no notice bar, no second toolbar (#2710). The toolbar holds its tools, and the two notices of
  what the document is (the read-only notice, "Not in sync with …"); what it is now (its counts, its encoding, the
  cursor's place, what is under the mouse) is in its status line; its messages go to the console.
- **The toolbar's layout**, as the Schematic editor's (#2505): flat buttons with the shared icons; the tools that
  change the document on the left (add, delete), then zoom, then the document's settings; a spacer; the
  Properties toggle; the toolbar's ⋮ menu (`web/js/toolbar-menu.js`) at the right end of its first line for the
  commands used now and then (layout, conversion, export, analysis), its place kept free whatever wraps (#2208,
  #2331).
- **A ⋮ menu holds menu items, never form fields** (#2846): no `<select>`, input or check box in it. A choice is a
  section title and its options, checkable items with a ✓ on the current one (`menuChoice`); a setting on or off is one
  checkable item (`menuCheck`); an option that can't be chosen is disabled, its reason its tip. They are
  `toolbar-menu.js`'s, styled in one place for every viewer, with the hover and the keys (↑ ↓ Home End Esc) of every ⋮
  menu: no menu styles of a viewer's own.
- **What a toolbar says is at its right end**, never between its tools (#2725): the read-only notice and "Not in
  sync with …", after the spacer and the ☰ panels' buttons, before the ⋮ menu (`test/ui/toolbar-info-right.test.js`).
  Nothing else the toolbar says: the rest is the status line's (#2763).
- **No Undo, Redo or Print in a document's toolbar**: the main toolbar's, the Edit and File menus' and Ctrl+Z,
  Ctrl+Y, Ctrl+P act on the document in front (#2505, #2514).
- **The side panels** are all alike (see below).
- **Its view is its own** (#3074): what a document shows and how is kept in its editor, one per open document: a
  check box of its options (the Karnaugh map's 3D), a choice (SOP / POS groups, the variables' order), a turn, a zoom,
  a scroll. Never in a module's variable shared by every open document: one document's change would reach the others
  only when they are drawn again (a click on a cell), their check box then saying the opposite of what they show. A
  setting remembered for every document (the schematic's options, a panel folded) is read when an editor opens; the
  editor's box and what it shows always agree. A UI test opens two documents, changes one, and checks the other
  unchanged, also after an edit in it.
- **No hint line** under the document (#2735): what the mouse does is in the tools' tips and the Help (the Schematic
  editor's tool tip at the left of its status line, as it was); the zoom is the zoom tools'; a status message is the
  console's.

## The status line

Every editor and viewer has one status line, its last line, the Schematic editor's (`statusLine()` of
`web/js/status-line.js`, `.doc-status` of `web/css/status-line.css`, the same look in every document) (#2763):

- **What it says:** what the document is now, in short fields at its right: a drawing's counts ("7 state(s), 8
  transition(s)", "2 places · 2 transitions · 4 arcs", "3 states"), its kind and encoding ("Moore", "Encoding:
  Binary"), its tokens (a Petri net), a table's inputs, outputs and rows, the schematic's cursor and zoom; a text
  editor's line and column and its language; a viewer's selection or what is under the mouse (I/O Pin Planning's I/Os
  assigned, top, device and board; the FPGA view's selection and the slices used; the Board Emulator's time, right below
  the board in the Tasks interface; the waveform viewer's simulated time, cursor and marker, #2785).
- **What it never says:** errors, warnings or information (the console's, #2718: the Schematic's check, I/O Pin
  Planning's pins assigned more than once, #2784), that the document was saved (the tab's mark), the read-only notice
  and "Not in sync with …" (the toolbar's), a title or a path (the tab's).
- A read-only view has it too, the same fields; printed, it is left out (`print-doc.js`).

## A side panel

Every document's side panel (the editors' Properties, the schematic's Symbols, I/O Pin Planning's Board Resources, the
Board Emulator's, the implemented design's) behaves as the Schematic editor's Properties, with the same code; a new
panel uses it rather than its own:

- **Where:** on the right of the canvas (the schematic's Symbols on the left), the same width in every editor; its
  caption (`.asm-cap`) first, its name ("Properties", "Board Resources"), then its fields as the Properties' (titles,
  labels, inputs).
- **Foldable:** a button at the right of its caption folds it to a thin strip with its name down the side; a click
  on the strip expands it again. Folded or not is remembered per editor (`mountSideFold` of `web/js/side-fold.js`, its
  key `silinx.<editor>.props.folded`) (#2505).
- **Its sections do not fold:** the panel folds as a whole, never a section of it (no `<details>`): the selection's,
  the Machine's (ASM, FSM), the Net's (Petri net) are plain sections with their heading (#2735, #2739). Nothing
  selected, the selection's section says nothing (no "Nothing selected: click …").
- **On a narrow screen** (under 1024 px, `NARROW_QUERY` of `web/js/narrow.js`): the panel goes over the canvas, closed
  at first, and it is shown and hidden by a `☰ <its name>` button in the toolbar (`panelToggle`: a flat button of the
  toolbar, before its ⋮ menu, shown only there); open or closed is remembered per viewer. No folding there, and the
  panel never moves below or above the canvas (#266).
- **Read-only:** shown, its fields disabled, its buttons hidden.
- **Tests:** a UI test folds and expands it, reloads (the fold kept), and opens and closes it on a narrow window.

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
  encoding, the Problems panel (which goes to the console, #2718). Zoom, pan, select, Tables and Simulate stay. Its properties are shown, their fields
  disabled.
- Nothing in it is validated or reported: it is right by construction, or its source's problems (in the console) say
  why not.

## The Design pane

- One row per module: its drawing's badge first (the base, which opens it), the views made from it next (`[FSM]` of a
  Petri net, `[ASM]` of a C source), its HDL last (`[VHDL]` / `[Verilog]`). A badge's right-click opens the module's
  commands, which also hold every view its badges open.

## Messages

- **Every message goes to the console, never into the document's window**: the information, warnings and errors of an
  editor, a viewer, the emulator or a process (a check, a validation, an engine's note, a log) are lines of the console
  (`web/js/messages.js`: `log(…)`, `WARNING: …`, `ERROR: …`), its Errors and Warnings tabs listing them, a click on
  one going to its place in the document. No problems panel, message box, log or warning line inside an editor or a
  viewer, and no `alert()` (#2718).
- **A check ends with its tab in front** (#2803): its Errors tab if it found errors, else its Warnings tab if it found
  warnings (`showProblems` of `web/js/console.js`), run again too; a drawing's check is a `Check` (`Validate` for the
  ASM chart) of its toolbar, the shared check icon, after its settings, hidden in a read-only view.
- What the document shows of itself is not a message and stays in it: the read-only notice and "Not in sync with …"
  in the toolbar, its counts in its status line, a selected item's properties, a highlight on the item a message
  points to.
- A dialog says what is wrong with its own fields beside them, as long as it is open.
- A toast only says an action was done, carrying its Undo when it can be undone.

## Everywhere

- **Both interfaces** (Silinx and ISE style), **light and dark themes**, **narrow screens** (a tablet in portrait)
  and **touch** (a long press is the right click).
- **Portuguese**: every label has its translation (`web/js/i18n.js` and its modules, anchored patterns).
- **Tests**: a UI test in both interfaces for anything visible. `test/ui/editor-toolbars.test.js` (the status line too),
  `test/ui/text-editor-bar.test.js` and `test/ui/readonly-notice.test.js` check the rules above on every editor; a
  new editor or view joins them.
