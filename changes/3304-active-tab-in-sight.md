In short:

- With more tabs than fit, the tab of the editor, viewer or report in use is always the active one and in sight: after
  a click in it (either side of a split), a change of view (Design / Simulate / Implement, Implementation / Simulation)
  or a resize of the window or the panels.

In detail:

- **The active document's tab in sight (#3304):** `web/js/tab-sight.js` (new): a click or the focus in a document
  brings it to the front, or, already in front, scrolls its tab into its row's visible part (the strip, or its side's
  row in a split); so do a change of the Tasks interface's task, of the ISE style's view, of the interface, and of the
  strip's width. Only the tab row scrolls, never the page (`app.js` activateDoc's `scrollIntoView` replaced).
