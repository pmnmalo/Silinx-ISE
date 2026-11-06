In short:

- **Rename:** a file's new name follows the same rules as an imported file's (no reserved name such as `CON`, no name
  ending with a dot or a space, none of `< > : " | ? *`), in the interface as in the MCP server.

In detail:

- **Rename takes a new name by the import gate's rules (#2973):** `renameFile` (server/projects.js) checks the new
  name with the import gate's `normalizePath`, so the interface's Rename and the MCP tool `rename_file` refuse the
  same names with the same message ("'src/CON.vhd': not renamed: reserved name ('CON.vhd')"); the browser edition's
  store does the same; a rename undone (a module's rename that failed halfway) puts a file back at its old name
  whatever it was.
