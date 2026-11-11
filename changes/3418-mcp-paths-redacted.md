In detail:

- **The MCP server's results name no folder of the user's (#3418):** the workspace and the exchange folder are named
  `<workspace>` and `<exchange folder>` in every tool's result and error (`list_projects`' workspace,
  `export_project`'s path and folder, a VCD's or a CSV's path, the exchange folder's errors), never by their absolute
  paths, which told the user's name and folders; a path so named is taken back as one of the exchange folder's. And
  `read_file` of a file of `build/` (a report, a log) is redacted as `get_report`'s: the ISE machine's address as
  `<ISE host>`.
