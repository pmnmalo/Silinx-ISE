# Automatic grading

Silinx grades digital-systems exercises the way Mooshak grades programming ones. A student submits a circuit, the
exercise's tests simulate it, and each test gives a verdict and its points (#3191). There is no judge server:
`silinx grade` does the grading, and adapters fit it into the tools a course already has: GitHub Classroom
([CLASSROOM.md](CLASSROOM.md), #3193).

## The exercise

An exercise is a JSON file, `<name>.exercise.json`. It holds:

- the statement, in English and Portuguese;
- the module the submission makes and its ports;
- what a submission may use;
- the limits;
- the tests.

A file's text can be written inside the exercise (`{ "path", "text" }`) or kept in a file beside it
(`{ "path", "file" }`, read relative to the exercise's folder and never outside it).

```json
{
  "silinxExercise": 1,
  "id": "counter4",
  "title": { "en": "4-bit counter", "pt": "Contador de 4 bits" },
  "statement": { "en": "A 4-bit counter with a synchronous reset and an enable.", "pt": "…" },
  "top": "counter4",
  "ports": [
    { "name": "clk", "dir": "in", "width": 1 }, { "name": "rst", "dir": "in", "width": 1 },
    { "name": "en", "dir": "in", "width": 1 }, { "name": "q", "dir": "out", "width": 4 }
  ],
  "allow": { "languages": ["vhdl", "verilog"], "drawings": ["fsm", "asm", "sch", "tt", "pn"], "primitives": true },
  "limits": { "simNs": 1000000, "steps": 5000000, "seconds": 10, "memoryMb": 256 },
  "reference": { "files": [{ "path": "ref/counter4.vhd", "file": "ref/counter4.vhd" }] },
  "tests": [
    { "id": "count", "visible": true, "points": 30, "kind": "vectors", "clock": "clk", "periodNs": 20,
      "vectors": "rst en | q\n1 0 | 0\n0 1 | 1\n0 1 | 2\n0 0 | 2\n" },
    { "id": "random", "points": 40, "kind": "reference", "clock": "clk", "cycles": 200, "seed": 7,
      "hold": { "rst": ["1", "1"] } },
    { "id": "bench", "points": 20, "kind": "testbench", "top": "tb_counter4", "done": "TB DONE",
      "files": [{ "path": "tb/tb_counter4.v", "file": "tb/tb_counter4.v" }] },
    { "id": "impl", "visible": true, "points": 10, "kind": "synthesis", "latches": false, "luts": 8, "ffs": 4, "slices": 4 }
  ]
}
```

A test is hidden unless it has `"visible": true`. Each test is worth `points` (1 when not given).

### Kinds of test

- **vectors**: one row per cycle, as in Mooshak's input and output files. The first line names the inputs, then a `|`,
  then the outputs. Each row after it gives the inputs' values, a `|`, then the outputs' expected values.
  - A value is written in binary (as many digits as the port is wide, X and Z allowed), as `0x…` or `0b…`, or as a
    decimal number. `-` means don't care: an output that is not compared, or an input that keeps its value. `#`
    starts a comment.
  - With a `clock` (period `periodNs`, 20 ns by default): row k's inputs are applied at k·T while the clock is low,
    the clock rises at k·T + T/2, and the outputs are compared at k·T + 3T/4.
  - Without a clock: the outputs are compared at k·T + T/2.
  - The grader drives the submission's ports itself, so no test bench is involved, and a test works the same whether
    the design is VHDL, Verilog or a drawing.
- **reference**: the exercise's reference design runs on `cycles` cycles of seeded random inputs.
  - `hold` sets inputs for the first cycles, and `fixed` sets them after those.
  - The reference's outputs become the expected rows, and the test runs as a vectors test.
  - Where the reference's output is X or Z, it is not compared.
  - The reference runs on its own: it is never compiled with a submission.
- **testbench**: the teacher's test bench, simulated with the submission. It passes when all of these hold:
  - it reports no error or failure;
  - it prints its `done` message (when it has one) from its own files;
  - the submission does not stop the simulation itself.
- **synthesis**: the open synthesis (Yosys, then Place & Route for the slices) on the exercise's `device` (the
  Basys2's XC3S250E by default), with these requirements:
  - `latches: false`: no latch;
  - `luts`, `ffs` and `slices`: at most that many. The slices need nextpnr's chip database of the device, which the
    release zip leaves out. The grader downloads it once, checks it and keeps it, before a submission runs. Offline, the
    slices are not checked: the report says so, and the other requirements give the verdict;
  - `warnings: false`: no warning from Check Syntax or the synthesis.

- **equivalence**: the submission's top is proved equivalent to the reference design by Verify Equivalence (Yosys's
  SAT solver, #3177). The check covers every input sequence, cycle by cycle from the initial state, up to `depth` clock
  cycles (20 by default, at most 1000), and tries a proof by induction at each depth.
  - Proved, or no difference within the depth: Accepted, and the report says which.
  - A difference: a Wrong Answer, with the first cycle that differs, its outputs, and the inputs that lead to it.
  - A design the check cannot translate: Not Synthesizable.
  - The test reads the reference, so it is never in the student's copy: the teacher's run grades it.

  ```json
  { "id": "same", "points": 20, "kind": "equivalence", "depth": 30 }
  ```

- **check**: the guided labs' step checks (`core/labs-check.js`, #3179: `project`, `file`, `module`, `syntax`,
  `simulate`), as a lab file writes them, in `checks`. The submission passes when every check passes. Otherwise it is a
  Wrong Answer, with the checks' reasons. A lab is an exercise without the grade, so a lab's step can be a graded test.

  ```json
  { "id": "clean", "points": 5, "kind": "check", "checks": [{ "check": "syntax" }, { "check": "file", "path": "src/counter4.vhd", "contains": ["rising_edge"] }] }
  ```

## The verdicts

| Code | Verdict | When |
|------|---------|------|
| AC | Accepted | the test passes |
| WA | Wrong Answer | an output differs: the test, the cycle, the signal, expected and obtained, and the cycles around it (a visible test's report only); a test bench's assertion; a difference from the reference that the equivalence check finds |
| CE | Compile Error | the submission does not compile, a drawing has errors, a listed file is missing |
| IE | Interface Error | the top's ports are not the statement's, no module of that name, a language, a drawing or the primitives the exercise does not allow, a module named like the exercise's test bench |
| NS | Not Synthesizable | the open synthesis rejects the design; a warning where none is allowed |
| LI | Latch Inferred | a latch where none is allowed |
| TLE | Time Limit Exceeded | the test's time, its simulation steps, the delta cycle limit (a combinational loop), the loop iteration limit |
| MLE | Memory Limit Exceeded | the heap of the submission's process |
| RE | Runtime Error | the design's own error stops the simulation ($fatal, an index out of range) |
| RL | Resource / Timing Limit | more LUTs, flip-flops or slices than allowed |
| GE | Grading Error | the grader could not run the test (its setup's fault, not the submission's): the message says why |

A Compile Error or an Interface Error applies to every test. The total is the sum of the Accepted tests' points.

## Running it

```bash
silinx grade counter4.exercise.json submissions/ --csv grades.csv --json grades.json
silinx grade counter4.exercise.json my-project --visible      # a student's run: the visible tests only
silinx grade counter4.exercise.json --student-copy student/counter4.exercise.json
```

- A submission is a project folder (with its `silinx.json`) or a zip. A folder holding several submissions is read as
  one submission per sub-folder or zip.
- A text report goes to stdout. `--csv` writes one row per submission, with each test's verdict and points. `--json`
  writes the full results.
- The exit status is 0 when every submission is Accepted, 2 when one is not, and 1 when the exercise or the command is
  wrong.
- `--student-copy` writes the exercise without its hidden tests and its reference. This copy goes to the students.
- Through MCP, the `grade` tool does the same (run, check, ports, student_copy).

## In the interface

**Project ▸ Exercise…** opens the project's exercise, or makes one with **New Exercise**: its top's ports, and a first
visible test to fill in. A `.exercise.json` opened from the Files opens the same way. The document shows the statement in
the interface's language, the ports, and the tests with their verdicts and points once run.

- **For a student**:
  - **Run Visible Tests** runs the visible tests on the project as it is saved, and the console gives the report.
  - The synthesis tests run in the page too, with the open synthesis that Synthesize uses, and give the same verdicts
    as `silinx grade`.
- **For a teacher**:
  - **Run All Tests** (in the ⋮ menu) runs the hidden tests too.
  - **Ports from the Top** takes the top and its ports from the project's top module, so the teacher's reference
    project states them.
  - **Reference from the Project** (in the ⋮ menu) makes the project's design the exercise's reference.
    - A file inside the exercise's folder is listed by its path (`{ "path", "file" }`), so the reference follows the
      design as the teacher edits it.
    - A drawing's HDL, or a file outside the folder, is written into the exercise.
  - **Expected from the Reference** (in the ⋮ menu) fills the selected vectors test's outputs from the reference. The
    teacher writes only the rows' inputs, such as `rst en | q` then `1 0`, `0 1`, ….
    - The reference runs each row, and its outputs replace whatever the row had after its `|`.
    - The inputs, the comments and the header stay as written.
    - Each output is written in its column's style: decimal when the column has no value yet, binary, or `0x…`.
    - An X or Z of the reference is `-`, not compared.
  - **Add Test** and **Delete Test**, and the **Properties** panel, edit the title, the statement, the top and the
    selected test's settings.

  - **Export Student Copy** (in the ⋮ menu) saves the student's copy of the exercise: no hidden test, no reference,
    and the visible tests' files written in.
  - **Classroom Template…** (in the ⋮ menu) saves the GitHub Classroom assignment's template repository as a zip
    ([CLASSROOM.md](CLASSROOM.md)). Its starter project is made from the statement, in VHDL or Verilog: the top module
    with the statement's ports and an empty body, on the project's board and device.

The MCP server's `grade` tool does each of these (run, ports, reference, expected, student_copy, template, new).

## The example

`exercises/counter4/` is a 4-bit counter with a synchronous reset and an enable. It has:

- its statement;
- visible vectors (`tests/count.vec`);
- a hidden reference (`ref/`) and test bench (`tb/`);
- a synthesis test;
- `starter/`, the project a student starts from.

Its students' copy is `silinx grade exercises/counter4/counter4.exercise.json --student-copy …`.

## Security

A submission is untrusted.

- Only its files are read: inside its folder, no symbolic link, at most 2 MB a file and 20 MB in all (a zip too).
- Each submission is graded in a Node process of its own:
  - Node's permission model limits it to reading Silinx's own files, and it writes none;
  - its heap is limited by `memoryMb`;
  - it is killed when a test runs past `seconds`, and the next test continues in a new process.
- Silinx's simulator interprets the HDL, so nothing native runs.
- `$readmem` and textio see only the submission's own files.
- The reference's expected rows are computed apart, and a run with `--visible` never gets the hidden tests.
- Hidden tests must not be given to the students: give them the `--student-copy`.
