In detail:

- **An imported `silinx.json`'s paths by the import gate's rules (#3411):** its constraints and files that name the
  project's description (`silinx.json`), a hidden file (`.vscode/tasks.json`, `.git/config`) or another name the gate
  refuses are dropped, each with a warning, and the board's constraints (Update Constraints of the MCP's `set_top` /
  `set_design_properties`, a new project of another board) are not written to such a path (an error says why), where
  they replaced the project's description or made a hidden file.
