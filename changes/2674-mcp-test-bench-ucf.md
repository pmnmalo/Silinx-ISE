In short:

- An AI assistant (MCP) makes a self-checking test bench as the Test Bench Wizard does (every combination, random,
  counting, walking or given vectors, their expected outputs from the design) and a constraints file on the board's
  pins as the UCF Wizard does.

In detail:

- **MCP: the Test Bench Wizard and the UCF Wizard (#2674):** `test_bench_wizard` writes a test bench of a module
  through core/testbench.js as the wizard does: its clock and reset guessed or given, the vectors generated or
  given, their expected outputs given or taken from a simulation of the design (Fill Expected from Current
  Design), or a skeleton; it reports each mismatch and TEST PASSED / TEST FAILED. `constraints_wizard` writes a UCF
  of a module's ports on the board's pins (assigned by their names and directions, the clock's period), pins
  given overriding them, as the UCF Wizard does. In `server/mcp-test-bench.js` and `server/mcp-wizards.js`. Test:
  test/mcp-test-bench.test.js. A module with a port named done gets a test bench that never ends: #2740.
