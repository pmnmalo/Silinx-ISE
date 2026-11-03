In short:

- An AI assistant (MCP) that writes a drawing (a schematic, an ASM chart, a state diagram, a truth table, a Petri
  net) gets its HDL file made again, as its editor does; it sets a drawing's language (Source Properties) and the
  project's Preferred Language.

In detail:

- **MCP: the drawings' HDL made again on the server (#2674):** `write_file` of a drawing linked to its HDL file
  makes that file again from it (`server/drawing-sync.js`, the editors' generators through core/view-hdl.js: the
  repository's drawings give their HDL files byte for byte), and a drawing with errors leaves it as it was, stale:
  Check Syntax and the simulation then stop on it with the interface's error (#303). `set_source_properties` gives a
  drawing a language of its own, or the project's, and `set_design_properties` takes `preferred_language`: the
  drawings and their HDL files in that language, the files in the other one removed (#220, #1477, #2254). The
  test benches of gates, blinky and traffic pass in both languages. Design Properties' warning to check the pins
  comes after "Device set to", as in the interface. Tests: test/drawing-sync.test.js, test/mcp-drawings.test.js.
