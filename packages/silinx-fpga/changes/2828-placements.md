In detail:

- **The number of nextpnr's placements, for tests (#2828):** the flow's spec takes `placements`, the placements
  nextpnr's Place & Route makes (the fastest kept), in place of the Optimization's (Normal: four for a small design,
  High: eight); the IDE and the command line do not set it.
  - **Tests:** test/power.test.js.
