In short:

- The Tasks interface: a schematic's Check writes its errors and warnings in the console below, as every process
  does, rather than in a panel of the editor; clicking one shows its item in the drawing.

In detail:

- **Check Schematic in the console below (#993):** in the Tasks interface the schematic editor's Check writes a
  process's messages in the message centre (a header, its errors and warnings, its result), under the Design source, in
  the Errors and Warnings tabs too, and opens the messages; each error or warning's line takes the editor to its item.
  The editor asks first (a cancelable event, `web/js/tasks-check.js`); in the modern and classic interfaces its own
  panel is shown as before.
