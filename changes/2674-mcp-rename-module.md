In short:

- An AI assistant (MCP) renames a module as Rename does: its instances in every source, the schematics' symbols
  of it, the drawing it is made from, the project's top and test bench, and its file.

In detail:

- **MCP: a module renamed with its references (#2674):** `rename_module` renames a module of the project's HDL
  files as the interface's Rename does (`server/rename-module.js`, web/js/rename.js's renameSource on the server):
  its declaration and instances in every source (core/rename.js), the schematics' symbols of it, the drawing it is
  made from (named after it, renamed with it; its HDL made again), the project's top, test bench and stimuli; its
  file follows the new name when it is named after the module, or goes where it is told, or stays. The dialog's
  refusals: a bad name, a reserved word of VHDL, Verilog or SystemVerilog, a module or a file that exists; the files
  are moved all or nothing. Tests: test/rename-module.test.js, test/mcp-sources.test.js.
