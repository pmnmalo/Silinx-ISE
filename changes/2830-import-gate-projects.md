In short:

- **Imported projects are screened:** Import Silinx ISE Project and Import Xilinx ISE Project (a .zip, a .xise with its
  files, a folder), and the MCP server's import_project, leave out a file the import gate refuses (a path that leaves the
  project, a hidden folder such as .git, a name with < > or another character a name cannot hold, an XML file with a DTD,
  a source that is binary or a web page) and say each one, with why, in the console; a zip bomb is refused as a whole.

In detail:

- **The project imports through the import gate (#2830):** the zip upload (`/api/projects/import-zip`), the `.xise` with
  its files (`/api/projects/import-xise`), the browser edition's `importZip`, `importXise` and project bundles, and the
  MCP's `import_project` (a zip, a `.xise` with its folder, a folder) read their files through `core/import-gate.js`
  (`gateZip`, `gateEntries`); `importProjectEntries` and `projectFromZip` take only a gate's result. The gate's refusals
  come first in the import's warnings (the console's and the MCP result's), but those of an ISE project's own outputs,
  which the import leaves out anyway; a refused `.xise` or `silinx.json` is the import's error, with its reason. The gate
  keeps a project's documents, scripts and other files as they are (opaque: never shown as a page nor run).
  - **Tests:** test/server-api.test.js (the zip and `.xise` routes: an XXE `.xise`, a traversal and a script in a name,
    every warning asserted), test/mcp-transfer.test.js (a zip bomb, an XXE `.xise`, a script in a name),
    test/project-zip.test.js, test/project-store.test.js, test/import-gate.test.js, test/ui/projects.test.js (the
    console's refusals, in both interfaces), test/ui/standalone.test.js.
