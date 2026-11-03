In short:

- An AI assistant (MCP) changes a project's settings and sources as the interface does: Design Properties (the
  board, the device, the synthesis tool) and Process Properties, Unset as Top Module, Remove from / Add to
  Project, Rename, Delete File and Delete Folder, and deletes a project.

In detail:

- **MCP: the project's settings and sources (#2674):** nine new tools of the MCP server. `list_devices` lists the
  boards (their variants) and the devices by family; `set_design_properties` sets a board or a device and the
  synthesis tool as Design Properties does, the new device checked against the design (its warnings), the
  constraints file of the device's format (a PCF for an iCE40) and, with `update_constraints`, the new board's
  pins written into it; `set_process_properties` sets the Optimization (Fast, Area, Speed), the FPGA start-up
  clock and the place and route engine. `unset_top`, `remove_from_project` (a drawing with its HDL file),
  `add_to_project`, `rename_file` (a file or a folder: the drawings' links follow), `delete_file` (a file or a
  folder) and `delete_project` (to the workspace's .trash) do what the Design pane's menus do; a top module the
  project no longer has becomes the one root left of its view, else none, with the interface's messages. In
  `server/mcp-settings.js` and `server/mcp-sources.js`. Tests: test/mcp-settings.test.js, test/mcp-sources.test.js.
