In short:

- **No Design Utilities in the Processes:** the group and its View HDL Instantiation Template are gone, in every
  interface; the HDL editor's Instantiate module writes the same instantiation.

In detail:

- **No Design Utilities (#1072):** the Processes' Design Utilities group (`web/js/processes.js`), its only process,
  View HDL Instantiation Template, the read-only template document it opened (`openInstTemplate`, `web/js/app.js`,
  documents `tpl:<module>`) and their Portuguese labels are removed. `instTemplate` (`web/js/editor.js`) stays, for
  Instantiate module. Tests: `test/ui/editing.test.js` (the Processes list neither), `test/tasks.test.js`,
  `test/web-helpers.test.js`.
