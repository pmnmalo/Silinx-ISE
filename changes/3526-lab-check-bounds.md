In short:

- Security: a guided lab's simulation check is bounded, so a lab that comes with a project cannot keep Silinx (or its
  MCP server) busy for good (#3526).

In detail:

- Guided labs, the `simulate` check (#3526, `core/labs-check.js`): a value's `at_ns` is within the limit of `time_ns`
  (1 ms; the lab's problem otherwise, `"values": "at_ns" from 0 to 1000000 ns`), and the check's simulation stops after
  2,000,000 time steps, the check then failing with "the simulation of <top> did not reach N ns in 2000000 time steps
  (it stopped at M ns)". Before, the time came from the largest `at_ns` with no limit, and the simulation ran with no
  bound: the MCP's `lab` check never answered.
