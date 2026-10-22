In detail:

- **CI: the UI tests' time limit 25 minutes (#912):** the UI tests grew to about 15 minutes in each interface
  (the Tasks interface, the device primitives and wizards, the clipboard), their step's limit; the 15.12.0 release
  CI stopped there after 196 tests that passed. The step's limit is 25 minutes, the job's 30; the UI tests are to
  run in parts, as the unit tests do.
