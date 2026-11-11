In detail:

- **The MCP's shared project written atomically (#3475):** what an editor of a project the MCP server shares
  (`share_project`) changes in a text file or a drawing is written to a hidden temp file renamed over the file
  (`server/projects.js` `writeAtomic`, out of `writeFile`, which the interface's owner already went through), so that a
  reader at that moment (the project watcher, another process) never sees it empty or half-written. Tests: mcp-collab (a
  reader polling a text file and a drawing while an editor's changes are written reads only whole texts, the files
  replaced, no temp file left; fails on the old code).
