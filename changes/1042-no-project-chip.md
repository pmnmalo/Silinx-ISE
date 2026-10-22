In short:

- **No project chip in the header:** the project's name, which opened Open Project from the header of the modern and
  Tasks interfaces, is gone; a project is opened from File or the Start page, and its name is in Design.

In detail:

- **No project chip (#1042):** `#title-project` (`web/index.html`), its text (`web/js/project.js`), its click
  (`web/js/app.js`) and its styles (`modern.css`'s `.m-chip`, `tasks.css`) removed, in every interface (classic had
  it hidden already). Tests: `test/ui/tasks.test.js` (#1042: none in Tasks, modern and classic),
  `test/ui/modern.test.js`, `test/modern.test.js`.
