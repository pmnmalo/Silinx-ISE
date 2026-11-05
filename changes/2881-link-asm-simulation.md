In short:

- **A link to an ASM chart's simulation:** `view=try` opens an ASM chart and its simulation, as it opens a state
  diagram's or a Petri net's; Copy Link to This Module… chooses it for an ASM chart's module.

In detail:

- **A design's link into an ASM chart's simulation (#2881):** `view=try` is valid for a module drawn as an ASM chart
  (core/design-link.js `TRY_DRAWING`); the link opens the chart and its simulation panel through the ASM editor's
  `showPanel('sim')`, as the state diagram's and the Petri net's; until the editor has it, the chart opens and the
  console says its simulation is not in this version yet. Copy Link to This Module… chooses it; the MCP tools say so.
