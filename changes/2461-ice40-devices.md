In short:
- New Project offers the iCE40's LP, HX and UltraPlus devices. Their projects build with the local server, or in the browser where nextpnr-ice40 can be loaded; the boards and the pin planner are still to come.

In detail:
- The iCE40's devices: nine parts in the device data (server/devices-ice40.js), each with its packages, I/O and resources and no speed grades; a new project's constraints are constraints/top.pcf, and Add Source takes a .pcf (#2461).
