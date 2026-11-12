In detail:

- **The grader's hang test after the loop budget (#3630):** a submission that hangs inside one clock edge is still
  Time Limit Exceeded. Its reason is now the loop budget's (#3525): "loop iteration limit exceeded: more than 4194304
  iterations and calls in one evaluation … at 10 ns (src/counter4.v line 3)", reached at once and naming the process
  and line, instead of "the test took more than 3 s". test/grade-server.test.js expects that reason for the hang, and
  a second submission (each clock edge within the budget, a second or more) keeps the test's time limit covered.
