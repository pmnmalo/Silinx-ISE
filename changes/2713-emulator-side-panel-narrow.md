In short:

- **Board Emulator on a narrow window:** its side panel (Watch, notes) opens over the board from a ☰ Properties
  button in its toolbar, as the diagram editors' Properties do, rather than below the board.

In detail:

- **The Board Emulator's side panel on a narrow window as the diagram editors' (#2713):** under 900 px wide (a tablet,
  the Tasks interface's panel beside it) the panel goes over the board, closed at first, shown and hidden by ☰
  Properties in the emulator's bar (`panelToggle`, remembered as the editors' Properties; `narrowOnly: false`, the
  emulator narrow by its own width), instead of below the board with the whole emulator scrolling down; the board's
  area keeps the whole width. Tests: test/ui/emulator-panels.test.js, test/ui/tasks.test.js (the bar's buttons in
  test/ui/emulator-parts.test.js and test/ui/sim-emu.test.js without it).
