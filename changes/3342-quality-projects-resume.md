In detail:

- **A stopped comparison with ISE keeps the projects it made (#3342):** the weekly comparison's first step (a Silinx project
  per design, about 7 hours) was only reused once it had finished, so a run stopped part-way through it lost everything.
  `run.mjs --sizes <dir> --resume` now marks each design as soon as it is processed (`<dir>/.done/<name>`) and skips the
  ones a run before processed; the workflow keeps the folder of the commit compared and resumes it.
