In short:

- The ISE style interface has the themes of the Silinx one: View ▸ Theme ▸ System, Light or Dark, and a dark ISE look
  (its caption bars, toolbars, panes, console, dialogs and every editor).

In detail:

- **The ISE style interface: the themes System, Light and Dark (#2676):** View ▸ Theme in its menus, the theme shown
  following the choice (and the system) as in the Silinx interface, also before the first paint; a dark version of the
  ISE look (`web/css/ise-dark.css`): the menu bar, the toolbars, the panes and their captions, Processes, the console,
  the dialogs and wizards, the HDL editor, the schematic, FSM, ASM, Petri net and truth table editors, SSim, the board
  emulator, iMPACT and the pin planner; the dark tokens and the documents' dark rules of `silinx.css` shared by both
  looks. The dark contrast scan runs in the interface the UI tests run in. Tests: test/ui/silinx.test.js,
  test/ui/dark-contrast.test.js.
- **The ISE style interface, light: the disabled menu items and a selected tree row's twisty readable (#2678):** they
  were below a contrast of 3 (2.4 and 1.4). Test: test/ui/dark-contrast.test.js.
