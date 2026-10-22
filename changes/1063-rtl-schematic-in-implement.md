In short:

- **The Tasks interface: View RTL Schematic in Implement:** Synthesize's RTL Schematic opens in Implement, where its
  process is, as the Technology Schematic does, not in Design.

In detail:

- **Tasks: the RTL Schematic in Implement (#1063):** `taskOfDoc` (`web/js/tasks.js`) gives `rtl:<module>` documents
  to Implement, as `tech:` ones. Tests: `test/tasks.test.js` (taskOfDoc), `test/ui/tasks.test.js` (#1063: opened
  from Implement's Processes, Implement in front, not among Design's documents; fails on the old code).
