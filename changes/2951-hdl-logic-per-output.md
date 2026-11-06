In short:

- **Boolean algebra: the HDL logic chosen per output:** a tick box on each result (canonical SOP and POS, minimal SOP
  and POS, XOR, NAND, NOR, least gates, least delay) sets the logic of that output in the module and the schematic,
  where the toolbar's HDL logic set one for all; a new table starts at least gates. The canonical SOP and POS can be
  generated too.

In detail:

- **The HDL logic per output, a tick box on its results (#2951):** the toolbar's *HDL logic* menu is gone; the result
  ticked is the output's form (`forms` in the table, core/logic-choice.js; the table's `form` for the others). A new
  table or output: the least gates' form; a table saved before keeps its one form on every output, its module the same
  (the traffic example's, checked). New forms: `csop`, `cpos`, the canonical SOP and POS (don't cares left out),
  compiled and simulated in VHDL and Verilog, drawn as a schematic. MCP (#2674): `set_output_logic` sets an output's
  form and / or its minimal solution, as the editor does, and makes the HDL again; the `results` view says each
  output's HDL logic.
