In short:

- An AI assistant (MCP) converts an HDL module to a schematic, an ASM chart or a state diagram (its base from then
  on), a state diagram to an ASM chart and back, and a state diagram to its Boolean algebra, as the Design pane's
  menus do.

In detail:

- **MCP: the conversions (#2674):** `convert_module` converts a module of an HDL file as Convert to Schematic / ASM /
  State Diagram does (core/hdl-to-sch.js laid out with elkjs, core/asm-from-hdl.js, core/fsm.js): the drawing becomes
  the module's base, a file of several design units split; its HDL file stays as it is until the drawing is edited.
  `convert_drawing` makes a new, unlinked ASM chart of a state diagram, a state diagram of an ASM chart, or the
  Boolean algebra of a state diagram's next-state and output logic. The converters' refusals; a module that is a
  drawing's already is not converted. In `server/mcp-convert.js`. Test: test/mcp-convert.test.js (stopwatch's and
  traffic's test benches as before the conversion).
