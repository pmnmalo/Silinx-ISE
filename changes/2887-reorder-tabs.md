In short:

- **Tabs in your order:** drag an editor's or a viewer's tab left or right to reorder it, as in a browser, with or
  without the split, or to a chosen place in the other side's row; Alt+Shift+← / → moves a focused tab. The order
  comes back with the project's open documents.

In detail:

- **The documents' tabs reordered by dragging (#2887):** `web/js/tab-order.js` (in place of split-view.js's drag to
  the other side): a slot of the tab's width marks where it lands while the other tabs make room; Escape or a drop
  outside the rows cancels; a click still selects and the close button still closes; pointer events (a finger or a
  pen too). A focused tab moves with Alt+Shift+← / → (Ctrl+Shift+PageUp / PageDown where the browser leaves them),
  named in its tooltip and in Help ▸ Keyboard Shortcuts. The order is the documents' (each task's, Design's and
  Simulate's), kept with the open documents and restored in it, each side's in a split; Move to the Other Side and
  Show … Beside put a document at its new row's end. Portuguese; both interfaces; view-only, no MCP tool.
