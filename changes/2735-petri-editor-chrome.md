In short:

- **The Petri net editor, cleaner:** no hint line and no status line under the drawing; the net's counts ("2 places ·
  2 transitions · 4 arcs") at the right of the toolbar, the zoom beside its buttons; no "Nothing selected" text in the
  Properties; its problems in the console's Errors and Warnings tabs (a click selects the place, transition or arc),
  its messages (an arc that cannot be drawn, a PNML not read, no transition enabled) in the console.

In detail:

- **The Petri net editor's hint and status lines gone (#2735):** as docs/UI-GUIDELINES.md asks and the ASM editor
  did (#2730): its counts are the toolbar's informational text (`.asm-info`), the zoom level beside the zoom tools,
  the selection's section hidden when nothing is selected.
- **Its problems and messages in the console (#2718):** the Problems section is gone; `mountPetriEditor` says its
  validation with `onProblems` (when it changes) and its messages with `onMessage(text, isError)`; drawings.js puts
  them in the Errors and Warnings tabs (editor-problems.js, a click selecting the item with `ed.select`) and the
  Console (an edit refused: a warning; the simulation's: a note), and clears them when the net is closed.
