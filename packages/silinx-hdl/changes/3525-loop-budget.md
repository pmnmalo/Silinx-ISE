In detail:

- **One budget of iterations per evaluation (#3525):** `MAX_ITERATIONS` (2**22, src/util.js) loop iterations and calls
  per constant evaluated and per run of a process until it waits (`ctx.budget`, `newBudget()`), counted by every loop
  (for, while, loop, repeat, forever) and call. Past it, one error at the loop, in its file: "loop iteration limit
  exceeded: more than 4194304 iterations and calls in one evaluation (a constant, or a process until it waits)". Each
  while or loop had stopped at 10 million on its own, and a for and a repeat never. A simulator's `deadline`, which the
  clock is checked against every 65 536 iterations, stops a run that does not wait (`sim.timedOut`).
