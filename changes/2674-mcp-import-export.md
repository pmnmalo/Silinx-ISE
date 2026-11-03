In short:

- An AI assistant (MCP) exports a project as a Xilinx ISE or a Silinx ISE .zip, and imports one: a .zip, an ISE
  project's .xise or a project folder, as the File menu does; in your Downloads folder only (or the folder
  `SILINX_MCP_FOLDER` names).

In detail:

- **MCP: a project's import and export (#2674):** `export_project` writes a project as a .zip on the disk, as
  Export Xilinx ISE Project (its .xise, the schematics as ISE schematics, a C source as its HDL) or Export Silinx
  ISE Project does, never over an existing file; `import_project` makes a new project from a .zip, a .xise with
  its folder or a project folder, as Import Silinx / Xilinx ISE Project does: the paths that leave the project
  and the hidden files dropped, with the import's warnings and the files the project lists but were not found.
  Where the interface has the user choose the file, the assistant names it: both tools take only the paths of one
  exchange folder (the user's Downloads, or `SILINX_MCP_FOLDER`), its symbolic links that leave it refused.
  The export.zip and import-zip routes' code moves, as it was, into `server/project-zip.js`, which both call.
  Tests: test/mcp-transfer.test.js, test/project-zip.test.js.
