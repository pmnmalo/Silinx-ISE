In detail:

- **A design and simulation project, in the core and the MCP server (#3780, part 1):** a project's kind
  (`core/project-kind.js`): `"kind": "design"` in `silinx.json` is a project of drawings and simulation only, with no
  board, no constraints and no HDL shown (the core keeps making and simulating the drawings' HDL). The MCP server's
  `new_project` makes one (`design_only`), `project_info` shows its drawings and no HDL, and the flow's and the HDL's
  tools refuse it with the messages the interface will show (`server/mcp-design-only.js`); `set_design_properties`
  makes it an FPGA project with a board (or a device), and the reverse with `design_only` when every source is a
  drawing. The local server's and the browser edition's implementation refuse it too; its tool descriptor is
  `DESIGN_ONLY` (Check Design; the Design and Simulate tasks).
