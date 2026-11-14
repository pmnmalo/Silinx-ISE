In short:

- **Try it on an arrayed instance.** Clicked in the schematic's Try it, an arrayed instance such as `reg(3:0)` lists
  its pins with their values: its copies' bits side by side on a bus pin, a pin left open too, the shared clock and
  enable once.

In detail:

- **Try it on an arrayed instance (#3827, core/schlive.js):** the instance's pins (the Try it panel's list, a pin's
  value) read from its copies `reg_3` … `reg_0`: a pin sliced over the copies, or left open, their values side by side
  (the high end's copy first, as on its bus), a shared one its value. It was found by its name, which no copy has: a
  pin left open had no value.
- **MCP (#3827):** `simulate_drawing` simulates a schematic (`.sch.json`) as its Try it does, with the project's modules:
  per cycle its input markers set and its clock inputs cycled, then its outputs and every module instance's pins (an
  arrayed one's, its copies' values side by side) (server/mcp-simulate-schematic.js).
