In short:

- **Files added to a project are screened:** Import Source (Add Copy of Source in the ISE style), a Petri net's PNML
  import and the MCP server's write_file refuse a file the import gate refuses (binary or a web page under a source's
  name, a name with < > or another character a name cannot hold, XML with a DTD, a source nested too deep or with a
  2000-branch elsif chain), with why, in the console or the tool's result.

In detail:

- **The single-file imports through the import gate (#2830):** Import Source / Add Copy of Source (`gateFile` for each
  file; one refused is not added, a `WARNING:` line in the console), the Petri net editor's PNML ⇧ (a refused net leaves
  the net as it was), the MCP's `write_file` (`<path>: not written: <reason>`). `test/import-gate-coverage.test.js`
  fails when a module that reads a file from outside (a file input, files dropped, a zip, an upload, the MCP's exchange
  folder, a design link's compressed text) does not import the gate, or is not listed there with the reason it needs
  none.
  - **Tests:** test/import-gate-coverage.test.js, test/mcp.test.js (write_file: an XXE schematic, a binary source, a
    script in a name, a long elsif chain, a web page), test/ui/projects.test.js (Import Source, both interfaces),
    test/ui/petri.test.js (an XXE PNML).
