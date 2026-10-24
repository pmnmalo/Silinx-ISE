In short:

- **No Program task:** the modern interface's tasks are Design, Simulate, Emulate and Implement; programming the board is
  Implement's: iMPACT opens there (its Processes' Configure Target Device, the Design Summary's Program the board…).

In detail:

- **Programming in Implement (#1172):** web/js/tasks.js (four tasks; iMPACT's document Implement's; a kept 'prog' task
  read as Implement), web/js/tasks-prog.js (iMPACT arranged wherever it opens in the Tasks layout), web/css/tasks.css
  (Configure Target Device in Implement's Processes again).
- **The UI tests' rows found and clicked in one go (#1172):** the harness's treeRow counts a row where it finds it (the
  list drawn again between two looks lost it), and in the modern interface acts on a Processes row where the list has
  it, its task coming and going (a project opening in Design, #1191).
