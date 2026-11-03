In short:

- **A drawing's problems in the console:** the ASM, FSM and Petri net editors no longer have a Problems panel;
  their errors and warnings are listed in the console's Errors and Warnings tabs, with the drawing's file, and their
  notes are lines of the console's log; a click on one shows the box, state or transition it is about. An ASM
  chart's Validate writes its check in the console too.

In detail:

- **The diagram editors' problems go to the console (#2718):** as docs/UI-GUIDELINES.md asks, no message in a
  document's window. Each editor says its problems with a `silinx-problems` event (web/js/problems.js), which the
  console turns into the drawing's file's entries of the Errors and Warnings tabs (translated), replacing its last
  ones as the drawing is edited, and drops when the drawing is closed; its notes (info) are INFO lines of the log,
  each written once. The Problems panels, their styles and
  labels are gone; Validate's "Check ASM Chart" is listed under Design.
