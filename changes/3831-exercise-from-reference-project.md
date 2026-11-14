In short:

- **An exercise authored from the right design:** in the Exercise document's ⋮ menu, **Reference from the Project** makes
  the project's design the exercise's reference, and **Expected from the Reference** fills a vectors test's outputs from
  it: the teacher writes only the rows' inputs.

In detail:

- **Reference from the Project and Expected from the Reference (#3831, part of #3191):** `core/grade-author.js`.
  - `projectReference`: the project's design as the exercise's reference. A file inside the exercise's folder is listed
    by its path, so it follows the design as the teacher edits it. A drawing's HDL, or a file outside the folder, is
    written in.
  - `expectedFromReference`: a vectors test's rows filled with the reference's outputs. The inputs, the comments and
    the header stay as written. Each output keeps its column's style (decimal by default, binary, `0x…`), and an X or
    Z of the reference is `-`.
  - Both are in the Exercise document's ⋮ menu, with Portuguese labels, and in the MCP server's `grade` tool
    (`reference`, `expected`). The MCP runs the reference in a grading process (`server/grade.js expectedOf`).
  - Tests: grade-author (the counter's rows against the hand-written ones, then graded; the styles; an X; the
    problems; a drawing's reference), mcp-grade, UI exercise (both interfaces, Portuguese); docs/GRADING.md.
