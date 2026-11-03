In short:

- **Read-only state machines:** a Petri net's and a C source's state machine have no bar above the diagram, their
  "Read-only" notice at the right of its toolbar.

In detail:

- **Read-only diagrams without a bar above their toolbar (#2710):** a Petri net's state machine and a C source's ASM
  chart show their notice at the right end of the diagram's toolbar (`banner` of `mountFsmEditor` and
  `mountAsmEditor`), as the text editors and the schematic do (#2697), and no longer the document's name, which is
  the tab's; the C source's HDL and the C model's bar without the name too. Test: test/ui/readonly-notice.test.js.
- **The interface's rules for contributors (#2710):** docs/UI-GUIDELINES.md, linked from CLAUDE.md and ONBOARDING.md:
  no bar above a document's toolbar, the read-only notice at its right, no Undo / Redo / Print in it, the side panel,
  the hint line, the Design pane's badges.
