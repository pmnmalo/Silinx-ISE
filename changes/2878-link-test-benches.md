In short:

- **Copy Link… lists the test benches for the simulation:** with Open in: Simulation, the Module list holds the
  project's test benches, and the link simulates the one chosen; the other views list only the design's modules.

In detail:

- **A link's simulation of a chosen test bench (#2878):** Copy Link…'s Module list follows Open in: the simulation's
  lists the test benches (the modules of the files with the Simulation association, the project's first and
  chosen), the others the design's modules, no test bench. `view=simulate&top=<test bench>` simulates that test
  bench (with no `top=`, the project's); core/design-link.js `viewProblem` refuses a `top=` that is not a test bench
  with `simulate`, and a test bench with another view (`benchNames`); the MCP server's `project_link` and
  `open_link` so too.
