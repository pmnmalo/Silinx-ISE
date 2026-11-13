In short:

- **Arrayed instances in the schematic, as ISE's.** A module's instance named with a range, `reg(3:0)`, is that many
  copies of the module: a pin connected to a bus N times its width takes its bit (or bits) for each copy, one connected
  to a net of its own width is shared. A 4-bit register is drawn as one 1-bit register on the buses `D(3:0)` and
  `Q(3:0)`, its clock and enable shared.

In detail:

- **An arrayed instance (#3755, core/sch-array.js):** its name `base(msb:lsb)` (or `base[msb:lsb]`), accepted by Rename
  and the Properties for a module's instance; the netlist widens its pins on a bus N times as wide (or, alone on a net
  with an arrayed output, makes it one); Check Schematic says a width mismatch as before for any other width, and an error
  for an output shared by the copies. The generated VHDL and Verilog write the copies one by one, `base_i`, each pin its
  slice of the bus (a bus named from another index, or bits of a bus, too); compiled, elaborated and simulated in both.
- **MCP (#3755):** `place_instance` places a module's instance in a schematic (with its symbol), arrayed with a range,
  its pins connected to nets by name; its check's errors and warnings said.
