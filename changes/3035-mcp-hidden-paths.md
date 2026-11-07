In short:

- **The MCP server leaves a project's hidden files alone:** an assistant can no longer read, rename, delete, add or
  remove a project's hidden files and folders (`.git`, `.env`, an editor's settings), as it could already not write
  them; the reports of `build/` are read as before.

In detail:

- **A project's hidden files and folders refused by every MCP tool that takes a path (#3035):** the hidden-segment
  rule of write_file is in the tools' shared path function (`server/mcp-util.js` projectPath, by the path's name and
  once its symbolic links are followed), with write_file's message for each tool's action (`'.git/config': a hidden
  file or folder cannot be read`, `… cannot be renamed`, `… cannot be deleted`, `… cannot be added`, `… cannot be
  removed`): read_file, write_file, rename_file, rename_module's file, delete_file, remove_from_project,
  add_to_project (`server/mcp-sources.js` sourcePath), and the tools that read a drawing or a source a path names
  (check_drawing, simulate_drawing, related_view, convert_drawing, set_output_logic, rearrange_wires /
  rearrange_schematic, the C tools, block_memory's initial contents: projectText); rename_file's new name keeps the
  import gate's message, as Rename's; `build/` is not hidden, its reports read as before.
