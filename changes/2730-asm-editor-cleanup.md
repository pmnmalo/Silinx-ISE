In short:

- **The ASM chart editor:** its errors and warnings in the console's Errors and Warnings tabs (a click selects the
  box), Validate's in the Console; the Machine settings in a panel of their own on the left; the number of states at
  the toolbar's right end, "Encoding:" before its selector; no hint on the canvas, no status line.

In detail:

- **The ASM chart editor and its read-only views as the other editors (#2730):** no hint text on the canvas and no
  status line (web/js/asm-editor.js); the count of states (and of every-cycle blocks) at the toolbar's right end
  (`.asm-info`, asm-render.js), the zoom level beside the zoom tools, an "Encoding:" label before the encoding's
  selector; the Machine section of the Properties a panel of its own on the left (`.asm-left`), folded to a strip
  (side-fold.js, remembered) and over the canvas on a narrow window, shown by ☰ Machine (narrow.js `MACHINE_KEY`).
  The Problems panel removed: the chart's errors and warnings go to the console's Errors and Warnings tabs while it is
  open, updated as it is edited, a click selecting the box (web/js/editor-problems.js, for the diagram editors; part of
  #2718), and Validate writes them in the Console under Design (`Started : "Validate" of …`, each line going to its box);
  the editor's notes (a connection dropped on nothing) are Console lines. Portuguese. Tests:
  test/ui/asm-editor-chrome.test.js (both interfaces), test/ui/asm-render.test.js, test/ui/diagrams.test.js,
  test/ui/new-source-empty.test.js, test/ui/c-asm.test.js, test/ui/editor-toolbars.test.js, test/messages.test.js.
