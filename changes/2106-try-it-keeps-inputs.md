In short:

- The schematic's Try it starts with the switches and bus values of its last run; Reset sets them back to 0.

In detail:

- **Try it keeps the inputs' values (#2106):** stopping a schematic's Try it and starting it again, its input markers
  (switches, bus values) and the bidirectional markers driven from outside have the values they had at the end of the
  last Try it, the circuit settled on them at time 0 and the registers at their initial values; the clocks start at 0.
  The values live in memory, with the open schematic: closing it forgets them. A marker removed, turned into a clock
  or of another width since then starts from 0. Try it's Reset now sets the inputs back to their initial values too
  (0, the bidirectional markers released), with the power cycle as before. core/schlive.js: `inputValues()`,
  `restoreInputs()`, `reset({ inputs: true })`. Tests: test/sch-livesim.test.js, test/inout.test.js,
  test/ui/sch-live-parts.test.js (both interfaces), test/ui/livesim.test.js (Reset).
