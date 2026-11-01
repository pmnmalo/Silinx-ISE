In short:

- Browser edition: a new project from an example on another board than the Basys2 gets that board's pins, as in the
  local server.

In detail:

- **A new project from an example on another board, in the browser edition (#2430):** its UCF is made from the chosen
  board's pin table when the example's pins are not on that board (`boardUcf`, `web/js/implement.js`), as the local server
  writes it (#36). It kept the example's Basys2 pins, and the first Implement Design stopped on them.
  - **Tests:** test/ui/standalone-boards.test.js.
