In short:

- **An exercise packaged for the students:** in the Exercise document's ⋮ menu:
  - **Export Student Copy** saves the exercise without its hidden tests;
  - **Classroom Template…** saves the GitHub Classroom assignment's template repository as a zip, its starter project
    made from the statement in VHDL or Verilog.

In detail:

- **The student's copy and the Classroom template from the interface and the MCP (#3841, part of #3191):**
  - `core/grade-package.js`:
    - `starterProject`, the starter project from the statement: the top module with the statement's ports and an
      empty body, on the teacher's board and device;
    - `templateFiles`, the template's files, made in the page or on the server.
  - `server/classroom.js makeTemplate` writes the same files. `silinx classroom template` makes the starter project
    from the statement when none is given (`--language vhdl|verilog`).
  - In the interface, the Exercise document's ⋮ menu has Export Student Copy and Classroom Template…
    (`web/js/exercise-package.js`; Portuguese labels).
  - In the MCP server, `grade template` writes the template to a new folder of the exchange folder.
  - Tests: grade-package (the starter compiled with the statement's ports and graded, in VHDL and Verilog; the files
    the same as makeTemplate's, nothing hidden in them), classroom (the command with no starter), mcp-grade, UI
    exercise (both interfaces, Portuguese); docs/CLASSROOM.md and docs/GRADING.md.
