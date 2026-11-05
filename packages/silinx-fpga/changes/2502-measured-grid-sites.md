In detail:

- **The device measurements' grid and sites measured too (#2502).** Research only; no change for the toolchain's
  users. `research/s3e-device/build-measured.mjs` rebuilds the Spartan-3E dies' measured descriptions without ISE's
  device report (`grid.mjs`). The tiles are the ones the measurements name, and their types come from their names.
  Their rows and columns follow a rule checked against the report on the four dies. The sites are the ones ISE placed
  or routed to, their types, slots and order by rule, and the VCC sites are named by rule. On the four dies, the
  descriptions keep the same tiles, PIPs, wires, nodes and pins. They leave out only the sites no design can use: the
  unbonded pads, the reserved and configuration sites, and the corners' VCC sites (`compare-grid.mjs`, README section
  16).
  - **Tests:** test/s3e-device.test.js.
