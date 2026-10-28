In short:

- **Silinx HLS, files in a test bench:** a test bench reads its data from the project's files and compares its results
  with a golden file (`fopen`, `fprintf`, `fscanf`, `fclose`, `system("diff …")`) in the C simulation, in the browser
  edition too; code under `#ifndef __SYNTHESIS__` (a trace file written by the top function) runs only in the C
  simulation.

In detail:

- **Silinx HLS: `__SYNTHESIS__` and a test bench's files (#1897):** the synthesis defines `__SYNTHESIS__`, as Vitis
  HLS's; the code only the C simulation compiles (`#ifndef __SYNTHESIS__`) is checked as the test bench's, even inside
  the top function, so AMD's hier_func example's trace files (a `FILE *` in the top) pass the C simulation, the
  synthesis and the co-simulation (the HLS corpus: 50 designs through co-simulation). `sprintf` / `snprintf` into a
  char array, a char array's string for `fopen`, `%s`, `system`; `sizeof` of an array variable all its elements. The
  app's C Simulation and C/RTL Co-simulation give the test bench the project's files its strings name, in memory
  (never a file outside the project: an absolute path or one through `..` refused with a message, in `fopen` and
  `diff`), and list the files it wrote (kept in memory). A `FILE` in the synthesized code
  is refused with a clear message (the test bench's; `#ifndef __SYNTHESIS__`).
