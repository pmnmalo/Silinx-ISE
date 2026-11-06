In short:

- **MCP server:** a project an assistant makes through the MCP server waits for your trust, as an imported one does:
  Xilinx ISE and programming a board or a PROM run for it once you click **Trust Project** in the console.

In detail:

- **Projects the MCP server makes start untrusted (#2981):** `new_project`, `new_project_from_example` and `open_link`
  of an example mark the project `trusted: false` with `madeBy: "mcp"` in its silinx.json, so an assistant cannot copy
  an imported project's sources into a new project and run Xilinx ISE on them without the user; the Silinx toolchain
  runs as before. The tools' results, the server's refusal and the console's line when the project opens say it was
  made through the MCP server (by an assistant); Trust Project clears both marks; a description written whole keeps
  them; such a project exported and imported again is an imported one.
