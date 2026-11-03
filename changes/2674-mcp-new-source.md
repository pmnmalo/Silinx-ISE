In short:

- An AI assistant (MCP) adds a new source as New Source does: a module with its ports, a test bench of a module, a
  VHDL package, a constraints file, a .mem, a C or C++ function, an empty schematic, state diagram, ASM chart, Petri
  net or truth table, in VHDL or Verilog.

In detail:

- **MCP: New Source (#2674):** `new_source` makes each type of the New Source wizard from its own templates
  (web/js/templates.js, c-templates.js) and the drawings' models, test benches with the wizard's unit under test
  (core/uut-info.js), in the project's Preferred Language or the one given, with the wizard's checks (a file name,
  a reserved word, a module or a drawing's HDL file already there); a file that exists is not replaced, and a
  constraints file is the project's when it has none (a PCF for an iCE40). In `server/mcp-new-source.js`. Test:
  test/mcp-new-source.test.js (the module and its test bench compiled, elaborated and simulated in VHDL and in
  Verilog; the drawings' Check Syntax).
