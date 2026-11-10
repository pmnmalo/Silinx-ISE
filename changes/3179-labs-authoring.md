In short:

- **Labs written in Silinx:** New Source ▸ Guided Lab starts a teacher's lab from a template (a reading step, Check
  Syntax, the test bench's simulation), in English and Portuguese, ready to edit; the lab file is checked as it is
  edited, each save and its Check Syntax saying what is wrong with it.

In detail:

- **Guided labs, written in Silinx (#3179):** New Source's type Guided Lab (`web/js/new-source.js`: in the project's
  `labs/` folder, its name the lab's id; `core/labs.js` newLab, its texts in English and Portuguese), opened in the
  editor; a lab file checked as it is edited (`web/js/lab-view.js`: each save says its problems when they change, its
  Check Syntax says them all; `core/labs.js` labFileLines); the MCP server's `new_source` type `lab` and `lab` action
  `validate`, through the same functions.
