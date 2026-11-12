In detail:

- **MCP server: more results labelled "Untrusted content" (#3528):** as `read_file`'s are (#3363), these results are
  now labelled after their text, with `untrusted` in their structured content: `open_link`'s result for a design link
  (the design's names, its warnings), `project_info` (its `silinx.json`'s fields and files' names), `lab` on a
  project's own lab (its titles and texts, a lab file's problems), `simulate` when the design printed lines (`report`,
  `$display`, assertions), `share_project`'s status with warnings and no followers, and every tool's error, which may
  name a project's or a shared project's files. An argument the schema refuses is not labelled. `open_link` now takes
  a design's own `board`, `top` and `simTop` only as names, as it does with the link's `board=` and `top=`, and refuses
  the link before anything is made. Test: mcp-untrusted (each tool's label, or none for Silinx's own text).
