In short:

- In the schematic editor, INV, BUF, BUFE and BUFT are now as wide as the 2-input gates, so a bus width on their output
  no longer sits on the inverter's bubble. Schematics saved before are widened when opened, and their wires follow.

In detail:

- **Schematic editor: INV, BUF and the tri-state buffers 80 px wide (#1988):** core/schdoc-symbols.js draws them as
  wide as the 2-input gates (they were 60 px, BUF_OLD_W), their triangle 34 or 36 px long, so that the output's lead
  has room for its bus width. Document version 7: core/schdoc-upgrade.js's widenBuffers keeps each one's inputs where
  they were and moves its outputs along their leads, and what met them follows: a wire's end, an I/O marker, a net name
  on the lead. A version 2 document has its wires split at the old outputs first, so a wire that crossed an output keeps
  its connection (#678). The generators place the longer inverter too: a truth table's gate schematic
  (core/logic-sch.js) and an ISE schematic's inverted pins (core/isesch-geometry.js). The gates example is saved at
  version 7. Tests: test/tristate.test.js and the schematic tests whose coordinates were the 60 px inverter's.
