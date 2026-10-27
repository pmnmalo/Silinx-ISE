In short:

- **The HDL generated from a drawing:** its read-only editor no longer shows Undo / Redo buttons that did nothing.

In detail:

- **A toolbar button or separator hidden is not shown (#1636):** `.tb-btn`'s `display: inline-flex` overrode the
  `hidden` attribute, so the Undo / Redo of the read-only generated HDL were still drawn; `.tb-btn[hidden]` and
  `.tb-sep[hidden]` are not displayed. Its UI test checks the buttons rendered, not only their attribute.
