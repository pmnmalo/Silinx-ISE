In short:

- **The MCP server's Find in Project, Import Source and Design Checks:** an assistant searches a project's sources and
  drawings (and replaces in them), copies files of the exchange folder into a project, and checks the syntax with the
  lint warnings off, as the interface does.

In detail:

- **MCP parity (#3546):** `find_in_project` (Find in Project: the lines of the text sources and the texts of the
  drawings, an HDL file generated from its drawing found but not replaced; its Replace All, written through the import
  gate), `import_source` (Import Source / Add Copy of Source / Import Test Bench: files of the exchange folder copied to
  src/, sim/ or constraints/ with their association, through the import gate, a drawing named with a reserved word
  refused, a file the project has replaced only with `replace`) and `check_syntax`'s `lint` (Edit ▸ Design Checks
  (Lint Warnings)). Their rules are the interface's: Find in Project's files and results (`core/find.js` `findPaths`,
  `findInProject`) and the copy of a source (`core/import-source.js`, out of `web/js/wizards.js` `addSourceDialog`).
