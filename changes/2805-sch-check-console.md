In short:

- **The Schematic's Check in the console in the ISE style interface too:** its errors and warnings are lines of the
  console and its Errors and Warnings tabs, as in the Silinx interface, no longer a panel under the drawing. A click
  on a line selects its item. A Try it that cannot start lists its errors there too, in both interfaces.

In detail:

- **No problems panel in the schematic editor (#2805):** the editor's Check and a refused Try it send their problems
  to the console in every interface (`web/js/tasks-check.js initCheckMessages`, no longer only in the Silinx one),
  as docs/UI-GUIDELINES.md asks: a header, the errors and warnings, each taking the drawing to its item, and the
  result ("Check Schematic", "Try it"), the Errors tab brought to the front, else the Warnings tab (`showProblems`,
  #2803). The editor's `.se-diags` panel is gone (`web/js/sch-try.js`, `web/js/sch-dom.js`), with its styles and
  its labels' translations, and so is the refused Try it's message in the editor's hint line.
