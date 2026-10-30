In detail:

- **fsm_detect's messages: the top's name taken as it is (#2157):** `parseDetect` (src/synth-fsm.js) removed the
  top's name from a register's with a regular expression that escaped only `.`, `$` and `\`, so a top named with
  another of a pattern's characters (an escaped Verilog identifier) threw or matched another name. It now compares
  the text itself. Test: test/synth-fsm.test.js.
