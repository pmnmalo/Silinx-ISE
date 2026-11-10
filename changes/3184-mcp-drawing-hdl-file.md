In short:

- **An assistant's new drawing gets its HDL file:** a schematic, truth table or Petri net made through the MCP server
  (New Source, or a drawing written into the project) has its HDL file at once, as one made in the interface.

In detail:

- **MCP: a drawing with no HDL file gets it (#3184):** `new_source` of a drawing, and `write_file` of a drawing not
  linked to an HDL file yet, write the HDL made from it next to it and link it (`generatedFile`), as the interface's
  adoptDrawnHdl does when the project is loaded (`server/drawing-sync.js` adoptDrawing); not when it has errors (an
  empty state diagram or ASM chart), when that file exists already or another HDL file defines its module.
