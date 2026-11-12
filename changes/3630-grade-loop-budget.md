In detail:

- **The grader's hang test after the loop budget (#3630):** a submission that hangs inside one clock edge is still
  Time Limit Exceeded, now for whichever limit the machine reaches first. On a fast machine that is the loop budget
  (#3525): "loop iteration limit exceeded: more than 4194304 iterations and calls in one evaluation … at 10 ns
  (src/counter4.v line 3)", naming the process and the line. On a slower one it is the test's time limit: "the test
  took more than 3 s". test/grade-server.test.js accepts either reason for the hang and checks the budget's exactly.
  A second submission, whose every clock edge stays within the budget, keeps the time limit's reason covered.
