In short:

- **Toolbars:** what a toolbar says, rather than does, is at its right end, as the read-only notice: I/O Pin
  Planning's top module, device and board and its status, the implemented design's info on the site selected, the
  truth table's "Not in sync with …".

In detail:

- **A toolbar's informational text at its right end (#2725):** I/O Pin Planning's "Top: … · Device … · Board: …"
  and its status after the spacer and the ☰ panels' buttons (web/js/pinplanner.js), the FPGA view's info after its
  ☰ Properties, right-justified (web/js/fpgaview.js, fpgaview.css), the truth table's sync notice (truthtable.css);
  the rule in docs/UI-GUIDELINES.md. Test: test/ui/toolbar-info-right.test.js, both interfaces.
