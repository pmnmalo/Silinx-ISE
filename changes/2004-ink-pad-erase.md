In short:

- The handwriting pad has an Erase tool: a drag rubs out the ink under it, wider than a written line.

In detail:

- **Erase on the handwriting pad (#2004):** the pad of the Handwritten Expression, Truth Table and Schematic dialogs has
  an Erase button beside Move and Fit (one of them on at a time): a drag with a pen, a finger or the mouse rubs out the
  ink within 12 px of it (a line is 3 px wide), a stroke it crosses cut in two, the eraser's circle shown where it rubs;
  one drag is one step of Undo, and the drawing is read again when it ends (web/js/ink-pad.js). Tests:
  test/ui/ink.test.js (a B rubbed out, the rest read as before, Undo and Redo, Erase or Move), the dialogs' Portuguese
  labels.
