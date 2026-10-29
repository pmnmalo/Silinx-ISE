In short:

- The handwriting pad has a Move tool: a drag with a pen, a finger or the mouse moves the drawing in the pad.

In detail:

- **Move on the handwriting pad (#2003):** the pad of the Handwritten Expression, Truth Table and Schematic dialogs has
  a Move button beside Fit (pressed while on): a drag with a pen, a finger or the mouse moves the drawing in the pad
  (its view) instead of writing, and the mouse's middle button drags it at any time; the strokes keep their
  coordinates, so what is read does not change (web/js/ink-pad.js, web/css/ink.css). Tests: test/ui/ink.test.js (the
  mouse, a pen, the middle button, the same text; Move off writes again), the dialogs' Portuguese labels.
