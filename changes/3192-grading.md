In short:

- **Automatic grading:** `silinx grade <exercise> <submissions…>` grades students' circuits on an exercise's tests, as
  Mooshak does for programs: a verdict per test (Accepted, Wrong Answer, Compile Error, Interface Error, Time Limit
  Exceeded, …), the points, a report per student and a CSV over all of them (docs/GRADING.md).

In detail:

- **The exercise format and `silinx grade` (#3192, part of #3191):** an exercise is a `*.exercise.json`
  (core/grade-format.js): its statement in English and Portuguese, its top and ports, what a submission may use, its
  limits and its tests, visible or hidden, each worth its points: vectors (cycle by cycle), a reference design on
  seeded random inputs, the teacher's test bench, the open synthesis's requirements (no latch, at most N LUTs,
  flip-flops or slices), the guided labs' step checks (core/labs-check.js, #3179). core/grade-design.js checks a submission (its drawings' HDL made again from them, its
  interface against the statement), core/grade-sim.js drives its ports and compares, core/grade.js gives the verdicts,
  core/grade-report.js the text report and the CSV. server/grade.js reads submissions (folders or zips, no symbolic
  link, size limits) and grades each in a process of its own (server/grade-run.js: Node's permission model, its heap
  limited, killed past a test's time: Time Limit Exceeded, then the next test in a new process); server/grade-synth.js
  runs the synthesis tests; server/grade-cli.js is `silinx grade` (--visible, --json, --csv, --student-copy). The MCP
  server's `grade` tool (server/mcp-grade.js) does the same, with the exercise's check and its ports from the top.
