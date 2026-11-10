In short:

- **The emulator lab, and a link that opens a lab:** "The emulator" on the stopwatch example tries the design in the
  Board Emulator, tests it and moves its reset to another switch (in English and Portuguese). Copy Link… can add a lab
  to the link: whoever opens it finds the project with that lab beside it, for a class's exercise.

In detail:

- **Guided labs, the drawing and pins checks, the emulator lab, a link's lab (#3179):** two checks of a lab's step
  (`core/labs-check.js`): `drawing`, an ASM chart, a state diagram, a truth table or a Petri net passing its editor's
  check with exactly the given warnings, and `pins`, a port or a bus's bit on a given pin of the project's
  constraints. The shipped lab "The emulator" on stopwatch; traffic's "A new output" step checks the state diagram
  itself (the output in it, its check). A link's `lab=<id>` (`core/design-link.js`) opens that lab once the project is
  open (a warning when the project has none of that id); Copy Link…'s Lab (the lab in front chosen); the MCP server's
  `project_link` takes a `lab`, and `open_link` returns the link's.
