In short:

- **Grading:** a test kind `equivalence` proves the submission equivalent to the exercise's reference with Verify
  Equivalence (Yosys's SAT), for every input sequence. A difference is a Wrong Answer, with the first cycle that differs.

In detail:

- **The equivalence test (Fixes #3217, part of #3191, with #3177):** `{ "kind": "equivalence", "depth": 20 }` in the
  exercise format.
  - core/grade.js runEquivalence: core/verify.js verifyEquivalence on the submission's design and the reference.
    - The two are compiled apart (verifyEquivalence's new referenceSources), since their modules have the same names.
    - Proved, or no difference within the depth: Accepted, said which.
    - A difference: a Wrong Answer, with the first differing cycle's outputs and the inputs that lead to it.
    - A design the check cannot translate: Not Synthesizable.
    - Yosys failing, or giving no result: a Grading Error.
  - The test has the synthesis's limits. It reads the reference, so it is never in the student's copy, and the grading
    process gets the reference only for it.
  - Where it runs: `silinx grade` and the MCP server's grade (the grading process's Yosys), and the Exercise document
    (the page's Yosys, as Verify Equivalence's), whose Properties give the depth.
  - Tests: grade-equivalence (the format; Accepted in Verilog, VHDL and a drawing; Wrong Answer; bounded; Not
    Synthesizable; Grading Error; in the grading process, the hidden test's verdict only), grade, mcp-grade; UI exercise
    in both interfaces; docs/GRADING.md.
