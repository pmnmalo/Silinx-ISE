In detail:

- **A link's board emulator emulates the top module (#2884):** Copy Link… with Board Emulator let any module be
  chosen, and the link emulated that module, whose ports have none of the constraints' pins: the board showed nothing
  connected. Its Module list is now disabled on the top module, the link names no module, a link opens the emulator
  on the project's top, and a `top=` other than the top is refused with the reason in the console
  (core/design-link.js `viewProblem`, the MCP tools so too).
