In short:

- An AI assistant (MCP) exports a project as a Xilinx ISE or a Silinx ISE .zip, and imports one: a .zip, an ISE
  project's .xise or a project folder, as the File menu does.

In detail:

- **MCP: a project's import and export (#2674):** `export_project` writes a project as a .zip on the disk, as
  Export Xilinx ISE Project (its .xise, the schematics as ISE schematics, a C source as its HDL) or Export Silinx
  ISE Project does, never over an existing file; `import_project` makes a new project from a .zip, a .xise with
  its folder or a project folder, as Import Silinx / Xilinx ISE Project does: the paths that leave the project
  and the hidden files dropped, with the import's warnings and the files the project lists but were not found.
  The export.zip and import-zip routes' code moves, as it was, into `server/project-zip.js`, which both call.
  Tests: test/mcp-transfer.test.js, test/project-zip.test.js.
