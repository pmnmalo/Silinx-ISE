In short:

- **Show … Beside for every related view:** right-click a tab in Design or Simulate (or open View) to show beside it
  what it generates or comes from: a drawing's schematic, ASM chart or state diagram, its VHDL and Verilog; a C source's
  HDL, ASM chart and synthesis report; a test bench's unit under test; a waveform's test bench and unit under test.

In detail:

- **A tab's related views, side by side (#2834).** A tab's menu, and View for the document in front, list Show … Beside
  for every view related to the document that exists or can be made now (`web/js/related-views.js`): Boolean algebra →
  its schematic; a state diagram → its ASM chart; an ASM chart → its state diagram; a Petri net → its state machine; a
  drawing → its HDL and the HDL's translation; a generated HDL file, a converted drawing or the table's schematic → the
  drawing; an HDL source → its translation to the other language, whichever the preferred one; a test bench → its unit
  under test; a C / C++ source → its HDL, its ASM chart (sequential), its synthesis report; the views made from it → the
  C; a waveform → the module it shows, or the test bench and its unit under test; the RTL and technology schematics, the
  C model, the power report and the Design Summary → their module. An entry opens the view on the split's other side,
  the document kept in front; a view open already is brought to the front there (a translation made again); one that
  cannot be made says why in the console and leaves the split as it was. The labels replace Show Generated HDL / VHDL /
  Verilog Beside ("Show Schematic Beside", "Show VHDL Beside", "Show Test Bench Beside", …), in Portuguese too. New
  read-only views: a state diagram's ASM chart, an ASM chart's state diagram, a C source's synthesis report as a
  document (`web/js/related-docs.js`). In the Tasks interface a view shown beside joins its document's task.
  - **MCP:** `related_view` gets the read-only views that are no file of the project (an HDL source's translation, a
    state diagram's ASM chart, an ASM chart's or a Petri net's state diagram, a truth table's schematic), nothing
    written; the others are `read_file`'s, `c_generated`'s and `c_synthesis_report`'s.
  - **Tests:** test/ui/related-views.test.js (per kind of document the entries, each beside, one open already brought to
    the front, a failing conversion in the console, Portuguese; both interfaces), test/ui/split-view.test.js and
    test/ui/translation.test.js (the new labels), test/mcp-views.test.js (each view as the core makes it, nothing
    written, the refusals), test/mcp.test.js and test/mcp-modules.test.js (the tool list).
