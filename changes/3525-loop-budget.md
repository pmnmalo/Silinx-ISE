In short:

- **Loops with no end:** a loop in a constant function (`for i in 0 to integer'high`), nested loops or a
  recursion of millions of calls no longer freeze Check Syntax or the MCP server. Past 4M loop iterations and calls
  in one evaluation there is one error at the loop: "loop iteration limit exceeded: more than 4194304 iterations and
  calls in one evaluation". The MCP's simulate also stops at its timeout_s inside a process that does not wait.

In detail:

- **One budget of iterations per evaluation (#3525):** the interpreter stopped a while or a VHDL loop at 10 million
  iterations, each loop on its own count (about half a minute; nested loops multiplied it). A for over a range and a
  repeat had no bound at all, and a constant function runs while the design is elaborated, before any limit of the
  simulation. The interpreter now counts every loop iteration (for, while, VHDL loop, repeat, a forever that does not
  wait) and every call of a function, procedure or task in one budget. There is one budget per constant evaluated and
  one per run of a process until it waits; nested loops and recursion share it. Past `MAX_ITERATIONS` (2**22, about
  1.5 s; the repository's largest evaluation is 1536) there is one error at the loop, in its file (a package's
  file), reported once: at elaboration by the declaration or the statement, never retried as a constant that is not
  one; in the simulation as the process's error. The message keeps its old start, which the grader reads as Time
  Limit Exceeded. The clock is checked every 65 536 iterations: the MCP's simulate (`runBounded`) gives the
  simulator its deadline, so timeout_s stops a run that never waits. The repository's HDL files and the design corpus
  give the same diagnostics, design checks, synthesis input and simulation as before. Tests: test/loop-budget.test.js
  (VHDL and Verilog: at the budget, one past it and to integer'high; nested loops; a package's function; a recursion
  of many calls; repeat and while; a process's run, and a budget per run; the MCP's set_top, check_syntax and
  simulate with timeout_s).
