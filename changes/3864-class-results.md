In short:

- **The class's results in Silinx:** the Exercise document's ⋮ menu has **Class Results…**. It opens the results of a
  teacher's run (`silinx grade --json`, `silinx classroom grade --json`) with:
  - each test's rate of Accepted, the weakest test first;
  - each student's verdicts, a click putting their report in the console;
  - **Export CSV**.

In detail:

- **The Results document (#3864, part of #3191):**
  - `core/grade-class.js`:
    - `parseResults` checks the results file: its shape and sizes. It is untrusted data.
    - `classSummary` sums it up: per test (Accepted, its rate, the most frequent other verdict, the weakest first) and
      per student. `classCsv` gives `--csv`'s CSV, and `classText` the text.
  - `web/js/grade-results-view.js`:
    - the document: its toolbar's Export CSV, the two tables, its status line;
    - Class Results… in the Exercise document's ⋮ menu;
    - a project's `grades.json` or `<name>.grades.json` opened from the Files;
    - Portuguese labels.
  - The MCP server's `grade results` does the same from a file of the exchange folder, with the CSV (`csv`).
  - Tests: grade-class (five students graded for real, against the numbers counted by hand; the CSV; the file's
    problems), mcp-grade, UI exercise (both interfaces, Portuguese); docs/GRADING.md, docs/CLASSROOM.md.
