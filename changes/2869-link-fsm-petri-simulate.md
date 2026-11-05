In short:

- **A link to a state diagram or a Petri net:** `view=try` now opens a state diagram's or a Petri net's Simulate panel,
  as it opens a schematic's Try it; Copy Link to This Module… chooses it for them.

In detail:

- **A design's link into a state diagram's or a Petri net's simulation (#2869):** `view=try` is valid for a module
  drawn as a schematic, a state diagram or a Petri net (core/design-link.js `tryDrawing`): the link opens the drawing
  and its Simulate panel (the Petri net editor's `showPanel`, as the state diagram's); any other module is refused
  with the reason in the console. Copy Link to This Module… chooses it for those three; the dialog's option reads
  "Try it (a drawing's simulation)"; the MCP server's `project_link` and `open_link` describe it so.
