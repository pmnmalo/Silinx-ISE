In short:

- One console in the modern and classic interfaces too: the simulator's (SSim's) console and command line and the board
  emulator's messages are in the Console at the bottom, with filters by source (All, Design, Simulation,
  Emulator, Synthesis, Implementation, Board).

In detail:

- **The message centre in every interface (#925):** the Tasks interface's message centre (#798) is built in the
  modern and classic interfaces as well. Each Console line says where it comes from, and the filters above the Console
  show one source or all of them (All by default; the Tasks interface follows its task). SSim's console is mirrored
  into the Console and its own bottom panel is hidden; SSim's command line is the Console's (prompt `SSim>`, with the
  history on ArrowUp / ArrowDown) while a simulation is in front, the command palette otherwise. The emulator's Messages
  box is in the Console too. The styles moved from tasks.css to a stylesheet of their own, `web/css/messages.css`.
